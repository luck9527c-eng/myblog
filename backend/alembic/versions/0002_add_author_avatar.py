"""为 site_settings 增加 author_avatar 字段。

Revision ID: 0002_add_author_avatar
Revises: 0001_initial
Create Date: 2026-11-26
"""

from __future__ import annotations

from alembic import op

revision = "0002_add_author_avatar"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE `site_settings` "
        "ADD COLUMN `author_avatar` VARCHAR(255) NOT NULL DEFAULT '' AFTER `author_handle`"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE `site_settings` DROP COLUMN `author_avatar`")
