"""认证与密码相关测试：登录 / me / 登出 / 限流 / 改密后旧会话失效。"""

from __future__ import annotations

from httpx import AsyncClient

from helpers import TEST_PASSWORD, login, new_client


async def test_login_success_sets_httponly_cookie(client: AsyncClient) -> None:
    response = await login(client, TEST_PASSWORD)
    assert response.status_code == 200
    assert response.json() == {"isAdmin": True}

    set_cookie = response.headers.get("set-cookie", "")
    assert "blog_admin_session=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "Path=/" in set_cookie
    assert "SameSite=lax" in set_cookie.replace("samesite", "SameSite")

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == {"isAdmin": True}


async def test_login_wrong_password(client: AsyncClient) -> None:
    response = await login(client, "wrong-password")
    assert response.status_code == 401
    assert response.json() == {"detail": "密码不正确"}
    assert "set-cookie" not in {key.lower() for key in response.headers.keys()}


async def test_me_is_false_without_cookie(client: AsyncClient) -> None:
    response = await client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"isAdmin": False}


async def test_logout_clears_cookie(admin_client: AsyncClient) -> None:
    response = await admin_client.post("/api/auth/logout")
    assert response.status_code == 200
    assert response.json() == {"isAdmin": False}
    set_cookie = response.headers.get("set-cookie", "")
    assert "blog_admin_session=" in set_cookie
    assert "Max-Age=0" in set_cookie or "max-age=0" in set_cookie

    me = await admin_client.get("/api/auth/me")
    assert me.json() == {"isAdmin": False}
    protected = await admin_client.get("/api/admin/articles")
    assert protected.status_code == 401


async def test_forged_cookie_is_rejected(client: AsyncClient) -> None:
    client.cookies.set("blog_admin_session", "not-a-jwt")
    response = await client.get("/api/admin/articles")
    assert response.status_code == 401


async def test_login_rate_limited_after_ten_failures(client: AsyncClient) -> None:
    for attempt in range(10):
        response = await login(client, "wrong-password")
        assert response.status_code == 401, f"attempt {attempt + 1} -> {response.status_code}"

    blocked = await login(client, "wrong-password")
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "尝试过于频繁，请稍后再试"}

    # 即使密码正确，被限流的 IP 也要先等窗口过去
    still_blocked = await login(client, TEST_PASSWORD)
    assert still_blocked.status_code == 429


async def test_successful_login_resets_failure_counter(client: AsyncClient) -> None:
    for _ in range(5):
        assert (await login(client, "wrong-password")).status_code == 401
    assert (await login(client, TEST_PASSWORD)).status_code == 200
    for attempt in range(10):
        response = await login(client, "wrong-password")
        assert response.status_code == 401, f"attempt {attempt + 1} -> {response.status_code}"


async def test_change_password_requires_old_password(admin_client: AsyncClient) -> None:
    response = await admin_client.put(
        "/api/admin/password",
        json={"oldPassword": "not-the-old-password", "newPassword": "brand-new-pass"},
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "原密码不正确"}


async def test_change_password_validates_length(admin_client: AsyncClient) -> None:
    response = await admin_client.put(
        "/api/admin/password",
        json={"oldPassword": TEST_PASSWORD, "newPassword": "short"},
    )
    assert response.status_code == 400
    assert "6-64" in response.json()["detail"]


async def test_change_password_invalidates_old_sessions(admin_client: AsyncClient) -> None:
    async with new_client() as other_session:
        assert (await login(other_session, TEST_PASSWORD)).status_code == 200
        assert (await other_session.get("/api/admin/diaries")).status_code == 200

        new_password = "brand-new-pass-456"
        response = await admin_client.put(
            "/api/admin/password",
            json={"oldPassword": TEST_PASSWORD, "newPassword": new_password},
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True}

        # 当前会话被重新签发 Cookie，仍然可用
        assert (await admin_client.get("/api/admin/diaries")).status_code == 200
        # 其它旧会话（token_version 已变）失效
        assert (await other_session.get("/api/admin/diaries")).status_code == 401
        assert (await other_session.get("/api/auth/me")).json() == {"isAdmin": False}

        # 旧密码不能再登录，新密码可以
        assert (await other_session.post("/api/auth/login", json={"password": TEST_PASSWORD})).status_code == 401
        assert (await other_session.post("/api/auth/login", json={"password": new_password})).status_code == 200
