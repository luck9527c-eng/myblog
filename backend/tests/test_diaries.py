"""日记 / 每日日报：默认值、时间与心情、排序、筛选、更新与删除。"""

from __future__ import annotations

from httpx import AsyncClient

from helpers import create_diary, local_date
from app.utils import now_local


async def test_create_diary_defaults(admin_client: AsyncClient) -> None:
    today = local_date()
    response = await admin_client.post(
        "/api/admin/diaries",
        json={"date": today, "content": "自由随笔，不写标题也不写时间"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["date"] == today
    assert body["title"] == f"{today} 每日日报"  # 标题留空自动生成
    assert body["mood"] == "focused"  # 默认心情
    assert body["tags"] == []
    assert len(body["time"]) == 5 and body["time"][2] == ":"  # HH:mm
    assert body["createdAt"] == body["createdAt"][:19]
    assert set(body.keys()) == {
        "id",
        "date",
        "time",
        "title",
        "mood",
        "tags",
        "content",
        "createdAt",
        "updatedAt",
    }
    assert isinstance(body["id"], str)


async def test_diary_time_and_mood(admin_client: AsyncClient) -> None:
    created = await create_diary(
        admin_client,
        time="07:05",
        mood="inspired",
        tags=["日报", "复盘", "日报"],  # 去重
    )
    assert created["time"] == "07:05"
    assert created["mood"] == "inspired"
    assert created["tags"] == ["日报", "复盘"]

    with_seconds = await create_diary(admin_client, time="18:30:45")
    assert with_seconds["time"] == "18:30"

    invalid_mood = await admin_client.post(
        "/api/admin/diaries",
        json={"date": local_date(), "content": "x", "mood": "angry"},
    )
    assert invalid_mood.status_code == 422
    assert isinstance(invalid_mood.json()["detail"], str)

    invalid_date = await admin_client.post(
        "/api/admin/diaries", json={"date": "2026/11/25", "content": "x"}
    )
    assert invalid_date.status_code == 422


async def test_diary_list_order_and_filters(admin_client: AsyncClient) -> None:
    older = await create_diary(admin_client, date=local_date(days=-3), time="09:00", title="三天前")
    same_day_morning = await create_diary(admin_client, date=local_date(days=-1), time="08:00", title="昨天早上")
    same_day_evening = await create_diary(admin_client, date=local_date(days=-1), time="20:00", title="昨天晚上")
    future = await create_diary(admin_client, date=local_date(days=2), time="10:00", title="未来的日记")

    listing = (await admin_client.get("/api/admin/diaries")).json()
    assert listing["total"] == 4
    assert [item["id"] for item in listing["items"]] == [
        future["id"],
        same_day_evening["id"],
        same_day_morning["id"],
        older["id"],
    ]

    by_keyword = (await admin_client.get("/api/admin/diaries", params={"q": "昨天"})).json()
    assert by_keyword["total"] == 2

    by_tag = (await admin_client.get("/api/admin/diaries", params={"tag": "日报"})).json()
    assert by_tag["total"] == 4

    no_match = (await admin_client.get("/api/admin/diaries", params={"tag": "不存在的标签"})).json()
    assert no_match["total"] == 0


async def test_diary_update_and_delete(admin_client: AsyncClient) -> None:
    created = await create_diary(admin_client, title="待更新", mood="tired", tags=["日报"])
    diary_id = created["id"]

    response = await admin_client.put(
        f"/api/admin/diaries/{diary_id}",
        json={
            "date": local_date(days=-2),
            "time": "22:15",
            "title": "更新后的标题",
            "mood": "happy",
            "tags": ["复盘"],
            "content": "## 明日计划\n- 继续写代码",
        },
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["id"] == diary_id
    assert updated["title"] == "更新后的标题"
    assert updated["date"] == local_date(days=-2)
    assert updated["time"] == "22:15"
    assert updated["mood"] == "happy"
    assert updated["tags"] == ["复盘"]

    stored = (await admin_client.get("/api/admin/diaries")).json()["items"][0]
    assert stored["title"] == "更新后的标题"

    deleted = await admin_client.delete(f"/api/admin/diaries/{diary_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    assert (await admin_client.get("/api/admin/diaries")).json()["total"] == 0

    missing = await admin_client.delete(f"/api/admin/diaries/{diary_id}")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "日记不存在"}


async def test_diary_accepts_historical_and_future_dates(admin_client: AsyncClient) -> None:
    for days in (-365, -1, 0, 30, 365):
        created = await create_diary(admin_client, date=local_date(days=days), title=f"偏移 {days} 天")
        assert created["date"] == local_date(days=days)


async def test_diary_time_defaults_to_now(admin_client: AsyncClient) -> None:
    before = now_local()
    created = await create_diary(admin_client, time=None)
    after = now_local()
    stored_hour, stored_minute = (int(part) for part in created["time"].split(":"))
    assert (before.hour, before.minute) <= (stored_hour, stored_minute) <= (after.hour, after.minute)
