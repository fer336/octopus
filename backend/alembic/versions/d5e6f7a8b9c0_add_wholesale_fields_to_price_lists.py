"""Add wholesale fields to price_lists and description to price_list_items

Revision ID: d5e6f7a8b9c0
Revises: b2b1c3d4e5f6
Create Date: 2026-06-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "b2b1c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- price_lists: add wholesale fields ---
    op.add_column(
        "price_lists",
        sa.Column(
            "list_type", sa.String(20), nullable=False, server_default="snapshot"
        ),
    )
    op.add_column(
        "price_lists",
        sa.Column("column_config", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "price_lists",
        sa.Column("payment_conditions", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )

    # --- price_list_items: add description snapshot field ---
    op.add_column(
        "price_list_items",
        sa.Column("description", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("price_list_items", "description")
    op.drop_column("price_lists", "payment_conditions")
    op.drop_column("price_lists", "column_config")
    op.drop_column("price_lists", "list_type")
