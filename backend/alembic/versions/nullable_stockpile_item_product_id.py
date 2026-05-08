"""Allow amount-based stockpile items without product

Revision ID: stockpile_item_product_null
Revises: add_discount_percent
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "stockpile_item_product_null"
down_revision: Union[str, Sequence[str], None] = "add_discount_percent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "stockpile_items",
        "product_id",
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "stockpile_items",
        "product_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
