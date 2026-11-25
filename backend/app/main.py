"""FastAPI 应用入口。

挂载：
* ``/api/auth``   认证
* ``/api``        访客公开接口
* ``/api/admin``  管理员接口
* ``/health``     运维健康检查（无 /api 前缀，供 Docker HEALTHCHECK 使用）
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from . import database
from .config import get_settings, settings_summary
from .routers import admin, auth, public

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, str(settings.log_level).upper(), logging.INFO),
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
logger = logging.getLogger("blog.main")


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    logger.info("blog backend starting, config=%s", settings_summary(settings))
    yield
    await database.engine.dispose()
    logger.info("blog backend stopped")


app = FastAPI(
    title="Personal Blog API",
    description="个人博客与私有日报系统后端（FastAPI + MySQL 8.0）",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(public.router)
app.include_router(admin.router)


@app.get("/health", tags=["ops"], summary="健康检查（无 /api 前缀）")
async def health() -> JSONResponse:
    """执行轻量 ``SELECT 1``；数据库不可用返回 503。"""
    try:
        async with database.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("health check failed: database unavailable")
        return JSONResponse(status_code=503, content={"status": "error", "database": "down"})
    return JSONResponse(status_code=200, content={"status": "ok", "database": "up"})


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """把 FastAPI 默认的 422 校验错误压成 ``{"detail": "<字符串>"}``（前端只认字符串 detail）。"""
    errors = exc.errors()
    if errors:
        first = errors[0]
        location = ".".join(str(part) for part in first.get("loc", ()) if part not in ("body", "query", "path"))
        message = str(first.get("msg", "参数不合法"))
        detail = f"请求参数不合法：{location} {message}".strip() if location else f"请求参数不合法：{message}"
    else:
        detail = "请求参数不合法"
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "服务器内部错误"})
