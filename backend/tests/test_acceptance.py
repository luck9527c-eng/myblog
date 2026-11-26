"""API_CONTRACT.md §5 的 7 条验收自检（对应 DEVELOPMENT_SPEC.md 第 8 章）。"""

from __future__ import annotations

import datetime as dt

from httpx import AsyncClient

from helpers import create_article, create_diary, local_date, local_iso
from app.utils import now_local


def _parse_local(value: str) -> dt.datetime:
    return dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")


async def test_acceptance_1_admin_endpoints_require_login(client: AsyncClient) -> None:
    """① 未登录访问管理员接口一律 401，且不泄露业务数据。"""
    for path in ("/api/admin/diaries", "/api/admin/articles", "/api/admin/settings"):
        response = await client.get(path)
        assert response.status_code == 401, f"{path} -> {response.status_code} {response.text}"
        body = response.json()
        assert set(body.keys()) == {"detail"}
        assert isinstance(body["detail"], str) and body["detail"]


async def test_acceptance_2_visitors_cannot_see_drafts(client: AsyncClient, admin_client: AsyncClient) -> None:
    """② 访客列表不含草稿；草稿详情 404。"""
    draft = await create_article(admin_client, title="草稿文章", status="draft")
    published = await create_article(admin_client, title="已发布文章")

    response = await client.get("/api/articles")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [published["id"]]
    assert all(item["status"] == "published" for item in body["items"])
    assert draft["id"] not in {item["id"] for item in body["items"]}

    response = await client.get(f"/api/articles/{draft['id']}")
    assert response.status_code == 404
    assert response.json() == {"detail": "文章不存在"}


async def test_acceptance_3_bootstrap_has_no_password_field(client: AsyncClient) -> None:
    """③ bootstrap 响应中绝不包含密码哈希（字符串检查）。"""
    response = await client.get("/api/public/bootstrap")
    assert response.status_code == 200
    raw = response.text
    assert "adminPasswordHash" not in raw
    assert "admin_password_hash" not in raw
    assert "adminPassword" not in raw

    body = response.json()
    assert set(body.keys()) == {"settings", "categories", "tags", "meta"}
    assert set(body["settings"].keys()) == {
        "blogTitle",
        "blogSubtitle",
        "authorName",
        "authorHandle",
        "authorAvatar",
        "authorBio",
        "authorLocation",
        "authorEmail",
        "aboutContent",
        "updatedAt",
    }


async def test_acceptance_4_published_at_defaults_to_shanghai_now(admin_client: AsyncClient) -> None:
    """④ 创建文章不传 publishedAt -> 落库为当前上海时间。"""
    before = now_local()
    article = await create_article(admin_client, title="默认时间文章")
    after = now_local()

    stored = _parse_local(article["publishedAt"])
    assert before <= stored <= after
    # published_at 未传入时与 created_at 取同一个「服务器当前上海时间」
    assert article["publishedAt"] == article["createdAt"]


async def test_acceptance_5_future_article_visible_and_sorted(
    client: AsyncClient, admin_client: AsyncClient
) -> None:
    """⑤ 未来发布时间的已发布文章立刻可见，排在普通近期文章之前、置顶文章之后。"""
    pinned = await create_article(
        admin_client, title="置顶文章", pinned=True, publishedAt=local_iso(days=-10)
    )
    recent = await create_article(admin_client, title="近期文章", publishedAt=local_iso(days=-1))
    future = await create_article(
        admin_client, title="未来文章", status="published", publishedAt=local_iso(days=30)
    )

    response = await client.get("/api/articles")
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    assert ids == [pinned["id"], future["id"], recent["id"]]


async def test_acceptance_6_diary_backfill_persists(admin_client: AsyncClient) -> None:
    """⑥ 前一天补写日记后重新 GET 仍在。"""
    yesterday = local_date(days=-1)
    created = await create_diary(
        admin_client,
        date=yesterday,
        title="补写的日报",
        mood="calm",
        tags=["日报", "复盘"],
        content="## 今日完成\n- 补写昨天的日报",
    )
    assert created["date"] == yesterday
    assert created["tags"] == ["日报", "复盘"]

    response = await admin_client.get("/api/admin/diaries")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == created["id"]
    assert body["items"][0]["date"] == yesterday


async def test_acceptance_7_about_content_update_visible(client: AsyncClient, admin_client: AsyncClient) -> None:
    """⑦ aboutContent 更新后 bootstrap 立即可见。"""
    new_about = "# 新的简历\n\n- 2020 至今：某公司\n- 技能：Python / TypeScript"
    response = await admin_client.put("/api/admin/settings", json={"aboutContent": new_about})
    assert response.status_code == 200
    assert response.json()["aboutContent"] == new_about

    bootstrap = await client.get("/api/public/bootstrap")
    assert bootstrap.status_code == 200
    assert bootstrap.json()["settings"]["aboutContent"] == new_about


async def test_acceptance_8_author_avatar_update_and_validation(
    client: AsyncClient, admin_client: AsyncClient
) -> None:
    """⑧ 博客头像更新、恢复默认与非法协议校验。"""
    avatar_url = "/uploads/2026/11/avatar-demo.png"
    res = await admin_client.put("/api/admin/settings", json={"authorAvatar": avatar_url})
    assert res.status_code == 200
    assert res.json()["authorAvatar"] == avatar_url

    bootstrap = await client.get("/api/public/bootstrap")
    assert bootstrap.status_code == 200
    assert bootstrap.json()["settings"]["authorAvatar"] == avatar_url

    bad = await admin_client.put("/api/admin/settings", json={"authorAvatar": "javascript:alert(1)"})
    assert bad.status_code == 422

    cleared = await admin_client.put("/api/admin/settings", json={"authorAvatar": ""})
    assert cleared.status_code == 200
    assert cleared.json()["authorAvatar"] == ""
