"""add price_update_drafts table

Revision ID: e8c2a4f1b369
Revises: d3f1b7c9a452
Create Date: 2026-02-23 12:00:00.000000

Tabla para guardar borradores de actualización masiva de precios.
Permite al usuario guardar el estado intermedio del modal de edición
y retomarlo en otro momento sin perder los cambios.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e8c2a4f1b369'
down_revision: Union[str, Sequence[str], None] = 'd3f1b7c9a452'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'price_update_drafts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('business_id', sa.UUID(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('filter_category_id', sa.UUID(), nullable=True),
        sa.Column('filter_category_name', sa.String(255), nullable=True),
        sa.Column('filter_supplier_id', sa.UUID(), nullable=True),
        sa.Column('filter_supplier_name', sa.String(255), nullable=True),
        sa.Column('filter_search', sa.String(255), nullable=True),
        sa.Column('products_data', sa.Text(), nullable=False),
        sa.Column('product_count', sa.String(10), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_price_update_drafts_id', 'price_update_drafts', ['id'])
    op.create_index('ix_price_update_drafts_business_id', 'price_update_drafts', ['business_id'])


def downgrade() -> None:
    op.drop_index('ix_price_update_drafts_business_id', table_name='price_update_drafts')
    op.drop_index('ix_price_update_drafts_id', table_name='price_update_drafts')
    op.drop_table('price_update_drafts')
