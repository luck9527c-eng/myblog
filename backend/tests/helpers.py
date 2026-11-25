"""测试辅助：客户端构造、登录，以及常用的资源创建快捷方法。"""

from __future__ import annotations

import datetime as dt
from typing import Any

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import hash_password
from app.utils import now_local

#: 测试用管理员密码（每个用例开始时会写入 site_settings）
TEST_PASSWORD = "pytest-admin-pass-123"
TEST_PASSWORD_HASH = hash_password(TEST_PASSWORD)

#: 数据库里由测试自己管理的表（清理时按此顺序 DELETE）
MANAGED_TABLES: tuple[str, ...] = (
    "article_tags",
    "articles",
    "tags",
    "categories",
    "diaries",
    "site_settings",
)


def new_client() -> AsyncClient:
    """直连 FastAPI app 的 httpx 客户端（不启动 uvicorn、不占端口）。"""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


async def login(client: AsyncClient, password: str = TEST_PASSWORD):
    return await client.post("/api/auth/login", json={"password": password})


async def create_article(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "测试文章",
        "content": "# 标题\n\n这是正文内容，用于测试摘要自动截取与检索。",
        "tags": ["测试"],
        "status": "published",
        "pinned": False,
    }
    payload.update(overrides)
    response = await client.post("/api/admin/articles", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


async def create_diary(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "date": now_local().date().isoformat(),
        "time": "09:30",
        "title": "测试日记",
        "mood": "focused",
        "tags": ["日报"],
        "content": "## 今日完成\n- 跑通测试",
    }
    payload.update(overrides)
    response = await client.post("/api/admin/diaries", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


async def create_category(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "测试分类",
        "description": "用于测试",
        "dotColor": "#123456",
        "sortOrder": 5,
    }
    payload.update(overrides)
    response = await client.post("/api/admin/categories", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def local_iso(*, days: int = 0, hour: int = 9, minute: int = 0, seconds: int = 0) -> str:
    """生成相对当前上海时间的 ``YYYY-MM-DDTHH:mm:ss`` 串（测试不依赖真实日期）。"""
    base = (now_local() + dt.timedelta(days=days)).replace(
        hour=hour, minute=minute, second=seconds, microsecond=0
    )
    return base.strftime("%Y-%m-%dT%H:%M:%S")


def local_date(*, days: int = 0) -> str:
    return (now_local() + dt.timedelta(days=days)).date().isoformat()
