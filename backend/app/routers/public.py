"""访客公开接口：``/api/public/bootstrap``、``/api/articles*``。

硬约束：只返回 ``status='published'`` 的文章，绝不返回草稿、日记或密码哈希。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_session
from ..models import Article, Category, SiteSetting, Tag, article_tags
from ..schemas import (
    ArchiveItemOut,
    ArchiveOut,
    ArticleDetailOut,
    ArticleNeighborOut,
    ArticleOut,
    BootstrapMetaOut,
    BootstrapOut,
    CategoryOut,
    PageOut,
    TagStatOut,
    article_detail_to_out,
    article_to_out,
    settings_to_out,
)
from ..utils import (
    article_ids_by_tag_name,
    article_search_clause,
    fmt_datetime,
    parse_optional_id,
)

router = APIRouter(prefix="/api", tags=["public"])

_PUBLISHED = "published"


# ---------------------------------------------------------------------------
# 内部工具
# ---------------------------------------------------------------------------
def _parse_category_id(value: str | None) -> int | None:
    try:
        return parse_optional_id(value, field="category_id")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None


def _article_filter_conditions(
    *,
    q: str | None = None,
    category_id: int | None = None,
    tag: str | None = None,
    include_drafts: bool = False,
) -> list:
    conditions: list = []
    if not include_drafts:
        conditions.append(Article.status == _PUBLISHED)
    if category_id is not None:
        conditions.append(Article.category_id == category_id)
    tag_name = (tag or "").strip()
    if tag_name:
        conditions.append(Article.id.in_(article_ids_by_tag_name(tag_name)))
    keyword = (q or "").strip()
    if keyword:
        conditions.append(article_search_clause(keyword))
    return conditions


# ---------------------------------------------------------------------------
# 公开元数据
# ---------------------------------------------------------------------------
@router.get("/public/bootstrap", response_model=BootstrapOut, summary="公开渲染所需的全部元数据")
async def bootstrap(session: AsyncSession = Depends(get_session)) -> BootstrapOut:
    settings_row = await session.get(SiteSetting, 1)
    if settings_row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="站点配置尚未初始化",
        )

    published = Article.status == _PUBLISHED

    category_rows = (
        await session.execute(
            select(Category, func.count(Article.id))
            .outerjoin(Article, (Article.category_id == Category.id) & published)
            .group_by(Category.id)
            .order_by(Category.sort_order.asc(), Category.id.asc())
        )
    ).all()

    tag_count = func.count(func.distinct(article_tags.c.article_id))
    tag_rows = (
        await session.execute(
            select(Tag.name, tag_count.label("tag_count"))
            .join(article_tags, article_tags.c.tag_id == Tag.id)
            .join(Article, Article.id == article_tags.c.article_id)
            .where(published)
            .group_by(Tag.id, Tag.name)
            .order_by(tag_count.desc(), Tag.name.asc())
        )
    ).all()

    article_count = int(await session.scalar(select(func.count(Article.id)).where(published)) or 0)

    return BootstrapOut(
        settings=settings_to_out(settings_row),
        categories=[
            CategoryOut(
                id=str(category.id),
                name=category.name,
                description=category.description or "",
                dot_color=category.dot_color or "#3b82f6",
                sort_order=int(category.sort_order or 0),
                article_count=int(count or 0),
            )
            for category, count in category_rows
        ],
        tags=[TagStatOut(name=name, count=int(count or 0)) for name, count in tag_rows],
        meta=BootstrapMetaOut(article_count=article_count, category_count=len(category_rows)),
    )


# ---------------------------------------------------------------------------
# 文章列表（分页）
# ---------------------------------------------------------------------------
@router.get("/articles", response_model=PageOut[ArticleOut], summary="已发布文章列表（分页）")
async def list_articles(
    q: str = Query("", max_length=200, description="模糊匹配标题/摘要/正文/标签"),
    category_id: str | None = Query(None, description="分类 ID"),
    tag: str | None = Query(None, description="标签名（精确匹配）"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, description="每页条数，最大 100"),
    session: AsyncSession = Depends(get_session),
) -> PageOut[ArticleOut]:
    effective_page_size = min(int(page_size), 100)
    conditions = _article_filter_conditions(
        q=q,
        category_id=_parse_category_id(category_id),
        tag=tag,
    )

    total = int(await session.scalar(select(func.count(Article.id)).where(*conditions)) or 0)
    stmt = (
        select(Article)
        .where(*conditions)
        .order_by(Article.pinned.desc(), Article.published_at.desc(), Article.id.desc())
        .offset((int(page) - 1) * effective_page_size)
        .limit(effective_page_size)
        .options(selectinload(Article.tags))
    )
    articles = list((await session.scalars(stmt)).all())

    return PageOut[ArticleOut](
        items=[article_to_out(article) for article in articles],
        total=total,
        page=int(page),
        page_size=effective_page_size,
    )


# ---------------------------------------------------------------------------
# 归档（不分页，仅精简字段）
# ---------------------------------------------------------------------------
@router.get("/articles/archive", response_model=ArchiveOut, summary="归档列表（精简字段，不分页）")
async def archive(
    q: str = Query("", max_length=200),
    category_id: str | None = Query(None),
    tag: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
) -> ArchiveOut:
    conditions = _article_filter_conditions(
        q=q,
        category_id=_parse_category_id(category_id),
        tag=tag,
    )
    stmt = (
        select(Article.id, Article.title, Article.category_id, Article.published_at, Article.pinned)
        .where(*conditions)
        .order_by(Article.published_at.desc(), Article.id.desc())
    )
    rows = (await session.execute(stmt)).all()
    items = [
        ArchiveItemOut(
            id=str(row.id),
            title=row.title,
            category_id=str(row.category_id) if row.category_id is not None else None,
            published_at=fmt_datetime(row.published_at),
            pinned=bool(row.pinned),
        )
        for row in rows
    ]
    return ArchiveOut(items=items, total=len(items))


# ---------------------------------------------------------------------------
# 文章详情（含 prev / next）
# ---------------------------------------------------------------------------
async def _neighbor(
    session: AsyncSession,
    article: Article,
    *,
    older: bool,
) -> ArticleNeighborOut | None:
    """同排序序列（pinned DESC, published_at DESC, id DESC）中的相邻已发布文章。

    ``older=True`` 取「上一篇」（发布时间更早，序列中位于当前文章之后）；
    ``older=False`` 取「下一篇」（发布时间更晚，序列中位于当前文章之前）。
    """
    pinned_value = int(bool(article.pinned))
    published_at = article.published_at
    article_id = int(article.id)

    if older:
        rank_condition = Article.pinned < pinned_value
        rank_condition = rank_condition | (
            (Article.pinned == pinned_value) & (Article.published_at < published_at)
        )
        rank_condition = rank_condition | (
            (Article.pinned == pinned_value)
            & (Article.published_at == published_at)
            & (Article.id < article_id)
        )
        order_by = (Article.pinned.desc(), Article.published_at.desc(), Article.id.desc())
    else:
        rank_condition = Article.pinned > pinned_value
        rank_condition = rank_condition | (
            (Article.pinned == pinned_value) & (Article.published_at > published_at)
        )
        rank_condition = rank_condition | (
            (Article.pinned == pinned_value)
            & (Article.published_at == published_at)
            & (Article.id > article_id)
        )
        order_by = (Article.pinned.asc(), Article.published_at.asc(), Article.id.asc())

    stmt = (
        select(Article.id, Article.title)
        .where(
            Article.status == _PUBLISHED,
            Article.id != article_id,
            rank_condition,
        )
        .order_by(*order_by)
        .limit(1)
    )
    row = (await session.execute(stmt)).first()
    if row is None:
        return None
    return ArticleNeighborOut(id=str(row.id), title=row.title)


@router.get("/articles/{article_id}", response_model=ArticleDetailOut, summary="已发布文章详情")
async def article_detail(
    article_id: int,
    session: AsyncSession = Depends(get_session),
) -> ArticleDetailOut:
    article = await session.get(Article, article_id, options=[selectinload(Article.tags)])
    if article is None or article.status != _PUBLISHED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文章不存在")

    prev_item = await _neighbor(session, article, older=True)
    next_item = await _neighbor(session, article, older=False)
    return article_detail_to_out(article, prev_item, next_item)
