"""add sell_per_unit to products

Revision ID: c9d0e1f2a3b4
Revises: f8e9d0c1b2a3
Create Date: 2026-05-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'f8e9d0c1b2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('sell_per_unit', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('products', 'sell_per_unit')
