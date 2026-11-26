"""pytest 公共夹具。

* 数据库：真实 MySQL，连接串取自环境变量 ``TEST_DATABASE_URL``（缺省时回退读 ``backend/.env``）。
* 建表：用 ``alembic upgrade head`` 建立（顺带验证迁移脚本本身），每个用例前清空业务数据。
* 客户端：``httpx.AsyncClient(transport=ASGITransport(app=app))`` 直连 FastAPI，不启动服务器。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TESTS_ROOT = Path(__file__).resolve().parent
for path in (str(BACKEND_ROOT), str(TESTS_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)


def _read_dotenv() -> dict[str, str]:
    env_path = BACKEND_ROOT / ".env"
    if not env_path.exists():
        return {}
    from dotenv import dotenv_values

    return {key: value for key, value in dotenv_values(env_path).items() if value is not None}


_FILE_ENV = _read_dotenv()

TEST_DATABASE_URL = (os.environ.get("TEST_DATABASE_URL") or _FILE_ENV.get("TEST_DATABASE_URL") or "").strip()
if not TEST_DATABASE_URL:
    pytest.exit(
        "未设置 TEST_DATABASE_URL，且 backend/.env 中也没有该变量。\n"
        "示例：$env:TEST_DATABASE_URL='mysql+aiomysql://user:pw@127.0.0.1:3306/personal_blog_test?charset=utf8mb4'",
        returncode=2,
    )

# 必须在导入 app.* 之前设定，config.get_settings() 是进程内缓存
os.environ["TEST_DATABASE_URL"] = TEST_DATABASE_URL
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = (
    os.environ.get("JWT_SECRET") or _FILE_ENV.get("JWT_SECRET") or "pytest-only-jwt-secret-0123456789abcdef"
)
os.environ["ADMIN_INIT_PASSWORD"] = os.environ.get("ADMIN_INIT_PASSWORD") or "pytest-init-password"
os.environ["BCRYPT_ROUNDS"] = "4"  # 测试加速
os.environ["DB_USE_NULL_POOL"] = "true"  # 测试用：不复用连接
os.environ["COOKIE_SECURE"] = "false"
os.environ["SESSION_TTL_HOURS"] = "24"
os.environ["LOGIN_RATE_LIMIT_MAX"] = "10"
os.environ["LOGIN_RATE_LIMIT_WINDOW"] = "60"

import pytest_asyncio  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config as AlembicConfig  # noqa: E402
from httpx import AsyncClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from helpers import (  # noqa: E402
    MANAGED_TABLES,
    TEST_PASSWORD,
    TEST_PASSWORD_HASH,
    login,
    new_client,
)

from app import database  # noqa: E402
from app.models import SiteSetting  # noqa: E402
from app.security import login_rate_limiter  # noqa: E402
from app.utils import now_local  # noqa: E402

_DROP_TABLES = (*MANAGED_TABLES, "alembic_version")


def _sync_url(url: str) -> str:
    for prefix in ("mysql+aiomysql://", "mysql+asyncmy://"):
        if url.startswith(prefix):
            return "mysql+pymysql://" + url[len(prefix):]
    return url


@pytest.fixture(scope="session", autouse=True)
def prepare_schema() -> None:
    """用 alembic 从零建表（先物理删表，保证每次运行都是干净 schema）。"""
    cfg = AlembicConfig(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))

    engine = create_engine(_sync_url(TEST_DATABASE_URL), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
            for table in _DROP_TABLES:
                connection.execute(text(f"DROP TABLE IF EXISTS `{table}`"))
            connection.execute(text("SET FOREIGN_KEY_CHECKS = 1"))
        command.upgrade(cfg, "head")
    finally:
        engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def reset_state() -> None:
    """每个用例前：清空业务数据、清空登录限流计数、写入一条已知的管理员配置。"""
    login_rate_limiter.reset_all()

    async with database.engine.begin() as connection:
        await connection.execute(text("SET FOREIGN_KEY_CHECKS = 0"))
        for table in MANAGED_TABLES:
            await connection.execute(text(f"DELETE FROM `{table}`"))
        await connection.execute(text("SET FOREIGN_KEY_CHECKS = 1"))

    async with database.SessionLocal() as session:
        session.add(
            SiteSetting(
                id=1,
                blog_title="测试博客",
                blog_subtitle="记录与思考",
                author_name="测试作者",
                author_handle="@tester",
                author_avatar="",
                author_bio="这是测试简介",
                author_location="上海",
                author_email="tester@example.com",
                about_content="# 关于我\n\n这是初始简历内容。",
                admin_password_hash=TEST_PASSWORD_HASH,
                token_version=1,
                updated_at=now_local(),
            )
        )
        await session.commit()

    yield


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """未登录的访客客户端。"""
    async with new_client() as async_client:
        yield async_client


@pytest_asyncio.fixture
async def admin_client() -> AsyncClient:
    """已登录的管理员客户端（独立 cookie jar，不影响 client 夹具）。"""
    async with new_client() as async_client:
        response = await login(async_client, TEST_PASSWORD)
        assert response.status_code == 200, response.text
        assert response.json() == {"isAdmin": True}
        yield async_client
