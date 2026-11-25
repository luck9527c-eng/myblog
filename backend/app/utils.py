"""跨模块通用工具：时间格式化/解析、Markdown 摘要、LIKE 转义、标签归一化。

时间口径：全部使用 Asia/Shanghai（东八区）naive 时间，与 MySQL DATETIME / DATE / TIME
列一致；对外 JSON 输出 ``YYYY-MM-DDTHH:mm:ss``（日记 time 输出 ``HH:mm``）。
"""

from __future__ import annotations

import datetime as dt
import re
from zoneinfo import ZoneInfo

try:  # 正常镜像内包含 tzdata；极少数精简镜像缺失时退回固定 +08:00（上海无夏令时）
    SHANGHAI_TZ: dt.tzinfo = ZoneInfo("Asia/Shanghai")
except Exception:  # pragma: no cover - 兜底分支
    SHANGHAI_TZ = dt.timezone(dt.timedelta(hours=8), "Asia/Shanghai")

DATETIME_OUTPUT_FORMAT = "%Y-%m-%dT%H:%M:%S"
DATE_OUTPUT_FORMAT = "%Y-%m-%d"
TIME_OUTPUT_FORMAT = "%H:%M"

# 写入时兼容的三种写法（额外兼容带毫秒/带时区后缀的 ISO 串）
_DATETIME_INPUT_FORMATS = (
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
)
_TIME_INPUT_FORMATS = ("%H:%M:%S", "%H:%M")

LIKE_ESCAPE = "\\"

_FENCE_RE = re.compile(r"```.*?```", re.S)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_INLINE_CODE_RE = re.compile(r"`([^`]*)`")
_MARKDOWN_TOKEN_RE = re.compile(r"[#>*_~`]+")
_WHITESPACE_RE = re.compile(r"\s+")


# ---------------------------------------------------------------------------
# 当前时间
# ---------------------------------------------------------------------------
def now_local() -> dt.datetime:
    """当前上海时间（naive，微秒归零以匹配 MySQL DATETIME 精度）。"""
    return dt.datetime.now(SHANGHAI_TZ).replace(tzinfo=None, microsecond=0)


def today_local() -> dt.date:
    return now_local().date()


# ---------------------------------------------------------------------------
# 输出格式化
# ---------------------------------------------------------------------------
def fmt_datetime(value: object) -> str:
    """DATETIME -> ``YYYY-MM-DDTHH:mm:ss``。"""
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        return value.strftime(DATETIME_OUTPUT_FORMAT)
    if isinstance(value, dt.date):
        return value.strftime(DATE_OUTPUT_FORMAT) + "T00:00:00"
    if isinstance(value, str):
        return value.replace(" ", "T")[:19]
    raise TypeError(f"无法格式化为时间：{value!r}")


def fmt_date(value: object) -> str:
    """DATE -> ``YYYY-MM-DD``。"""
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        return value.strftime(DATE_OUTPUT_FORMAT)
    if isinstance(value, dt.date):
        return value.strftime(DATE_OUTPUT_FORMAT)
    if isinstance(value, str):
        return value[:10]
    raise TypeError(f"无法格式化为日期：{value!r}")


def fmt_time(value: object) -> str:
    """TIME -> ``HH:mm``。

    MySQL 的 TIME 列经 aiomysql/PyMySQL 读回可能是 ``datetime.time`` 或
    ``datetime.timedelta``，这里两种都兼容。
    """
    if value is None:
        return "00:00"
    if isinstance(value, dt.timedelta):
        total_seconds = int(value.total_seconds()) % 86400
        hours, remainder = divmod(total_seconds, 3600)
        minutes = remainder // 60
        return f"{hours:02d}:{minutes:02d}"
    if isinstance(value, dt.datetime):
        return value.strftime(TIME_OUTPUT_FORMAT)
    if isinstance(value, dt.time):
        return value.strftime(TIME_OUTPUT_FORMAT)
    if isinstance(value, str):
        return value[:5]
    raise TypeError(f"无法格式化为时间：{value!r}")


# ---------------------------------------------------------------------------
# 输入解析（写入时兼容多种写法）
# ---------------------------------------------------------------------------
def _to_naive_shanghai(value: dt.datetime) -> dt.datetime:
    if value.tzinfo is not None:
        value = value.astimezone(SHANGHAI_TZ).replace(tzinfo=None)
    return value.replace(microsecond=0)


def parse_datetime_local(value: object) -> dt.datetime:
    """把前端传入的本地时间解析成 naive 上海时间。

    支持 ``YYYY-MM-DDTHH:mm``、``YYYY-MM-DDTHH:mm:ss``、``YYYY-MM-DD HH:mm``、
    ``YYYY-MM-DD HH:mm:ss``，以及带毫秒/时区后缀的 ISO 8601 串。
    """
    if isinstance(value, dt.datetime):
        return _to_naive_shanghai(value)
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min)
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("时间不能为空")
    for pattern in _DATETIME_INPUT_FORMATS:
        try:
            return dt.datetime.strptime(raw, pattern)
        except ValueError:
            continue
    try:
        return _to_naive_shanghai(dt.datetime.fromisoformat(raw))
    except ValueError:
        raise ValueError(
            "时间格式不正确，应为 YYYY-MM-DDTHH:mm、YYYY-MM-DDTHH:mm:ss 或 YYYY-MM-DD HH:mm(:ss)"
        ) from None


def parse_date_local(value: object) -> dt.date:
    """把 ``YYYY-MM-DD`` 解析为 ``datetime.date``（容忍带时间部分的输入）。"""
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("日期不能为空")
    try:
        return dt.date.fromisoformat(raw[:10])
    except ValueError:
        raise ValueError("日期格式不正确，应为 YYYY-MM-DD") from None


def parse_time_local(value: object) -> dt.time | None:
    """把 ``HH:mm`` / ``HH:mm:ss`` 解析为 ``datetime.time``；空值返回 None。"""
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.time().replace(microsecond=0)
    if isinstance(value, dt.time):
        return value.replace(microsecond=0)
    raw = str(value).strip()
    if not raw:
        return None
    for pattern in _TIME_INPUT_FORMATS:
        try:
            return dt.datetime.strptime(raw, pattern).time()
        except ValueError:
            continue
    try:
        return dt.time.fromisoformat(raw)
    except ValueError:
        raise ValueError("时间格式不正确，应为 HH:mm 或 HH:mm:ss") from None


# ---------------------------------------------------------------------------
# 摘要 / 标签 / LIKE
# ---------------------------------------------------------------------------
def derive_excerpt(content: str, limit: int = 90) -> str:
    """从 Markdown 正文提取纯文本前 ``limit`` 个字，作为缺省摘要。"""
    if not content:
        return ""
    text = _FENCE_RE.sub(" ", content)
    text = _IMAGE_RE.sub(" ", text)
    text = _LINK_RE.sub(r"\1", text)
    text = _INLINE_CODE_RE.sub(r"\1", text)
    text = _HTML_TAG_RE.sub(" ", text)
    text = _MARKDOWN_TOKEN_RE.sub(" ", text)
    text = text.replace("-", " ")
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text[:limit]


def escape_like(value: str) -> str:
    """转义 LIKE 通配符（配合 ``LIKE ... ESCAPE '\\\\'`` 使用）。"""
    return str(value).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def like_pattern(value: str) -> str:
    return f"%{escape_like(value)}%"


def normalize_tag_name(value: str) -> str:
    """去空白、去前导 ``#``。"""
    name = str(value or "").strip()
    while name.startswith("#"):
        name = name[1:].strip()
    return name


def normalize_tag_list(values: object) -> list[str]:
    """标签归一化：去空、去前导 ``#``、按出现顺序去重（大小写不敏感）。"""
    if not values:
        return []
    if isinstance(values, str):
        candidates: list[object] = [values]
    else:
        candidates = list(values)  # type: ignore[arg-type]
    result: list[str] = []
    seen: set[str] = set()
    for raw in candidates:
        if raw is None:
            continue
        name = normalize_tag_name(str(raw))
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(name)
    return result
