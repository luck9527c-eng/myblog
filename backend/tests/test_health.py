"""运维健康检查与通用错误格式。"""

from __future__ import annotations

from httpx import AsyncClient


async def test_health_ok(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "up"}


async def test_health_has_no_api_prefix(client: AsyncClient) -> None:
    # /api/health 不是契约里的路径（应为 404），健康检查固定在根路径 /health
    assert (await client.get("/api/health")).status_code == 404


async def test_unknown_route_returns_404(client: AsyncClient) -> None:
    response = await client.get("/api/not-exists")
    assert response.status_code == 404


async def test_error_body_shape_is_detail_string(client: AsyncClient) -> None:
    response = await client.get("/api/articles/999999")
    assert response.status_code == 404
    body = response.json()
    assert list(body.keys()) == ["detail"]
    assert isinstance(body["detail"], str)


async def test_openapi_mounted_under_api(client: AsyncClient) -> None:
    response = await client.get("/api/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    for expected in (
        "/health",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/auth/me",
        "/api/public/bootstrap",
        "/api/articles",
        "/api/articles/archive",
        "/api/articles/{article_id}",
        "/api/admin/articles",
        "/api/admin/articles/{article_id}/pin",
        "/api/admin/diaries",
        "/api/admin/diaries/{diary_id}",
        "/api/admin/categories",
        "/api/admin/categories/{category_id}",
        "/api/admin/tags/{tag_name}",
        "/api/admin/settings",
        "/api/admin/password",
    ):
        assert expected in paths, f"缺少路由 {expected}"
