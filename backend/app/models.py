"""ORM 模型，严格对应 docs/DEVELOPMENT_SPEC.md 第 4 章的 5 张表。

DDL 由 ``alembic/versions/0001_initial.py`` 手写创建（与本文各列/索引一一对应），
统一 ``ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci``。
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Column,
    ForeignKey,
    Index,
    String,
    Table,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import (
    BIGINT,
    DATE,
    DATETIME,
    ENUM,
    INTEGER,
    JSON,
    MEDIUMTEXT,
    TIME,
    TINYINT,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

#: 所有表统一的 MySQL 表选项
MYSQL_TABLE_ARGS: dict[str, str] = {
    "mysql_engine": "InnoDB",
    "mysql_charset": "utf8mb4",
    "mysql_collate": "utf8mb4_unicode_ci",
}

#: 更新时间列的 MySQL 服务端默认值（含 ON UPDATE）
_UPDATED_AT_SERVER_DEFAULT = text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")


class SiteSetting(Base):
    """站点配置（单行配置表，主键固定为 1）。"""

    __tablename__ = "site_settings"
    __table_args__ = MYSQL_TABLE_ARGS

    id: Mapped[int] = mapped_column(
        TINYINT(unsigned=True),
        primary_key=True,
        autoincrement=False,
        default=1,
        server_default=text("1"),
    )
    blog_title: Mapped[str] = mapped_column(String(100), nullable=False)
    blog_subtitle: Mapped[str] = mapped_column(String(255), nullable=False, server_default=text("''"))
    author_name: Mapped[str] = mapped_column(String(64), nullable=False)
    author_handle: Mapped[str] = mapped_column(String(64), nullable=False, server_default=text("''"))
    author_avatar: Mapped[str] = mapped_column(String(255), nullable=False, server_default=text("''"))
    author_bio: Mapped[str] = mapped_column(String(500), nullable=False, server_default=text("''"))
    author_location: Mapped[str] = mapped_column(String(100), nullable=False, server_default=text("''"))
    author_email: Mapped[str] = mapped_column(String(120), nullable=False, server_default=text("''"))
    about_content: Mapped[str] = mapped_column(MEDIUMTEXT, nullable=False)
    #: 管理员密码哈希（严禁出现在任何响应中）
    admin_password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    #: 改密后递增，用于让旧会话失效
    token_version: Mapped[int] = mapped_column(
        INTEGER(unsigned=True), nullable=False, default=1, server_default=text("1")
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DATETIME, nullable=False, server_default=_UPDATED_AT_SERVER_DEFAULT
    )


class Category(Base):
    """文章分类。"""

    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("name", name="uq_categories_name"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, server_default=text("''"))
    dot_color: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'#3b82f6'"))
    sort_order: Mapped[int] = mapped_column(INTEGER, nullable=False, default=0, server_default=text("0"))
    created_at: Mapped[dt.datetime] = mapped_column(
        DATETIME, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )


class Tag(Base):
    """文章标签。"""

    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("name", name="uq_tags_name"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)


class Article(Base):
    """文章（第一版无 views 阅读量字段）。"""

    __tablename__ = "articles"
    # 索引列集合与 SPEC §4.3 一致；列方向（pinned DESC / published_at DESC）由手写迁移的
    # CREATE TABLE 语句创建（模型层只声明参与索引的列）。
    __table_args__ = (
        Index("idx_articles_public_sort", "status", "pinned", "published_at"),
        Index("idx_articles_category", "category_id"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    excerpt: Mapped[str] = mapped_column(String(500), nullable=False, server_default=text("''"))
    content: Mapped[str] = mapped_column(MEDIUMTEXT, nullable=False)
    category_id: Mapped[int | None] = mapped_column(
        BIGINT(unsigned=True),
        ForeignKey("categories.id", name="fk_articles_category", ondelete="SET NULL", onupdate="RESTRICT"),
        nullable=True,
    )
    published_at: Mapped[dt.datetime] = mapped_column(
        DATETIME, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    status: Mapped[str] = mapped_column(
        ENUM("published", "draft"), nullable=False, server_default=text("'published'")
    )
    pinned: Mapped[int] = mapped_column(TINYINT(display_width=1), nullable=False, default=0, server_default=text("0"))
    created_at: Mapped[dt.datetime] = mapped_column(
        DATETIME, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DATETIME, nullable=False, server_default=_UPDATED_AT_SERVER_DEFAULT
    )

    tags: Mapped[list[Tag]] = relationship(
        secondary="article_tags",
        lazy="selectin",
        order_by="Tag.id",
    )


#: 文章 <-> 标签 多对多关联表（复合主键 + 双外键 CASCADE）
article_tags = Table(
    "article_tags",
    Base.metadata,
    Column(
        "article_id",
        BIGINT(unsigned=True),
        ForeignKey("articles.id", name="fk_article_tags_article", ondelete="CASCADE", onupdate="RESTRICT"),
        primary_key=True,
        nullable=False,
    ),
    Column(
        "tag_id",
        BIGINT(unsigned=True),
        ForeignKey("tags.id", name="fk_article_tags_tag", ondelete="CASCADE", onupdate="RESTRICT"),
        primary_key=True,
        nullable=False,
    ),
    **MYSQL_TABLE_ARGS,
)

#: tag_id 单列索引（标签重命名/删除时按 tag_id 检索；MySQL 外键本身也会隐式创建）
Index("idx_article_tags_tag", article_tags.c.tag_id)


class Diary(Base):
    """私有日记 / 每日日报（仅管理员可见）。"""

    __tablename__ = "diaries"
    __table_args__ = (
        Index("idx_diaries_timeline", "entry_date", "entry_time"),
        MYSQL_TABLE_ARGS,
    )

    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    entry_date: Mapped[dt.date] = mapped_column(DATE, nullable=False)
    #: MySQL TIME 列，读回可能是 datetime.time 或 datetime.timedelta，由 utils.fmt_time 兼容
    entry_time: Mapped[dt.time] = mapped_column(TIME, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    mood: Mapped[str] = mapped_column(
        ENUM("focused", "calm", "inspired", "happy", "tired"),
        nullable=False,
        server_default=text("'focused'"),
    )
    tags_json: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    content: Mapped[str] = mapped_column(MEDIUMTEXT, nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DATETIME, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DATETIME, nullable=False, server_default=_UPDATED_AT_SERVER_DEFAULT
    )
