"""Pydantic v2 请求 / 响应模型与 ORM -> 响应模型转换函数。

约定（docs/API_CONTRACT.md §0.1）：
* JSON 请求体与响应体一律 camelCase（``alias_generator=to_camel`` + ``populate_by_name``）；
* 查询参数保持 snake_case（由路由函数签名声明）；
* 所有 id 在 JSON 中为字符串；
* 时间输出 ``YYYY-MM-DDTHH:mm:ss``（日记 ``time`` 输出 ``HH:mm``），
  写入时兼容 ``YYYY-MM-DDTHH:mm`` / ``YYYY-MM-DDTHH:mm:ss`` / ``YYYY-MM-DD HH:mm(:ss)``。
"""

from __future__ import annotations

import datetime as dt
import re
from typing import TYPE_CHECKING, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from .utils import (
    fmt_date,
    fmt_datetime,
    fmt_time,
    normalize_tag_list,
    parse_date_local,
    parse_datetime_local,
    parse_time_local,
)

if TYPE_CHECKING:  # pragma: no cover - 仅用于类型标注，避免循环导入
    from .models import Article, Category, Diary, SiteSetting

ArticleStatus = Literal["published", "draft"]
MoodType = Literal["focused", "calm", "inspired", "happy", "tired"]

_DOT_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class CamelModel(BaseModel):
    """所有请求/响应模型的基类：JSON 字段名统一 camelCase。"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# ===========================================================================
# 请求模型
# ===========================================================================
class LoginInput(CamelModel):
    password: str = Field(min_length=1, max_length=64)


class PasswordInput(CamelModel):
    old_password: str = Field(min_length=1, max_length=64)
    #: 长度规则（6..64）在路由中校验，以便返回 400 而不是 422
    new_password: str = Field(min_length=1, max_length=128)


class PinInput(CamelModel):
    pinned: bool | None = None


class ArticleInput(CamelModel):
    title: str
    excerpt: str | None = None
    content: str
    category_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    published_at: dt.datetime | None = None
    status: ArticleStatus = "published"
    pinned: bool = False

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str) -> str:
        text = (value or "").strip()
        if not 1 <= len(text) <= 200:
            raise ValueError("标题长度需为 1-200 个字符")
        return text

    @field_validator("excerpt", mode="before")
    @classmethod
    def _validate_excerpt(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if len(text) > 500:
            raise ValueError("摘要长度不能超过 500 个字符")
        return text

    @field_validator("content", mode="before")
    @classmethod
    def _validate_content(cls, value: object) -> str:
        return "" if value is None else str(value)

    @field_validator("category_id", mode="before")
    @classmethod
    def _validate_category_id(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @field_validator("published_at", mode="before")
    @classmethod
    def _validate_published_at(cls, value: object) -> dt.datetime | None:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return parse_datetime_local(value)

    @field_validator("tags", mode="before")
    @classmethod
    def _validate_tags(cls, value: object) -> list[str]:
        return normalize_tag_list(value)


class DiaryInput(CamelModel):
    date: dt.date
    time: dt.time | None = None
    title: str | None = None
    mood: MoodType = "focused"
    tags: list[str] = Field(default_factory=list)
    content: str

    @field_validator("date", mode="before")
    @classmethod
    def _validate_date(cls, value: object) -> dt.date:
        return parse_date_local(value)

    @field_validator("time", mode="before")
    @classmethod
    def _validate_time(cls, value: object) -> dt.time | None:
        return parse_time_local(value)

    @field_validator("title", mode="before")
    @classmethod
    def _validate_title(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if len(text) > 200:
            raise ValueError("标题长度不能超过 200 个字符")
        return text or None

    @field_validator("tags", mode="before")
    @classmethod
    def _validate_tags(cls, value: object) -> list[str]:
        return normalize_tag_list(value)

    @field_validator("content", mode="before")
    @classmethod
    def _validate_content(cls, value: object) -> str:
        return "" if value is None else str(value)


class CategoryInput(CamelModel):
    name: str
    description: str | None = None
    dot_color: str = "#3b82f6"
    sort_order: int | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        text = (value or "").strip()
        if not 1 <= len(text) <= 64:
            raise ValueError("分类名称长度需为 1-64 个字符")
        return text

    @field_validator("description", mode="before")
    @classmethod
    def _validate_description(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if len(text) > 255:
            raise ValueError("分类简介不能超过 255 个字符")
        return text

    @field_validator("dot_color")
    @classmethod
    def _validate_dot_color(cls, value: str) -> str:
        text = (value or "").strip()
        if not _DOT_COLOR_RE.match(text):
            raise ValueError("dotColor 必须是 #rrggbb 形式的颜色值")
        return text


class CategoryUpdateInput(CamelModel):
    name: str | None = None
    description: str | None = None
    dot_color: str | None = None
    sort_order: int | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not 1 <= len(text) <= 64:
            raise ValueError("分类名称长度需为 1-64 个字符")
        return text

    @field_validator("description", mode="before")
    @classmethod
    def _validate_description(cls, value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if len(text) > 255:
            raise ValueError("分类简介不能超过 255 个字符")
        return text

    @field_validator("dot_color")
    @classmethod
    def _validate_dot_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not _DOT_COLOR_RE.match(text):
            raise ValueError("dotColor 必须是 #rrggbb 形式的颜色值")
        return text


class TagRenameInput(CamelModel):
    new_name: str

    @field_validator("new_name")
    @classmethod
    def _validate_new_name(cls, value: str) -> str:
        text = (value or "").strip()
        if not 1 <= len(text) <= 64:
            raise ValueError("标签名称长度需为 1-64 个字符")
        return text


class SiteSettingsUpdateInput(CamelModel):
    """PUT /api/admin/settings 请求体：字段全部可选（不含密码）。"""

    blog_title: str | None = Field(default=None, max_length=100)
    blog_subtitle: str | None = Field(default=None, max_length=255)
    author_name: str | None = Field(default=None, max_length=64)
    author_handle: str | None = Field(default=None, max_length=64)
    author_bio: str | None = Field(default=None, max_length=500)
    author_location: str | None = Field(default=None, max_length=100)
    author_email: str | None = Field(default=None, max_length=120)
    about_content: str | None = None

    @field_validator("blog_title", "author_name")
    @classmethod
    def _validate_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("该字段不能为空字符串")
        return text

    @field_validator("blog_subtitle", "author_handle", "author_bio", "author_location", "author_email")
    @classmethod
    def _validate_optional_text(cls, value: str | None) -> str | None:
        return None if value is None else value.strip()


# ===========================================================================
# 响应模型
# ===========================================================================
class SessionOut(CamelModel):
    is_admin: bool


class SiteSettingsOut(CamelModel):
    """站点设置（绝不含任何密码字段）。"""

    blog_title: str
    blog_subtitle: str
    author_name: str
    author_handle: str
    author_bio: str
    author_location: str
    author_email: str
    about_content: str
    updated_at: str


class CategoryOut(CamelModel):
    id: str
    name: str
    description: str
    dot_color: str
    sort_order: int
    article_count: int = 0


class TagStatOut(CamelModel):
    name: str
    count: int


class ArticleOut(CamelModel):
    id: str
    title: str
    excerpt: str
    content: str
    category_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    published_at: str
    status: ArticleStatus
    pinned: bool
    created_at: str
    updated_at: str


class ArticleNeighborOut(CamelModel):
    id: str
    title: str


class ArticleDetailOut(ArticleOut):
    """文章详情：Article 字段平铺 + prev / next。"""

    prev: ArticleNeighborOut | None = None
    next: ArticleNeighborOut | None = None


T = TypeVar("T")


class PageOut(CamelModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class ArticleListOut(CamelModel):
    items: list[ArticleOut]
    total: int


class ArchiveItemOut(CamelModel):
    id: str
    title: str
    category_id: str | None = None
    published_at: str
    pinned: bool


class ArchiveOut(CamelModel):
    items: list[ArchiveItemOut]
    total: int


class DiaryOut(CamelModel):
    id: str
    date: str
    time: str
    title: str
    mood: MoodType
    tags: list[str] = Field(default_factory=list)
    content: str
    created_at: str
    updated_at: str


class DiaryListOut(CamelModel):
    items: list[DiaryOut]
    total: int


class TagRenameOut(CamelModel):
    ok: bool
    name: str
    merged: bool
    affected: int


class TagDeleteOut(CamelModel):
    ok: bool
    affected: int


class OkOut(CamelModel):
    ok: bool


class BootstrapMetaOut(CamelModel):
    article_count: int
    category_count: int


class BootstrapOut(CamelModel):
    settings: SiteSettingsOut
    categories: list[CategoryOut]
    tags: list[TagStatOut]
    meta: BootstrapMetaOut


class HealthOut(CamelModel):
    status: str
    database: str


# ===========================================================================
# ORM -> 响应模型
# ===========================================================================
def settings_to_out(row: "SiteSetting") -> SiteSettingsOut:
    return SiteSettingsOut(
        blog_title=row.blog_title,
        blog_subtitle=row.blog_subtitle,
        author_name=row.author_name,
        author_handle=row.author_handle,
        author_bio=row.author_bio,
        author_location=row.author_location,
        author_email=row.author_email,
        about_content=row.about_content,
        updated_at=fmt_datetime(row.updated_at),
    )


def category_to_out(category: "Category", article_count: int = 0) -> CategoryOut:
    return CategoryOut(
        id=str(category.id),
        name=category.name,
        description=category.description or "",
        dot_color=category.dot_color or "#3b82f6",
        sort_order=int(category.sort_order or 0),
        article_count=int(article_count or 0),
    )


def article_to_out(article: "Article") -> ArticleOut:
    return ArticleOut(
        id=str(article.id),
        title=article.title,
        excerpt=article.excerpt or "",
        content=article.content or "",
        category_id=str(article.category_id) if article.category_id is not None else None,
        tags=[tag.name for tag in article.tags],
        published_at=fmt_datetime(article.published_at),
        status=article.status,
        pinned=bool(article.pinned),
        created_at=fmt_datetime(article.created_at),
        updated_at=fmt_datetime(article.updated_at),
    )


def article_detail_to_out(
    article: "Article",
    prev_item: ArticleNeighborOut | None,
    next_item: ArticleNeighborOut | None,
) -> ArticleDetailOut:
    base = article_to_out(article)
    return ArticleDetailOut(**base.model_dump(), prev=prev_item, next=next_item)


def diary_to_out(diary: "Diary") -> DiaryOut:
    tags = diary.tags_json
    return DiaryOut(
        id=str(diary.id),
        date=fmt_date(diary.entry_date),
        time=fmt_time(diary.entry_time),
        title=diary.title,
        mood=diary.mood,
        tags=list(tags) if isinstance(tags, list) else ([] if tags is None else [str(tags)]),
        content=diary.content or "",
        created_at=fmt_datetime(diary.created_at),
        updated_at=fmt_datetime(diary.updated_at),
    )
