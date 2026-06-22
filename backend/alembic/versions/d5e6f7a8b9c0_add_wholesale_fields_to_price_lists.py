"""Add wholesale fields to price_lists and description to price_list_items

Revision ID: d5e6f7a8b9c0
Revises: b2b1c3d4e5f6
Create Date: 2026-06-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "b2b1c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    price_lists_columns = {
        column["name"] for column in inspector.get_columns("price_lists")
    }
    price_list_items_columns = {
        column["name"] for column in inspector.get_columns("price_list_items")
    }

    # --- price_lists: add wholesale fields ---
    if "list_type" not in price_lists_columns:
        op.add_column(
            "price_lists",
            sa.Column(
                "list_type", sa.String(20), nullable=False, server_default="snapshot"
            ),
        )
    if "column_config" not in price_lists_columns:
        op.add_column(
            "price_lists",
            sa.Column(
                "column_config",
                postgresql.JSON(astext_type=sa.Text()),
                nullable=True,
            ),
        )
    if "payment_conditions" not in price_lists_columns:
        op.add_column(
            "price_lists",
            sa.Column(
                "payment_conditions",
                postgresql.JSON(astext_type=sa.Text()),
                nullable=True,
            ),
        )

    # --- price_list_items: add description snapshot field ---
    if "description" not in price_list_items_columns:
        op.add_column(
            "price_list_items",
            sa.Column("description", sa.String(500), nullable=True),
        )


def downgrade() -> None:
    # This migration is intentionally recovery-safe: some environments already
    # have these columns even when Alembic has not recorded this revision.
    # Dropping them on downgrade could delete pre-existing production data.
    pass
