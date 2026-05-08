"""Add discount_percent to stockpiles

Revision ID: add_discount_percent
Revises: 2a8c027497f8
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'add_discount_percent'
down_revision: Union[str, Sequence[str], None] = '2a8c027497f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'stockpiles',
        sa.Column('discount_percent', sa.NUMERIC(precision=5, scale=2), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('stockpiles', 'discount_percent')