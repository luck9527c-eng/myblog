"""文章：公开列表 / 归档 / 详情 prev-next / 管理端 CRUD 与标签关联。"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import text

from helpers import create_article, create_category, local_iso
from app import database


async def _count_article_tags(article_id: str) -> int:
    async with database.SessionLocal() as session:
        value = await session.scalar(
            text("SELECT COUNT(*) FROM article_tags WHERE article_id = :article_id"),
            {"article_id": int(article_id)},
        )
    return int(value or 0)


# ---------------------------------------------------------------------------
# 公开列表 / 分页 / 检索
# ---------------------------------------------------------------------------
async def test_articles_page_wrapper_and_pagination(client: AsyncClient, admin_client: AsyncClient) -> None:
    for index in range(3):
        await create_article(admin_client, title=f"文章 {index}", publishedAt=local_iso(days=-index - 1))

    response = await client.get("/api/articles", params={"page": 1, "page_size": 2})
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"items", "total", "page", "pageSize"}
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["pageSize"] == 2
    assert len(body["items"]) == 2

    second = await client.get("/api/articles", params={"page": 2, "page_size": 2})
    assert len(second.json()["items"]) == 1

    # page_size 超过 100 时按 100 返回（不报错）
    clamped = await client.get("/api/articles", params={"page_size": 1000})
    assert clamped.json()["pageSize"] == 100


async def test_article_item_fields(client: AsyncClient, admin_client: AsyncClient) -> None:
    category = await create_category(admin_client, name="工程实践", dotColor="#3b82f6")
    await create_article(
        admin_client,
        title="字段检查",
        categoryId=category["id"],
        tags=["#Python", "  ", "Python", "MySQL"],
        publishedAt="2026-11-25T10:30",
    )

    response = await client.get("/api/articles")
    item = response.json()["items"][0]
    assert set(item.keys()) == {
        "id",
        "title",
        "excerpt",
        "content",
        "categoryId",
        "tags",
        "publishedAt",
        "status",
        "pinned",
        "createdAt",
        "updatedAt",
    }
    assert isinstance(item["id"], str)
    assert item["categoryId"] == category["id"]
    assert item["tags"] == ["Python", "MySQL"]  # 去空、去 #、去重、保持出现顺序
    assert item["publishedAt"] == "2026-11-25T10:30:00"
    assert item["pinned"] is False
    assert item["status"] == "published"
    assert len(item["excerpt"]) <= 90
    assert item["excerpt"].startswith("标题")


async def test_article_search_and_tag_filter(client: AsyncClient, admin_client: AsyncClient) -> None:
    await create_article(admin_client, title="Tailwind 实践", content="样式方案", tags=["Tailwind"])
    await create_article(admin_client, title="Python 异步", content="asyncio", tags=["Python"])
    await create_article(admin_client, title="无关内容", content="随便写写", tags=["杂记"])

    by_title = await client.get("/api/articles", params={"q": "Tailwind"})
    assert by_title.json()["total"] == 1
    assert by_title.json()["items"][0]["title"] == "Tailwind 实践"

    # q 也能命中正文
    by_tag_keyword = await client.get("/api/articles", params={"q": "asyncio"})
    assert by_tag_keyword.json()["total"] == 1

    by_tag = await client.get("/api/articles", params={"tag": "Python"})
    assert by_tag.json()["total"] == 1
    assert by_tag.json()["items"][0]["title"] == "Python 异步"

    # LIKE 通配符被转义，不会全量命中
    wildcard = await client.get("/api/articles", params={"q": "%"})
    assert wildcard.json()["total"] == 0


async def test_category_filter(client: AsyncClient, admin_client: AsyncClient) -> None:
    category = await create_category(admin_client, name="产品与设计", dotColor="#10b981")
    other = await create_category(admin_client, name="随笔与思考", dotColor="#f59e0b")
    await create_article(admin_client, title="属于产品", categoryId=category["id"])
    await create_article(admin_client, title="属于随笔", categoryId=other["id"])

    response = await client.get("/api/articles", params={"category_id": category["id"]})
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["title"] == "属于产品"

    # 非法 category_id -> 400
    bad = await client.get("/api/articles", params={"category_id": "abc"})
    assert bad.status_code == 400


async def test_archive_endpoint(client: AsyncClient, admin_client: AsyncClient) -> None:
    first = await create_article(admin_client, title="更早的文章", publishedAt=local_iso(days=-5))
    second = await create_article(admin_client, title="更晚的文章", publishedAt=local_iso(days=-1))
    await create_article(admin_client, title="草稿不计入", status="draft")

    response = await client.get("/api/articles/archive")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"items", "total"}
    assert body["total"] == 2
    assert [item["id"] for item in body["items"]] == [second["id"], first["id"]]
    assert set(body["items"][0].keys()) == {"id", "title", "categoryId", "publishedAt", "pinned"}


async def test_article_detail_prev_next(client: AsyncClient, admin_client: AsyncClient) -> None:
    oldest = await create_article(admin_client, title="最早", publishedAt=local_iso(days=-3))
    middle = await create_article(admin_client, title="中间", publishedAt=local_iso(days=-2))
    newest = await create_article(admin_client, title="最新", publishedAt=local_iso(days=-1))

    response = await client.get(f"/api/articles/{middle['id']}")
    assert response.status_code == 200
    detail = response.json()
    # prev = 上一篇（更早），next = 下一篇（更晚）；无则 null
    assert detail["prev"] == {"id": oldest["id"], "title": "最早"}
    assert detail["next"] == {"id": newest["id"], "title": "最新"}

    first_detail = (await client.get(f"/api/articles/{oldest['id']}")).json()
    assert first_detail["prev"] is None
    assert first_detail["next"] == {"id": middle["id"], "title": "中间"}

    last_detail = (await client.get(f"/api/articles/{newest['id']}")).json()
    assert last_detail["next"] is None
    assert last_detail["prev"] == {"id": middle["id"], "title": "中间"}


async def test_article_detail_404(admin_client: AsyncClient, client: AsyncClient) -> None:
    response = await client.get("/api/articles/999999")
    assert response.status_code == 404
    assert response.json() == {"detail": "文章不存在"}


# ---------------------------------------------------------------------------
# 管理端
# ---------------------------------------------------------------------------
async def test_admin_list_includes_drafts_and_filters(admin_client: AsyncClient) -> None:
    draft = await create_article(admin_client, title="草稿", status="draft")
    published = await create_article(admin_client, title="已发布", status="published")

    response = await admin_client.get("/api/admin/articles")
    body = response.json()
    assert set(body.keys()) == {"items", "total"}
    assert body["total"] == 2
    assert {item["id"] for item in body["items"]} == {draft["id"], published["id"]}

    only_drafts = await admin_client.get("/api/admin/articles", params={"status": "draft"})
    assert only_drafts.json()["total"] == 1
    assert only_drafts.json()["items"][0]["id"] == draft["id"]

    searched = await admin_client.get("/api/admin/articles", params={"q": "已发布"})
    assert searched.json()["total"] == 1
    assert searched.json()["items"][0]["id"] == published["id"]

    invalid = await admin_client.get("/api/admin/articles", params={"status": "bad"})
    assert invalid.status_code == 400


async def test_article_excerpt_falls_back_to_content(admin_client: AsyncClient) -> None:
    long_content = "一二三四五六七八九十" * 20
    article = await create_article(admin_client, title="长正文", content=long_content, excerpt="")
    assert len(article["excerpt"]) == 90
    assert article["excerpt"] == long_content[:90]

    with_excerpt = await create_article(admin_client, title="自定义摘要", excerpt="我自己写的摘要")
    assert with_excerpt["excerpt"] == "我自己写的摘要"


async def test_article_update_replaces_tags(admin_client: AsyncClient) -> None:
    article = await create_article(admin_client, title="标签替换", tags=["A", "B"])
    assert article["tags"] == ["A", "B"]

    response = await admin_client.put(
        f"/api/admin/articles/{article['id']}",
        json={
            "title": "标签替换（已更新）",
            "content": "新的正文",
            "tags": ["B", "C"],
            "publishedAt": local_iso(days=-2),
            "status": "draft",
            "pinned": True,
        },
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "标签替换（已更新）"
    assert updated["tags"] == ["B", "C"]
    assert updated["status"] == "draft"
    assert updated["pinned"] is True
    assert updated["publishedAt"] == local_iso(days=-2)

    # 标签 C 自动创建并已挂到文章上
    async with database.SessionLocal() as session:
        names = list(
            (
                await session.scalars(
                    text(
                        "SELECT t.name FROM tags t JOIN article_tags a ON a.tag_id = t.id "
                        "WHERE a.article_id = :article_id ORDER BY t.id"
                    ),
                    {"article_id": int(article["id"])},
                )
            ).all()
        )
    assert names == ["B", "C"]


async def test_article_pin_toggle(admin_client: AsyncClient) -> None:
    article = await create_article(admin_client, title="置顶切换")
    assert article["pinned"] is False

    toggled = await admin_client.patch(f"/api/admin/articles/{article['id']}/pin", json={})
    assert toggled.status_code == 200
    assert toggled.json()["pinned"] is True

    toggled_back = await admin_client.patch(f"/api/admin/articles/{article['id']}/pin")
    assert toggled_back.json()["pinned"] is False

    explicit = await admin_client.patch(f"/api/admin/articles/{article['id']}/pin", json={"pinned": True})
    assert explicit.json()["pinned"] is True


async def test_article_delete_cleans_association_rows(admin_client: AsyncClient) -> None:
    article = await create_article(admin_client, title="待删除", tags=["级联标签", "另一个"])
    assert await _count_article_tags(article["id"]) == 2

    response = await admin_client.delete(f"/api/admin/articles/{article['id']}")
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert await _count_article_tags(article["id"]) == 0

    async with database.SessionLocal() as session:
        remaining = await session.scalar(
            text("SELECT COUNT(*) FROM articles WHERE id = :article_id"), {"article_id": int(article["id"])}
        )
    assert int(remaining or 0) == 0

    # 幂等性：再次删除 -> 404
    again = await admin_client.delete(f"/api/admin/articles/{article['id']}")
    assert again.status_code == 404
    assert again.json() == {"detail": "文章不存在"}


async def test_create_article_with_unknown_category(admin_client: AsyncClient) -> None:
    response = await admin_client.post(
        "/api/admin/articles",
        json={"title": "分类不存在", "content": "正文", "categoryId": "999999"},
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "分类不存在"}


async def test_create_article_validation_errors(admin_client: AsyncClient) -> None:
    empty_title = await admin_client.post("/api/admin/articles", json={"title": "   ", "content": "正文"})
    assert empty_title.status_code == 422
    assert isinstance(empty_title.json()["detail"], str)

    bad_status = await admin_client.post(
        "/api/admin/articles", json={"title": "状态非法", "content": "正文", "status": "archived"}
    )
    assert bad_status.status_code == 422

    missing_content = await admin_client.post("/api/admin/articles", json={"title": "缺正文"})
    assert missing_content.status_code == 422


async def test_published_at_accepts_multiple_formats(admin_client: AsyncClient, client: AsyncClient) -> None:
    cases = {
        "2026-11-25T10:30": "2026-11-25T10:30:00",
        "2026-11-25T10:30:45": "2026-11-25T10:30:45",
        "2026-11-25 10:30": "2026-11-25T10:30:00",
        "2026-11-25 10:30:45": "2026-11-25T10:30:45",
    }
    for raw, expected in cases.items():
        article = await create_article(admin_client, title=f"时间格式 {raw}", publishedAt=raw)
        assert article["publishedAt"] == expected, raw

    detail = await client.get(f"/api/articles/{article['id']}")
    assert detail.json()["publishedAt"] == expected


async def test_admin_article_404s(admin_client: AsyncClient) -> None:
    assert (await admin_client.put(
        "/api/admin/articles/999999",
        json={"title": "x", "content": "y"},
    )).status_code == 404
    assert (await admin_client.patch("/api/admin/articles/999999/pin", json={})).status_code == 404
