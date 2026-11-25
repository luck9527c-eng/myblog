"""Alembic 运行环境。

* 迁移使用同步驱动执行：把 ``mysql+aiomysql://`` 替换为 ``mysql+pymysql://``。
* 数据库地址统一从环境变量 ``DATABASE_URL`` 读取（与 app/config.py 同源）。
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import get_settings
from app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def get_sync_database_url() -> str:
    """把异步驱动 URL 转成同步驱动 URL（alembic 用 pymysql 执行）。"""
    url = get_settings().database_url
    for async_prefix in ("mysql+aiomysql://", "mysql+asyncmy://"):
        if url.startswith(async_prefix):
            return "mysql+pymysql://" + url[len(async_prefix):]
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=get_sync_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=False,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(get_sync_database_url(), poolclass=pool.NullPool, future=True)
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
                compare_server_default=False,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
