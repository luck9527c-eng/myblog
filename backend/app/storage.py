"""图片上传校验与本地持久化存储模块。

按 ``YYYY/MM/<32位UUID>.<ext>`` 结构落盘，对外暴露相对路径 ``/uploads/YYYY/MM/<uuid>.<ext>``。
后续如需切换至腾讯云 COS 等对象存储，只需替换本模块的保存实现，保持返回值契约不变。
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, status

_IMAGE_MIME_BY_EXT: dict[str, str] = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


@dataclass(frozen=True, slots=True)
class SavedUpload:
    url: str
    filename: str
    size: int
    mime_type: str


def detect_image_type(data: bytes) -> tuple[str, str] | None:
    """基于文件头魔数识别图片格式；严格拒绝 SVG / HTML / 伪装扩展名等非安全格式。"""
    if not data:
        return None
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png", _IMAGE_MIME_BY_EXT[".png"]
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg", _IMAGE_MIME_BY_EXT[".jpg"]
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif", _IMAGE_MIME_BY_EXT[".gif"]
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp", _IMAGE_MIME_BY_EXT[".webp"]
    return None


def save_image(data: bytes, upload_root: Path, max_bytes: int, now: datetime) -> SavedUpload:
    """校验图片大小与真实格式后写入本地目录，返回相对访问 URL。"""
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传文件不能为空")
    if len(data) > max_bytes:
        limit_mb = max(1, max_bytes // (1024 * 1024))
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"图片大小不能超过 {limit_mb} MB",
        )

    detected = detect_image_type(data)
    if detected is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持 PNG / JPG / GIF / WEBP 格式的图片",
        )

    ext, mime_type = detected
    year_dir = f"{now.year:04d}"
    month_dir = f"{now.month:02d}"
    filename = f"{uuid.uuid4().hex}{ext}"

    target_dir = upload_root / year_dir / month_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / filename
    target_file.write_bytes(data)

    return SavedUpload(
        url=f"/uploads/{year_dir}/{month_dir}/{filename}",
        filename=filename,
        size=len(data),
        mime_type=mime_type,
    )
