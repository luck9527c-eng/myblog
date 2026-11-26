"""应用配置。

全部配置项来自环境变量（pydantic-settings），源码中不硬编码任何密码或密钥。
本地开发可在 ``backend/.env`` 中放置同名变量（该文件已被 .gitignore / .dockerignore 排除，
不会进入镜像）。
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """运行期配置（字段名小写，pydantic-settings 以大小写不敏感方式读取同名环境变量）。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---------------- 必填项（缺失时启动即失败，避免带上不安全的默认值）----------------
    # 例：mysql+aiomysql://blog_app:***@chao_mysql:3306/personal_blog?charset=utf8mb4
    database_url: str = Field(description="DATABASE_URL，必须是 mysql+aiomysql:// 形式")
    # 例：随机 32 位以上字符串
    jwt_secret: str = Field(description="JWT_SECRET，HS256 签名密钥")

    # ---------------- 可选项 ----------------
    # 仅在首次 seed（site_settings 表为空）时用于初始化管理员密码
    admin_init_password: str = Field(default="", description="ADMIN_INIT_PASSWORD")
    # 会话有效期（小时），同时用于 Cookie max_age
    session_ttl_hours: int = 168
    # 部署到 HTTPS 后设为 true
    cookie_secure: bool = False
    # 会话 Cookie 名称，固定为 blog_admin_session
    cookie_name: str = "blog_admin_session"
    # bcrypt 代价因子（测试环境可调小以加速）
    bcrypt_rounds: int = 12
    # 登录限流：窗口内最多失败次数 / 窗口秒数
    login_rate_limit_max: int = 10
    login_rate_limit_window: int = 60
    # 允许跨域的前端来源（逗号分隔）；生产环境同源部署可留空
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # 仅测试使用：禁用连接池（让每个请求独立建连，规避不同事件循环复用连接）
    db_use_null_pool: bool = False
    # 容器内 uvicorn worker 数（由 entrypoint.sh 读取）
    uvicorn_workers: int = 2
    # 图片上传本地保存目录（相对路径基于 backend/ 解析；生产容器传 /data/uploads）
    upload_dir: str = "uploads"
    # 单张上传图片体积上限（MB），建议与 nginx client_max_body_size 保持一致
    max_upload_size_mb: int = 8
    log_level: str = "INFO"

    @field_validator("database_url")
    @classmethod
    def _validate_database_url(cls, value: str) -> str:
        url = (value or "").strip()
        if not url:
            raise ValueError("DATABASE_URL 不能为空")
        if not url.startswith("mysql+aiomysql://"):
            raise ValueError(
                "DATABASE_URL 必须以 mysql+aiomysql:// 开头"
                "（例：mysql+aiomysql://user:pass@host:3306/personal_blog?charset=utf8mb4）"
            )
        return url

    @field_validator("jwt_secret")
    @classmethod
    def _validate_jwt_secret(cls, value: str) -> str:
        secret = (value or "").strip()
        if len(secret) < 16:
            raise ValueError("JWT_SECRET 不能为空且长度至少 16 个字符（建议 32 位随机串）")
        return secret

    @field_validator("bcrypt_rounds")
    @classmethod
    def _validate_bcrypt_rounds(cls, value: int) -> int:
        rounds = int(value)
        if not 4 <= rounds <= 16:
            raise ValueError("BCRYPT_ROUNDS 需在 4-16 之间")
        return rounds

    @field_validator("session_ttl_hours")
    @classmethod
    def _validate_ttl(cls, value: int) -> int:
        hours = int(value)
        if hours <= 0:
            raise ValueError("SESSION_TTL_HOURS 必须大于 0")
        return hours

    @field_validator("max_upload_size_mb")
    @classmethod
    def _validate_upload_mb(cls, value: int) -> int:
        mb = int(value)
        if not 1 <= mb <= 50:
            raise ValueError("MAX_UPLOAD_SIZE_MB 需在 1-50 之间")
        return mb

    @property
    def upload_path(self) -> Path:
        raw = Path((self.upload_dir or "uploads").strip())
        return raw if raw.is_absolute() else (_BACKEND_DIR / raw)

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_size_mb) * 1024 * 1024

    @property
    def cors_origins(self) -> list[str]:
        """解析 CORS_ALLOW_ORIGINS 为列表；为空表示不做跨域放行（同源部署）。"""
        return [item.strip() for item in (self.cors_allow_origins or "").split(",") if item.strip()]

    @property
    def session_max_age(self) -> int:
        return int(self.session_ttl_hours) * 3600


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """进程内单例配置。测试中如修改环境变量需调用 ``get_settings.cache_clear()``。"""
    return Settings()


def settings_summary(settings: Settings | None = None) -> dict[str, Any]:
    """用于启动日志的安全摘要（绝不输出密钥/密码）。"""
    current = settings or get_settings()
    return {
        "database_url": _mask_url(current.database_url),
        "session_ttl_hours": current.session_ttl_hours,
        "cookie_name": current.cookie_name,
        "cookie_secure": current.cookie_secure,
        "uvicorn_workers": current.uvicorn_workers,
        "admin_init_password_configured": bool(current.admin_init_password),
    }


def _mask_url(url: str) -> str:
    """把 URL 中的密码替换为 ***，供日志输出。"""
    if "://" not in url:
        return "***"
    scheme, rest = url.split("://", 1)
    if "@" not in rest:
        return url
    credentials, host = rest.rsplit("@", 1)
    if ":" in credentials:
        user, _password = credentials.split(":", 1)
        return f"{scheme}://{user}:***@{host}"
    return f"{scheme}://***@{host}"
