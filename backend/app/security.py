"""密码哈希、HttpOnly Cookie 会话、登录限流与管理员鉴权依赖。

* 密码哈希：直接调用 ``bcrypt`` 库（不使用 passlib）。
* 会话：PyJWT HS256，payload ``{"sub": "admin", "ver": <token_version>, "exp": <unix ts>}``，
  写入 Cookie ``blog_admin_session``（httponly / samesite=lax / path=/，
  secure 由环境变量 COOKIE_SECURE 控制）。
* 鉴权失败一律 401，且不返回任何业务数据。
"""

from __future__ import annotations

import datetime as dt
import logging
import threading
import time as time_module
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import get_session
from .models import SiteSetting

logger = logging.getLogger("blog.security")

_settings = get_settings()

#: 会话 Cookie 名称（固定值，见 API_CONTRACT.md §0.3）
COOKIE_NAME = _settings.cookie_name
JWT_ALGORITHM = "HS256"
#: bcrypt 只处理前 72 字节，超出部分主动截断以避免不同 bcrypt 版本行为差异
_BCRYPT_MAX_BYTES = 72


# ---------------------------------------------------------------------------
# 密码
# ---------------------------------------------------------------------------
def _password_bytes(password: str) -> bytes:
    return (password or "").encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    """生成 bcrypt 哈希（cost 由 BCRYPT_ROUNDS 控制，默认 12）。"""
    hashed = bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt(rounds=_settings.bcrypt_rounds))
    return hashed.decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """校验密码；哈希非法时返回 False 而不是抛异常。"""
    if not password or not hashed:
        return False
    try:
        return bcrypt.checkpw(_password_bytes(password), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        logger.warning("stored password hash is malformed; treat as mismatch")
        return False


# ---------------------------------------------------------------------------
# JWT / Cookie
# ---------------------------------------------------------------------------
def create_session_token(token_version: int) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload: dict[str, Any] = {
        "sub": "admin",
        "ver": int(token_version),
        "iat": int(now.timestamp()),
        "exp": now + dt.timedelta(hours=int(_settings.session_ttl_hours)),
    }
    return jwt.encode(payload, _settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str | None) -> dict[str, Any] | None:
    """解码并校验签名/过期；失败返回 None（调用方统一转 401）。"""
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            _settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("sub") != "admin":
        return None
    return payload


def token_matches_version(token: str | None, token_version: int) -> bool:
    """签名/过期合法且 ``ver`` 与数据库 token_version 一致才算有效。"""
    payload = decode_session_token(token)
    if payload is None:
        return False
    version = payload.get("ver")
    if not isinstance(version, int):
        return False
    try:
        return version == int(token_version)
    except (TypeError, ValueError):
        return False


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=_settings.session_max_age,
        httponly=True,
        samesite="lax",
        path="/",
        secure=bool(_settings.cookie_secure),
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=bool(_settings.cookie_secure),
    )


# ---------------------------------------------------------------------------
# 鉴权依赖
# ---------------------------------------------------------------------------
def _unauthorized(detail: str = "未登录或登录已过期") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Cookie"},
    )


async def require_admin(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> SiteSetting:
    """管理员鉴权依赖：校验签名 + 过期 + ``ver == site_settings.token_version``。"""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise _unauthorized()
    payload = decode_session_token(token)
    if payload is None:
        raise _unauthorized()
    settings_row = await session.get(SiteSetting, 1)
    if settings_row is None:
        raise _unauthorized()
    if not token_matches_version(token, int(settings_row.token_version)):
        raise _unauthorized()
    return settings_row


async def is_admin_request(request: Request, session: AsyncSession) -> bool:
    """``GET /api/auth/me`` 使用：只判断、不抛 401。"""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return False
    settings_row = await session.get(SiteSetting, 1)
    if settings_row is None:
        return False
    return token_matches_version(token, int(settings_row.token_version))


# ---------------------------------------------------------------------------
# 客户端 IP 与登录限流
# ---------------------------------------------------------------------------
def client_ip(request: Request) -> str:
    """取真实客户端 IP（nginx 反代场景优先读 X-Forwarded-For / X-Real-IP）。"""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


class LoginRateLimiter:
    """进程内滑动窗口限流器：同一 IP 在窗口内最多 N 次失败登录。

    多 worker 部署时每个 worker 各自计数（第一版可接受，见 README 说明）。
    使用 ``threading.Lock`` 保证同一进程内线程安全。
    """

    def __init__(self, max_attempts: int, window_seconds: float) -> None:
        self._max_attempts = max(1, int(max_attempts))
        self._window_seconds = float(window_seconds)
        self._lock = threading.Lock()
        self._failures: dict[str, list[float]] = {}

    def _prune_locked(self, key: str, now: float) -> list[float]:
        hits = [stamp for stamp in self._failures.get(key, []) if now - stamp < self._window_seconds]
        if hits:
            self._failures[key] = hits
        else:
            self._failures.pop(key, None)
        return hits

    def is_blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._prune_locked(key, time_module.monotonic())) >= self._max_attempts

    def register_failure(self, key: str) -> None:
        with self._lock:
            now = time_module.monotonic()
            hits = self._prune_locked(key, now)
            hits.append(now)
            self._failures[key] = hits

    def clear(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def reset_all(self) -> None:
        """仅测试使用：清空全部计数。"""
        with self._lock:
            self._failures.clear()


login_rate_limiter = LoginRateLimiter(
    max_attempts=_settings.login_rate_limit_max,
    window_seconds=_settings.login_rate_limit_window,
)
