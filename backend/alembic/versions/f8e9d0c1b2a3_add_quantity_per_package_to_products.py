"""add quantity_per_package to products

Revision ID: f8e9d0c1b2a3
Revises: 492c6bfa0b57
Create Date: 2026-05-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f8e9d0c1b2a3'
down_revision: Union[str, Sequence[str], None] = '492c6bfa0b57'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('quantity_per_package', sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'quantity_per_package')
