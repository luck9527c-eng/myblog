"""图片上传与开发期静态访问测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import get_settings

# 最小合法 PNG / JPEG / WEBP 文件头
VALID_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
VALID_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16 + b"\xff\xd9"
VALID_WEBP = b"RIFF\x18\x00\x00\x00WEBP" + b"\x00" * 16


@pytest.fixture
def isolated_upload_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    target = tmp_path / "uploads"
    target.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("UPLOAD_DIR", str(target))
    monkeypatch.setenv("MAX_UPLOAD_SIZE_MB", "1")
    get_settings.cache_clear()
    try:
        yield target
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_guest_cannot_upload_image(client, isolated_upload_dir: Path) -> None:
    resp = await client.post(
        "/api/admin/uploads",
        files={"file": ("test.png", VALID_PNG, "image/png")},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_upload_png_and_serve(admin_client, client, isolated_upload_dir: Path) -> None:
    resp = await admin_client.post(
        "/api/admin/uploads",
        files={"file": ("screenshot.png", VALID_PNG, "image/png")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["url"].startswith("/uploads/")
    assert data["url"].endswith(".png")
    assert data["filename"].endswith(".png")
    assert data["size"] == len(VALID_PNG)
    assert data["mimeType"] == "image/png"

    # 文件确实落盘在隔离目录中，且访客可通过 /uploads/... 访问
    rel_parts = data["url"].removeprefix("/uploads/").split("/")
    saved_file = isolated_upload_dir.joinpath(*rel_parts)
    assert saved_file.is_file()

    public_resp = await client.get(data["url"])
    assert public_resp.status_code == 200
    assert public_resp.content == VALID_PNG


@pytest.mark.asyncio
async def test_admin_upload_jpeg_and_webp(admin_client, isolated_upload_dir: Path) -> None:
    for name, payload, mime, ext in (
        ("photo.jpg", VALID_JPEG, "image/jpeg", ".jpg"),
        ("pic.webp", VALID_WEBP, "image/webp", ".webp"),
    ):
        resp = await admin_client.post(
            "/api/admin/uploads",
            files={"file": (name, payload, mime)},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["url"].endswith(ext)
        assert body["mimeType"] == mime


@pytest.mark.asyncio
async def test_reject_svg_or_fake_png_extension(admin_client, isolated_upload_dir: Path) -> None:
    svg_payload = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    resp = await admin_client.post(
        "/api/admin/uploads",
        files={"file": ("evil.png", svg_payload, "image/png")},
    )
    assert resp.status_code == 400
    assert "PNG" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_reject_oversized_upload(admin_client, isolated_upload_dir: Path) -> None:
    oversized = b"\x89PNG\r\n\x1a\n" + b"\x00" * (1024 * 1024 + 64)
    resp = await admin_client.post(
        "/api/admin/uploads",
        files={"file": ("big.png", oversized, "image/png")},
    )
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_path_traversal_on_uploads_returns_404(client, isolated_upload_dir: Path) -> None:
    resp = await client.get("/uploads/../../etc/passwd")
    assert resp.status_code == 404
