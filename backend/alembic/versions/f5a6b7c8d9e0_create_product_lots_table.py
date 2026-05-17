"""create_product_lots_table

Revision ID: f5a6b7c8d9e0
Revises: 842969c6a2a4
Create Date: 2026-05-13 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, Sequence[str], None] = '842969c6a2a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create product_lots table."""
    op.create_table(
        'product_lots',
        sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
        sa.Column('deleted_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
        sa.Column('product_id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('business_id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('code', sa.VARCHAR(length=50), autoincrement=False, nullable=True),
        sa.Column('quantity', sa.Integer(), server_default=sa.text('0'), autoincrement=False, nullable=False),
        sa.Column('initial_quantity', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('expiration_date', sa.Date(), autoincrement=False, nullable=True),
        sa.Column('cost_price', sa.NUMERIC(precision=12, scale=2), autoincrement=False, nullable=True),
        sa.Column('received_date', sa.Date(), server_default=sa.text('CURRENT_DATE'), autoincrement=False, nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], name='product_lots_product_id_fkey'),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name='product_lots_business_id_fkey'),
        sa.PrimaryKeyConstraint('id', name='product_lots_pkey'),
    )
    op.create_index('ix_product_lots_product_id', 'product_lots', ['product_id'], unique=False)
    op.create_index('ix_product_lots_business_id', 'product_lots', ['business_id'], unique=False)


def downgrade() -> None:
    """Drop product_lots table."""
    op.drop_index('ix_product_lots_business_id', table_name='product_lots')
    op.drop_index('ix_product_lots_product_id', table_name='product_lots')
    op.drop_table('product_lots')
