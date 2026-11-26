"""管理员接口 ``/api/admin/**``（全部要求 ``require_admin``）。

响应结构严格对齐 docs/API_CONTRACT.md 第 3 节：
* 文章列表 ``{"items": Article[], "total": n}``（含草稿，不分页）
* 单资源接口返回对应对象；删除类接口返回 ``{"ok": true}``
* 分类重名 / 删除规则等业务冲突统一 400 + 中文 detail
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import delete, func, or_, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..database import get_session
from ..models import Article, Category, Diary, SiteSetting, Tag, article_tags
from ..schemas import (
    ArticleInput,
    ArticleListOut,
    ArticleOut,
    CategoryInput,
    CategoryOut,
    CategoryUpdateInput,
    DiaryInput,
    DiaryListOut,
    DiaryOut,
    OkOut,
    PasswordInput,
    PinInput,
    SiteSettingsOut,
    SiteSettingsUpdateInput,
    TagDeleteOut,
    TagRenameInput,
    TagRenameOut,
    UploadImageOut,
    article_to_out,
    category_to_out,
    diary_to_out,
    settings_to_out,
)
from ..security import create_session_token, hash_password, require_admin, set_session_cookie, verify_password
from ..storage import save_image
from ..utils import (
    LIKE_ESCAPE,
    article_search_clause,
    derive_excerpt,
    escape_like,
    normalize_tag_list,
    now_local,
)

logger = logging.getLogger("blog.admin")

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

#: 可在后台修改的站点设置字段（白名单，密码字段永不在此列）
_SETTINGS_FIELDS = (
    "blog_title",
    "blog_subtitle",
    "author_name",
    "author_handle",
    "author_avatar",
    "author_bio",
    "author_location",
    "author_email",
    "about_content",
)


# ---------------------------------------------------------------------------
# 通用辅助
# ---------------------------------------------------------------------------
async def _resolve_category_id(session: AsyncSession, raw_category_id: str | None) -> int | None:
    """校验并转换 categoryId；不存在时 400（避免外键错误直接 500）。"""
    if raw_category_id is None:
        return None
    text = str(raw_category_id).strip()
    if not text:
        return None
    try:
        category_id = int(text)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类不存在") from None
    exists = await session.scalar(select(Category.id).where(Category.id == category_id))
    if exists is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类不存在")
    return category_id


async def _resolve_tags(session: AsyncSession, names: list[str]) -> list[Tag]:
    """按出现顺序取/建标签（标签名唯一索引为大小写不敏感）。"""
    normalized = normalize_tag_list(names)
    if not normalized:
        return []
    for name in normalized:
        if len(name) > 64:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="标签名称不能超过 64 个字符",
            )
    existing = list((await session.scalars(select(Tag).where(Tag.name.in_(normalized)))).all())
    by_name = {tag.name.lower(): tag for tag in existing}
    result: list[Tag] = []
    for name in normalized:
        tag = by_name.get(name.lower())
        if tag is None:
            tag = Tag(name=name)
            session.add(tag)
            await session.flush()
            by_name[name.lower()] = tag
        result.append(tag)
    return result


async def _get_article_or_404(session: AsyncSession, article_id: int) -> Article:
    article = await session.get(Article, article_id, options=[selectinload(Article.tags)])
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文章不存在")
    return article


async def _get_diary_or_404(session: AsyncSession, diary_id: int) -> Diary:
    diary = await session.get(Diary, diary_id)
    if diary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="日记不存在")
    return diary


async def _get_category_or_404(session: AsyncSession, category_id: int) -> Category:
    category = await session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分类不存在")
    return category


async def _get_tag_or_404(session: AsyncSession, tag_name: str) -> Tag:
    tag = await session.scalar(select(Tag).where(Tag.name == tag_name))
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="标签不存在")
    return tag


async def _article_count_by_category(session: AsyncSession, category_id: int) -> int:
    return int(
        await session.scalar(select(func.count(Article.id)).where(Article.category_id == category_id)) or 0
    )


async def _article_ids_of_tag(session: AsyncSession, tag_id: int) -> list[int]:
    return list((await session.scalars(select(article_tags.c.article_id).where(article_tags.c.tag_id == tag_id))).all())


# ===========================================================================
# 文章
# ===========================================================================
@router.get("/articles", response_model=ArticleListOut, summary="全部文章（含草稿）")
async def admin_list_articles(
    status_filter: str | None = Query(default=None, alias="status", description="published / draft"),
    q: str = Query("", max_length=200),
    session: AsyncSession = Depends(get_session),
) -> ArticleListOut:
    conditions: list = []
    status_value = (status_filter or "").strip()
    if status_value:
        if status_value not in ("published", "draft"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status 只能是 published 或 draft",
            )
        conditions.append(Article.status == status_value)
    keyword = (q or "").strip()
    if keyword:
        conditions.append(article_search_clause(keyword))

    total = int(await session.scalar(select(func.count(Article.id)).where(*conditions)) or 0)
    stmt = (
        select(Article)
        .where(*conditions)
        .order_by(Article.pinned.desc(), Article.published_at.desc(), Article.id.desc())
        .options(selectinload(Article.tags))
    )
    articles = list((await session.scalars(stmt)).all())
    return ArticleListOut(items=[article_to_out(article) for article in articles], total=total)


@router.post("/articles", response_model=ArticleOut, summary="新建文章")
async def create_article(
    payload: ArticleInput,
    session: AsyncSession = Depends(get_session),
) -> ArticleOut:
    category_id = await _resolve_category_id(session, payload.category_id)
    now = now_local()
    article = Article(
        title=payload.title,
        excerpt=(payload.excerpt or "") or derive_excerpt(payload.content),
        content=payload.content,
        category_id=category_id,
        published_at=payload.published_at or now,
        status=payload.status,
        pinned=int(bool(payload.pinned)),
        created_at=now,
        updated_at=now,
    )
    article.tags = await _resolve_tags(session, payload.tags)
    session.add(article)
    await session.commit()
    logger.info("article created id=%s title=%r", article.id, article.title)
    return article_to_out(article)


@router.put("/articles/{article_id}", response_model=ArticleOut, summary="更新文章")
async def update_article(
    article_id: int,
    payload: ArticleInput,
    session: AsyncSession = Depends(get_session),
) -> ArticleOut:
    article = await _get_article_or_404(session, article_id)
    category_id = await _resolve_category_id(session, payload.category_id)
    now = now_local()

    article.title = payload.title
    article.excerpt = payload.excerpt or derive_excerpt(payload.content)
    article.content = payload.content
    article.category_id = category_id
    article.status = payload.status
    article.pinned = int(bool(payload.pinned))
    if payload.published_at is not None:
        article.published_at = payload.published_at
    article.updated_at = now
    article.tags = await _resolve_tags(session, payload.tags)

    await session.commit()
    logger.info("article updated id=%s", article_id)
    return article_to_out(article)


@router.patch("/articles/{article_id}/pin", response_model=ArticleOut, summary="切换置顶状态")
async def toggle_article_pin(
    article_id: int,
    payload: PinInput | None = None,
    session: AsyncSession = Depends(get_session),
) -> ArticleOut:
    article = await _get_article_or_404(session, article_id)
    if payload is not None and payload.pinned is not None:
        new_value = bool(payload.pinned)
    else:
        new_value = not bool(article.pinned)
    article.pinned = int(new_value)
    article.updated_at = now_local()
    await session.commit()
    return article_to_out(article)


@router.delete("/articles/{article_id}", response_model=OkOut, summary="删除文章（同步清理关联表）")
async def delete_article(article_id: int, session: AsyncSession = Depends(get_session)) -> OkOut:
    article = await _get_article_or_404(session, article_id)
    # 先清空标签关联并 flush（由 ORM 生成 article_tags 的 DELETE 语句），再删除文章行；
    # 不额外手写 DELETE，避免与工作单元（UoW）重复删除同一批关联行导致 StaleDataError。
    article.tags.clear()
    await session.flush()
    await session.delete(article)
    await session.commit()
    logger.info("article deleted id=%s", article_id)
    return OkOut(ok=True)


# ===========================================================================
# 日记
# ===========================================================================
def _diary_tag_condition(tag_name: str):
    """日记标签筛选：``tags_json`` 为 JSON 数组，用 JSON_CONTAINS 精确匹配。"""
    return func.json_contains(Diary.tags_json, json.dumps(tag_name, ensure_ascii=False))


@router.get("/diaries", response_model=DiaryListOut, summary="日记列表（按日期时间倒序）")
async def admin_list_diaries(
    q: str = Query("", max_length=200),
    tag: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> DiaryListOut:
    conditions: list = []
    keyword = (q or "").strip()
    if keyword:
        pattern = f"%{escape_like(keyword)}%"
        conditions.append(
            or_(
                Diary.title.like(pattern, escape=LIKE_ESCAPE),
                Diary.content.like(pattern, escape=LIKE_ESCAPE),
            )
        )
    tag_name = (tag or "").strip()
    if tag_name:
        conditions.append(_diary_tag_condition(tag_name))

    total = int(await session.scalar(select(func.count(Diary.id)).where(*conditions)) or 0)
    stmt = (
        select(Diary)
        .where(*conditions)
        .order_by(Diary.entry_date.desc(), Diary.entry_time.desc(), Diary.id.desc())
    )
    diaries = list((await session.scalars(stmt)).all())
    return DiaryListOut(items=[diary_to_out(diary) for diary in diaries], total=total)


@router.post("/diaries", response_model=DiaryOut, summary="新建日记 / 每日日报")
async def create_diary(
    payload: DiaryInput,
    session: AsyncSession = Depends(get_session),
) -> DiaryOut:
    now = now_local()
    entry_date = payload.date
    entry_time = (payload.time or now.time()).replace(microsecond=0)
    title = payload.title or f"{entry_date.isoformat()} 每日日报"
    diary = Diary(
        entry_date=entry_date,
        entry_time=entry_time,
        title=title,
        mood=payload.mood,
        tags_json=payload.tags,
        content=payload.content,
        created_at=now,
        updated_at=now,
    )
    session.add(diary)
    await session.commit()
    logger.info("diary created id=%s date=%s", diary.id, entry_date.isoformat())
    return diary_to_out(diary)


@router.put("/diaries/{diary_id}", response_model=DiaryOut, summary="更新日记")
async def update_diary(
    diary_id: int,
    payload: DiaryInput,
    session: AsyncSession = Depends(get_session),
) -> DiaryOut:
    diary = await _get_diary_or_404(session, diary_id)
    entry_date = payload.date
    diary.entry_date = entry_date
    diary.entry_time = (payload.time or now_local().time()).replace(microsecond=0)
    diary.title = payload.title or f"{entry_date.isoformat()} 每日日报"
    diary.mood = payload.mood
    diary.tags_json = payload.tags
    diary.content = payload.content
    diary.updated_at = now_local()
    await session.commit()
    return diary_to_out(diary)


@router.delete("/diaries/{diary_id}", response_model=OkOut, summary="删除日记")
async def delete_diary(diary_id: int, session: AsyncSession = Depends(get_session)) -> OkOut:
    diary = await _get_diary_or_404(session, diary_id)
    await session.delete(diary)
    await session.commit()
    return OkOut(ok=True)


# ===========================================================================
# 分类
# ===========================================================================
@router.post("/categories", response_model=CategoryOut, summary="新增分类")
async def create_category(
    payload: CategoryInput,
    session: AsyncSession = Depends(get_session),
) -> CategoryOut:
    duplicate = await session.scalar(select(Category.id).where(Category.name == payload.name))
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类名称已存在")

    sort_order = payload.sort_order
    if sort_order is None:
        max_sort = await session.scalar(select(func.max(Category.sort_order)))
        sort_order = int(max_sort) + 1 if max_sort is not None else 0

    category = Category(
        name=payload.name,
        description=payload.description or "",
        dot_color=payload.dot_color,
        sort_order=int(sort_order),
        created_at=now_local(),
    )
    session.add(category)
    await session.commit()
    logger.info("category created id=%s name=%r", category.id, category.name)
    return category_to_out(category, 0)


@router.put("/categories/{category_id}", response_model=CategoryOut, summary="修改分类")
async def update_category(
    category_id: int,
    payload: CategoryUpdateInput,
    session: AsyncSession = Depends(get_session),
) -> CategoryOut:
    category = await _get_category_or_404(session, category_id)

    if payload.name is not None and payload.name != category.name:
        duplicate = await session.scalar(
            select(Category.id).where(Category.name == payload.name, Category.id != category_id)
        )
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类名称已存在")
        category.name = payload.name
    if payload.description is not None:
        category.description = payload.description
    if payload.dot_color is not None:
        category.dot_color = payload.dot_color
    if payload.sort_order is not None:
        category.sort_order = int(payload.sort_order)

    await session.commit()
    article_count = await _article_count_by_category(session, category_id)
    return category_to_out(category, article_count)


@router.delete("/categories/{category_id}", response_model=OkOut, summary="删除分类")
async def delete_category(category_id: int, session: AsyncSession = Depends(get_session)) -> OkOut:
    category = await _get_category_or_404(session, category_id)

    article_count = await _article_count_by_category(session, category_id)
    if article_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"该分类下仍有 {article_count} 篇文章，请先迁移",
        )
    total_categories = int(await session.scalar(select(func.count(Category.id))) or 0)
    if total_categories <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="至少保留一个分类")

    await session.delete(category)
    await session.commit()
    logger.info("category deleted id=%s", category_id)
    return OkOut(ok=True)


# ===========================================================================
# 标签（路径中的 tag_name 需 URL 编码）
# ===========================================================================
@router.patch("/tags/{tag_name}", response_model=TagRenameOut, summary="全局重命名标签（目标已存在则合并）")
async def rename_tag(
    tag_name: str,
    payload: TagRenameInput,
    session: AsyncSession = Depends(get_session),
) -> TagRenameOut:
    old_name = tag_name.strip()
    old_tag = await _get_tag_or_404(session, old_name)
    new_name = normalize_tag_list([payload.new_name])
    if not new_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="新标签名称不能为空")
    target_name = new_name[0]
    if len(target_name) > 64:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="标签名称不能超过 64 个字符")

    old_article_ids = await _article_ids_of_tag(session, int(old_tag.id))

    if target_name.lower() == old_tag.name.lower():
        # 只是大小写变化或同名，直接改名
        old_tag.name = target_name
        await session.commit()
        return TagRenameOut(ok=True, name=target_name, merged=False, affected=len(old_article_ids))

    target_tag = await session.scalar(select(Tag).where(Tag.name == target_name))
    if target_tag is None:
        old_tag.name = target_name
        await session.commit()
        logger.info("tag renamed %r -> %r, affected=%s", old_name, target_name, len(old_article_ids))
        return TagRenameOut(ok=True, name=target_name, merged=False, affected=len(old_article_ids))

    # 合并：先删掉目标标签已存在的重复关联，再把剩余关联指向目标标签，最后删除旧标签
    target_article_ids = set(await _article_ids_of_tag(session, int(target_tag.id)))
    duplicates = [article_id for article_id in old_article_ids if article_id in target_article_ids]
    movable = [article_id for article_id in old_article_ids if article_id not in target_article_ids]
    if duplicates:
        await session.execute(
            delete(article_tags).where(
                article_tags.c.tag_id == int(old_tag.id),
                article_tags.c.article_id.in_(duplicates),
            )
        )
    if movable:
        await session.execute(
            sa_update(article_tags)
            .where(
                article_tags.c.tag_id == int(old_tag.id),
                article_tags.c.article_id.in_(movable),
            )
            .values(tag_id=int(target_tag.id))
        )
    await session.execute(delete(Tag).where(Tag.id == int(old_tag.id)))
    await session.commit()
    logger.info("tag merged %r -> %r, moved=%s, duplicates=%s", old_name, target_name, len(movable), len(duplicates))
    return TagRenameOut(ok=True, name=target_tag.name, merged=True, affected=len(movable))


@router.delete("/tags/{tag_name}", response_model=TagDeleteOut, summary="全局移除标签")
async def delete_tag(tag_name: str, session: AsyncSession = Depends(get_session)) -> TagDeleteOut:
    tag = await _get_tag_or_404(session, tag_name.strip())
    article_ids = await _article_ids_of_tag(session, int(tag.id))
    await session.execute(delete(article_tags).where(article_tags.c.tag_id == int(tag.id)))
    await session.execute(delete(Tag).where(Tag.id == int(tag.id)))
    await session.commit()
    logger.info("tag deleted %r, affected=%s", tag_name, len(article_ids))
    return TagDeleteOut(ok=True, affected=len(article_ids))


# ===========================================================================
# 站点设置
# ===========================================================================
@router.get("/settings", response_model=SiteSettingsOut, summary="读取站点设置")
async def read_site_settings(admin: SiteSetting = Depends(require_admin)) -> SiteSettingsOut:
    return settings_to_out(admin)


@router.put("/settings", response_model=SiteSettingsOut, summary="更新站点设置")
async def update_site_settings(
    payload: SiteSettingsUpdateInput,
    session: AsyncSession = Depends(get_session),
    admin: SiteSetting = Depends(require_admin),
) -> SiteSettingsOut:
    provided = payload.model_dump(exclude_unset=True)
    for field in _SETTINGS_FIELDS:
        if field not in provided:
            continue
        value = provided[field]
        if value is None:
            continue
        setattr(admin, field, value)
    admin.updated_at = now_local()
    await session.commit()
    return settings_to_out(admin)


# ===========================================================================
# 修改管理员密码
# ===========================================================================
@router.put("/password", response_model=OkOut, summary="修改管理员密码（递增 token_version 并重签 Cookie）")
async def change_password(
    payload: PasswordInput,
    response: Response,
    session: AsyncSession = Depends(get_session),
    admin: SiteSetting = Depends(require_admin),
) -> OkOut:
    if not verify_password(payload.old_password, admin.admin_password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码不正确")

    new_password = payload.new_password or ""
    if not 6 <= len(new_password) <= 64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码长度需为 6-64 个字符",
        )

    admin.admin_password_hash = hash_password(new_password)
    admin.token_version = int(admin.token_version) + 1
    admin.updated_at = now_local()
    await session.commit()

    # 为当前会话重签 Cookie，使其它旧会话失效但当前浏览器不掉线
    set_session_cookie(response, create_session_token(int(admin.token_version)))
    logger.info("admin password changed, token_version=%s", admin.token_version)
    return OkOut(ok=True)


# ===========================================================================
# 图片上传（仅管理员）
# ===========================================================================
@router.post("/uploads", response_model=UploadImageOut, summary="上传文章/日记图片（仅管理员）")
async def upload_image(
    file: UploadFile = File(...),
    admin: SiteSetting = Depends(require_admin),
) -> UploadImageOut:
    app_settings = get_settings()
    max_bytes = app_settings.max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    try:
        while True:
            chunk = await file.read(1024 * 64)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"图片大小不能超过 {app_settings.max_upload_size_mb} MB",
                )
            chunks.append(chunk)
    finally:
        await file.close()

    saved = save_image(b"".join(chunks), app_settings.upload_path, max_bytes, now_local())
    logger.info("uploaded image filename=%s size=%s", saved.filename, saved.size)
    return UploadImageOut(
        url=saved.url,
        filename=saved.filename,
        size=saved.size,
        mime_type=saved.mime_type,
    )
