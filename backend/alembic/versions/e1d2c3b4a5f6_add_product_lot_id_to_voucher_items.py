"""add_product_lot_id_to_voucher_items

Revision ID: e1d2c3b4a5f6
Revises: f5a6b7c8d9e0
Create Date: 2026-05-13 22:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e1d2c3b4a5f6'
down_revision: Union[str, Sequence[str], None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add product_lot_id column to voucher_items."""
    op.add_column(
        'voucher_items',
        sa.Column('product_lot_id', sa.UUID(), nullable=True),
    )
    op.create_index(
        'ix_voucher_items_product_lot_id',
        'voucher_items',
        ['product_lot_id'],
        unique=False,
    )
    op.create_foreign_key(
        'voucher_items_product_lot_id_fkey',
        'voucher_items',
        'product_lots',
        ['product_lot_id'],
        ['id'],
    )


def downgrade() -> None:
    """Drop product_lot_id column from voucher_items."""
    op.drop_constraint(
        'voucher_items_product_lot_id_fkey',
        'voucher_items',
        type_='foreignkey',
    )
    op.drop_index('ix_voucher_items_product_lot_id', table_name='voucher_items')
    op.drop_column('voucher_items', 'product_lot_id')
