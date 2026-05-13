"""Add expiration_date column to products table.

Revision ID: add_expiration_date_to_products
Revises: search_optimization_trigram_indexes
Create Date: 2026-05-13

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_expiration_date_to_products"
down_revision: str | Sequence[str] | None = "search_optimization_trigram_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "products",
        sa.Column("expiration_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("products", "expiration_date")
