"""首次初始化脚本（幂等，容器启动时由 entrypoint.sh 调用）。

行为：
1. ``site_settings`` 中不存在 ``id=1`` 时，用环境变量 ``ADMIN_INIT_PASSWORD`` 初始化管理员密码；
   环境变量缺失则报错退出（退出码 1），绝不写入任何硬编码默认密码。
2. ``categories`` 表为空时插入 3 个默认分类（工程实践 / 产品与设计 / 随笔与思考）。
3. 其余情况一律跳过，可重复执行。

用法：``python -m app.seed``（需先执行 ``alembic upgrade head``）
"""

from __future__ import annotations

import asyncio
import logging
import sys

from sqlalchemy import func, select

from .config import get_settings
from .database import SessionLocal, engine
from .models import Category, SiteSetting
from .security import hash_password
from .utils import now_local

logger = logging.getLogger("blog.seed")

#: 默认分类（颜色取自前端原型）
DEFAULT_CATEGORIES: tuple[dict[str, object], ...] = (
    {"name": "工程实践", "description": "代码、架构与工程效率", "dot_color": "#3b82f6", "sort_order": 0},
    {"name": "产品与设计", "description": "产品思考、交互与设计", "dot_color": "#10b981", "sort_order": 1},
    {"name": "随笔与思考", "description": "日常记录与零散想法", "dot_color": "#f59e0b", "sort_order": 2},
)

#: 首次初始化时的站点默认文案（不含任何密钥，密码只来自 ADMIN_INIT_PASSWORD）
DEFAULT_SITE = {
    "blog_title": "我的数字花园",
    "blog_subtitle": "记录工程、产品与生活",
    "author_name": "站长",
    "author_handle": "@admin",
    "author_avatar": "",
    "author_bio": "写代码，也写字。",
    "author_location": "",
    "author_email": "",
    "about_content": (
        "# 关于我\n\n"
        "这里是「关于自己 / 个人简历」的正文，支持 Markdown。\n\n"
        "> 可在管理后台「站点设置」中随时修改。\n"
    ),
}


async def seed() -> None:
    """幂等初始化；无论成功或提前退出都先释放连接池再返回。"""
    try:
        await _seed_once()
    finally:
        await engine.dispose()


async def _seed_once() -> None:
    settings = get_settings()

    async with SessionLocal() as session:
        settings_row = await session.get(SiteSetting, 1)
        if settings_row is None:
            init_password = (settings.admin_init_password or "").strip()
            if not init_password:
                print(
                    "[seed] 错误：site_settings 尚未初始化，且环境变量 ADMIN_INIT_PASSWORD 未设置。\n"
                    "[seed] 请在 .env / compose 环境中提供 ADMIN_INIT_PASSWORD 后重试。",
                    file=sys.stderr,
                )
                raise SystemExit(1)
            session.add(
                SiteSetting(
                    id=1,
                    blog_title=DEFAULT_SITE["blog_title"],
                    blog_subtitle=DEFAULT_SITE["blog_subtitle"],
                    author_name=DEFAULT_SITE["author_name"],
                    author_handle=DEFAULT_SITE["author_handle"],
                    author_avatar=DEFAULT_SITE["author_avatar"],
                    author_bio=DEFAULT_SITE["author_bio"],
                    author_location=DEFAULT_SITE["author_location"],
                    author_email=DEFAULT_SITE["author_email"],
                    about_content=DEFAULT_SITE["about_content"],
                    admin_password_hash=hash_password(init_password),
                    token_version=1,
                    updated_at=now_local(),
                )
            )
            print("[seed] site_settings 已初始化（管理员密码取自 ADMIN_INIT_PASSWORD）")
        else:
            print("[seed] site_settings 已存在，跳过初始化")

        category_count = int(await session.scalar(select(func.count(Category.id))) or 0)
        if category_count == 0:
            created_at = now_local()
            for item in DEFAULT_CATEGORIES:
                session.add(Category(created_at=created_at, **item))
            print(f"[seed] 已插入 {len(DEFAULT_CATEGORIES)} 个默认分类")
        else:
            print(f"[seed] categories 已有 {category_count} 条记录，跳过初始化")

        await session.commit()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(seed())
    print("[seed] 完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
