"""认证接口 ``/api/auth``（见 docs/API_CONTRACT.md 第 1 节）。"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_session
from ..models import SiteSetting
from ..schemas import LoginInput, SessionOut
from ..security import (
    client_ip,
    clear_session_cookie,
    create_session_token,
    is_admin_request,
    login_rate_limiter,
    set_session_cookie,
    verify_password,
)

logger = logging.getLogger("blog.auth")

settings = get_settings()

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=SessionOut, summary="管理员登录（种入 HttpOnly Cookie）")
async def login(
    payload: LoginInput,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> SessionOut:
    ip = client_ip(request)
    if login_rate_limiter.is_blocked(ip):
        logger.warning("login rejected by rate limiter, ip=%s", ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="尝试过于频繁，请稍后再试",
        )

    settings_row = await session.get(SiteSetting, 1)
    if settings_row is None:
        logger.error("site_settings 尚未初始化，请先执行 python -m app.seed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="站点配置尚未初始化",
        )

    if not verify_password(payload.password, settings_row.admin_password_hash):
        login_rate_limiter.register_failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="密码不正确")

    login_rate_limiter.clear(ip)
    set_session_cookie(response, create_session_token(int(settings_row.token_version)))
    return SessionOut(is_admin=True)


@router.post("/logout", response_model=SessionOut, summary="退出登录（清除 Cookie）")
async def logout(response: Response) -> SessionOut:
    clear_session_cookie(response)
    return SessionOut(is_admin=False)


@router.get("/me", response_model=SessionOut, summary="当前会话是否为管理员（永不 401）")
async def me(request: Request, session: AsyncSession = Depends(get_session)) -> SessionOut:
    try:
        is_admin = await is_admin_request(request, session)
    except Exception:  # pragma: no cover - 数据库异常时也不阻断前端启动
        logger.exception("failed to resolve admin session")
        is_admin = False
    return SessionOut(is_admin=is_admin)
