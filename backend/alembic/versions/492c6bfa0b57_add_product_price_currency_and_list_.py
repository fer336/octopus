"""add_product_price_currency_and_list_price_usd

Revision ID: 492c6bfa0b57
Revises: 8a7b6c5d4e3f
Create Date: 2026-05-25 19:31:06.268456

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '492c6bfa0b57'
down_revision: Union[str, Sequence[str], None] = '8a7b6c5d4e3f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('price_currency', sa.String(10), nullable=False, server_default='ARS'))
    op.add_column('products', sa.Column('list_price_usd', sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'list_price_usd')
    op.drop_column('products', 'price_currency')
