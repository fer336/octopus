"""add_product_profit_margin

Revision ID: a1b2c3d4e5f6
Revises: 594c26beebec
Create Date: 2026-02-28 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str | Sequence[str] | None = '594c26beebec'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('products', sa.Column('profit_margin', sa.Numeric(precision=5, scale=2), nullable=False, server_default="0"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('products', 'profit_margin')
