"""初始表结构（手写，与 app/models.py 逐列一致）。

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-25

严格遵循 docs/DEVELOPMENT_SPEC.md 第 4 章：
* 5 张表 + article_tags 关联表，全部 ENGINE=InnoDB / CHARSET=utf8mb4 / COLLATE=utf8mb4_unicode_ci
* articles.category_id 外键 ON DELETE SET NULL
* article_tags 复合主键 + 双外键 CASCADE
* 索引方向：idx_articles_public_sort (status, pinned DESC, published_at DESC)、
  idx_diaries_timeline (entry_date DESC, entry_time DESC)
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

_TABLE_OPTIONS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"

_CREATE_SITE_SETTINGS = f"""
CREATE TABLE `site_settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `blog_title` VARCHAR(100) NOT NULL,
  `blog_subtitle` VARCHAR(255) NOT NULL DEFAULT '',
  `author_name` VARCHAR(64) NOT NULL,
  `author_handle` VARCHAR(64) NOT NULL DEFAULT '',
  `author_bio` VARCHAR(500) NOT NULL DEFAULT '',
  `author_location` VARCHAR(100) NOT NULL DEFAULT '',
  `author_email` VARCHAR(120) NOT NULL DEFAULT '',
  `about_content` MEDIUMTEXT NOT NULL,
  `admin_password_hash` VARCHAR(255) NOT NULL,
  `token_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) {_TABLE_OPTIONS}
"""

_CREATE_CATEGORIES = f"""
CREATE TABLE `categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `description` VARCHAR(255) NOT NULL DEFAULT '',
  `dot_color` VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_name` (`name`)
) {_TABLE_OPTIONS}
"""

_CREATE_TAGS = f"""
CREATE TABLE `tags` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tags_name` (`name`)
) {_TABLE_OPTIONS}
"""

_CREATE_ARTICLES = f"""
CREATE TABLE `articles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `excerpt` VARCHAR(500) NOT NULL DEFAULT '',
  `content` MEDIUMTEXT NOT NULL,
  `category_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `published_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('published','draft') NOT NULL DEFAULT 'published',
  `pinned` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_articles_public_sort` (`status`, `pinned` DESC, `published_at` DESC),
  KEY `idx_articles_category` (`category_id`),
  CONSTRAINT `fk_articles_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON DELETE SET NULL ON UPDATE RESTRICT
) {_TABLE_OPTIONS}
"""

_CREATE_ARTICLE_TAGS = f"""
CREATE TABLE `article_tags` (
  `article_id` BIGINT UNSIGNED NOT NULL,
  `tag_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`article_id`, `tag_id`),
  KEY `idx_article_tags_tag` (`tag_id`),
  CONSTRAINT `fk_article_tags_article` FOREIGN KEY (`article_id`) REFERENCES `articles` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_article_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`)
    ON DELETE CASCADE ON UPDATE RESTRICT
) {_TABLE_OPTIONS}
"""

_CREATE_DIARIES = f"""
CREATE TABLE `diaries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `entry_date` DATE NOT NULL,
  `entry_time` TIME NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `mood` ENUM('focused','calm','inspired','happy','tired') NOT NULL DEFAULT 'focused',
  `tags_json` JSON NOT NULL,
  `content` MEDIUMTEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_diaries_timeline` (`entry_date` DESC, `entry_time` DESC)
) {_TABLE_OPTIONS}
"""


def upgrade() -> None:
    # 顺序：site_settings -> categories -> tags -> articles -> article_tags -> diaries
    op.execute(_CREATE_SITE_SETTINGS.strip())
    op.execute(_CREATE_CATEGORIES.strip())
    op.execute(_CREATE_TAGS.strip())
    op.execute(_CREATE_ARTICLES.strip())
    op.execute(_CREATE_ARTICLE_TAGS.strip())
    op.execute(_CREATE_DIARIES.strip())


def downgrade() -> None:
    # 反向删除（先删外键从表）
    op.execute("DROP TABLE IF EXISTS `article_tags`")
    op.execute("DROP TABLE IF EXISTS `articles`")
    op.execute("DROP TABLE IF EXISTS `diaries`")
    op.execute("DROP TABLE IF EXISTS `tags`")
    op.execute("DROP TABLE IF EXISTS `categories`")
    op.execute("DROP TABLE IF EXISTS `site_settings`")
