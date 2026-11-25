"""分类与标签：唯一约束、删除规则、重命名/合并/移除。"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import text

from helpers import create_article, create_category
from app import database


async def _tag_count() -> int:
    async with database.SessionLocal() as session:
        return int(await session.scalar(text("SELECT COUNT(*) FROM tags")) or 0)


async def _links_count() -> int:
    async with database.SessionLocal() as session:
        return int(await session.scalar(text("SELECT COUNT(*) FROM article_tags")) or 0)


# ---------------------------------------------------------------------------
# 分类
# ---------------------------------------------------------------------------
async def test_create_category_and_duplicate_name(admin_client: AsyncClient) -> None:
    category = await create_category(admin_client, name="工程实践", dotColor="#3b82f6", sortOrder=1)
    assert category["name"] == "工程实践"
    assert category["dotColor"] == "#3b82f6"
    assert category["sortOrder"] == 1
    assert category["articleCount"] == 0
    assert isinstance(category["id"], str)

    duplicate = await admin_client.post("/api/admin/categories", json={"name": "工程实践"})
    assert duplicate.status_code == 400
    assert duplicate.json() == {"detail": "分类名称已存在"}


async def test_update_category(admin_client: AsyncClient) -> None:
    category = await create_category(admin_client, name="旧名字")
    await create_category(admin_client, name="占用中的名字")

    updated = await admin_client.put(
        f"/api/admin/categories/{category['id']}",
        json={"name": "新名字", "description": "更新后的简介", "dotColor": "#abcdef", "sortOrder": 9},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "新名字"
    assert body["description"] == "更新后的简介"
    assert body["dotColor"] == "#abcdef"
    assert body["sortOrder"] == 9

    conflict = await admin_client.put(
        f"/api/admin/categories/{category['id']}", json={"name": "占用中的名字"}
    )
    assert conflict.status_code == 400
    assert conflict.json() == {"detail": "分类名称已存在"}

    missing = await admin_client.put("/api/admin/categories/999999", json={"name": "x"})
    assert missing.status_code == 404


async def test_delete_category_with_articles_is_blocked(admin_client: AsyncClient) -> None:
    category = await create_category(admin_client, name="有文章的分类")
    await create_article(admin_client, title="文章 A", categoryId=category["id"])

    response = await admin_client.delete(f"/api/admin/categories/{category['id']}")
    assert response.status_code == 400
    assert response.json() == {"detail": "该分类下仍有 1 篇文章，请先迁移"}


async def test_delete_last_category_is_blocked(admin_client: AsyncClient) -> None:
    category = await create_category(admin_client, name="唯一分类")

    response = await admin_client.delete(f"/api/admin/categories/{category['id']}")
    assert response.status_code == 400
    assert response.json() == {"detail": "至少保留一个分类"}


async def test_delete_category_success(admin_client: AsyncClient) -> None:
    keep = await create_category(admin_client, name="保留分类")
    removable = await create_category(admin_client, name="可删除分类")

    response = await admin_client.delete(f"/api/admin/categories/{removable['id']}")
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    bootstrap = await admin_client.get("/api/public/bootstrap")
    names = [item["name"] for item in bootstrap.json()["categories"]]
    assert names == ["保留分类"]
    assert keep["id"] in [item["id"] for item in bootstrap.json()["categories"]]

    assert (await admin_client.delete(f"/api/admin/categories/{removable['id']}")).status_code == 404


async def test_bootstrap_category_and_tag_counts(client: AsyncClient, admin_client: AsyncClient) -> None:
    category = await create_category(admin_client, name="工程实践", dotColor="#3b82f6")
    await create_category(admin_client, name="随笔与思考", dotColor="#f59e0b")
    await create_article(admin_client, title="已发布 1", categoryId=category["id"], tags=["Tailwind", "Python"])
    await create_article(admin_client, title="已发布 2", categoryId=category["id"], tags=["Python"])
    await create_article(admin_client, title="草稿", categoryId=category["id"], status="draft", tags=["草稿标签"])

    body = (await client.get("/api/public/bootstrap")).json()
    categories = {item["name"]: item for item in body["categories"]}
    assert categories["工程实践"]["articleCount"] == 2  # 只统计已发布
    assert categories["随笔与思考"]["articleCount"] == 0
    assert body["meta"] == {"articleCount": 2, "categoryCount": 2}

    tags = {item["name"]: item["count"] for item in body["tags"]}
    assert tags == {"Python": 2, "Tailwind": 1}  # 草稿标签不计入


# ---------------------------------------------------------------------------
# 标签
# ---------------------------------------------------------------------------
async def test_rename_tag(admin_client: AsyncClient) -> None:
    article = await create_article(admin_client, title="标签重命名", tags=["React"])
    await create_article(admin_client, title="另一篇", tags=["React"])

    response = await admin_client.patch("/api/admin/tags/React", json={"newName": "React 19"})
    assert response.status_code == 200
    assert response.json() == {"ok": True, "name": "React 19", "merged": False, "affected": 2}

    detail = await admin_client.get(f"/api/admin/articles")
    titles = {item["id"]: item["tags"] for item in detail.json()["items"]}
    assert titles[article["id"]] == ["React 19"]

    missing = await admin_client.patch("/api/admin/tags/不存在的标签", json={"newName": "x"})
    assert missing.status_code == 404
    assert missing.json() == {"detail": "标签不存在"}


async def test_rename_tag_merges_into_existing(admin_client: AsyncClient) -> None:
    first = await create_article(admin_client, title="文章 1", tags=["React"])
    second = await create_article(admin_client, title="文章 2", tags=["React 19"])
    third = await create_article(admin_client, title="文章 3", tags=["React", "React 19"])

    tags_before = await _tag_count()
    assert tags_before == 2

    response = await admin_client.patch("/api/admin/tags/React", json={"newName": "React 19"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["name"] == "React 19"
    assert body["merged"] is True
    # affected = 实际被迁移的关联数（文章 1 迁移成功，文章 3 已经是同一标签被去重）
    assert body["affected"] == 1

    assert await _tag_count() == 1
    # 文章 3 的重复关联被去掉，只剩一条
    assert await _links_count() == 3

    listing = (await admin_client.get("/api/admin/articles")).json()["items"]
    by_id = {item["id"]: item["tags"] for item in listing}
    assert by_id[first["id"]] == ["React 19"]
    assert by_id[second["id"]] == ["React 19"]
    assert by_id[third["id"]] == ["React 19"]


async def test_rename_tag_only_case_change(admin_client: AsyncClient) -> None:
    await create_article(admin_client, title="大小写", tags=["react"])

    response = await admin_client.patch("/api/admin/tags/react", json={"newName": "React"})
    assert response.status_code == 200
    assert response.json() == {"ok": True, "name": "React", "merged": False, "affected": 1}

    listing = (await admin_client.get("/api/admin/articles")).json()["items"]
    assert listing[0]["tags"] == ["React"]


async def test_delete_tag(admin_client: AsyncClient, client: AsyncClient) -> None:
    article = await create_article(admin_client, title="删除标签", tags=["待移除", "保留"])

    response = await admin_client.delete("/api/admin/tags/待移除")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "affected": 1}

    listing = (await admin_client.get("/api/admin/articles")).json()["items"]
    assert [item for item in listing if item["id"] == article["id"]][0]["tags"] == ["保留"]
    assert await _links_count() == 1

    bootstrap = (await client.get("/api/public/bootstrap")).json()
    assert [item["name"] for item in bootstrap["tags"]] == ["保留"]

    again = await admin_client.delete("/api/admin/tags/待移除")
    assert again.status_code == 404
    assert again.json() == {"detail": "标签不存在"}
