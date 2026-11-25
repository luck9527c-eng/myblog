"""SQLAlchemy 2.0 async 引擎与 Session（驱动固定为 aiomysql）。"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from .config import get_settings

logger = logging.getLogger("blog.database")

_settings = get_settings()

_engine_kwargs: dict = {
    "echo": False,
    "pool_pre_ping": True,
    "future": True,
}

if _settings.db_use_null_pool:
    # 仅测试环境：不复用连接，避免不同事件循环之间共享连接
    _engine_kwargs["poolclass"] = NullPool
else:
    _engine_kwargs.update(pool_recycle=1800, pool_size=10, max_overflow=20)

engine = create_async_engine(_settings.database_url, **_engine_kwargs)

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI 依赖：每个请求一个 Session，请求结束自动关闭（不自动提交）。"""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
