"""create_stockpiles_tables

Revision ID: 2a8c027497f8
Revises: 42b53abba4f8
Create Date: 2026-05-06 21:53:01.619770

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '2a8c027497f8'
down_revision: Union[str, Sequence[str], None] = '42b53abba4f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create stockpiles and stockpile_items tables."""
    # Stockpiles table
    op.create_table(
        'stockpiles',
        sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
        sa.Column('deleted_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
        sa.Column('business_id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('client_id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('billing_client_id', sa.UUID(), autoincrement=True, nullable=True),
        sa.Column('created_by', sa.UUID(), autoincrement=True, nullable=True),
        sa.Column('name', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
        sa.Column('status', sa.VARCHAR(length=20), server_default=sa.text("'open'::character varying"), autoincrement=False, nullable=False),
        sa.Column('currency', sa.VARCHAR(length=10), server_default=sa.text("'ARS'::character varying"), autoincrement=False, nullable=False),
        sa.Column('exchange_rate', sa.NUMERIC(precision=12, scale=2), autoincrement=True, nullable=True),
        sa.Column('initial_amount', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('withdrawn_amount', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('remaining_amount', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('completed_at', postgresql.TIMESTAMP(timezone=True), autoincrement=True, nullable=True),
        sa.Column('notes', sa.TEXT(), autoincrement=True, nullable=True),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], name='stockpiles_business_id_fkey'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], name='stockpiles_client_id_fkey'),
        sa.ForeignKeyConstraint(['billing_client_id'], ['clients.id'], name='stockpiles_billing_client_id_fkey'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='stockpiles_created_by_fkey'),
        sa.PrimaryKeyConstraint('id', name='stockpiles_pkey'),
    )
    op.create_index('ix_stockpiles_business_id', 'stockpiles', ['business_id'], unique=False)
    op.create_index('ix_stockpiles_client_id', 'stockpiles', ['client_id'], unique=False)
    op.create_index('ix_stockpiles_billing_client_id', 'stockpiles', ['billing_client_id'], unique=False)

    # Stockpile items table
    op.create_table(
        'stockpile_items',
        sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), autoincrement=False, nullable=False),
        sa.Column('deleted_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
        sa.Column('stockpile_id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('product_id', sa.UUID(), autoincrement=False, nullable=False),
        sa.Column('quantity_initial', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('quantity_withdrawn', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('quantity_remaining', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('currency', sa.VARCHAR(length=10), server_default=sa.text("'ARS'::character varying"), autoincrement=False, nullable=False),
        sa.Column('frozen_unit_price', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('frozen_iva_rate', sa.NUMERIC(precision=5, scale=2), server_default=sa.text("'21'::numeric"), autoincrement=False, nullable=False),
        sa.Column('frozen_iva_amount', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('frozen_subtotal', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('frozen_total', sa.NUMERIC(precision=12, scale=2), server_default=sa.text("'0'::numeric"), autoincrement=False, nullable=False),
        sa.Column('product_code', sa.VARCHAR(length=50), autoincrement=False, nullable=False),
        sa.Column('product_description', sa.VARCHAR(length=500), autoincrement=False, nullable=False),
        sa.ForeignKeyConstraint(['stockpile_id'], ['stockpiles.id'], name='stockpile_items_stockpile_id_fkey', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], name='stockpile_items_product_id_fkey'),
        sa.PrimaryKeyConstraint('id', name='stockpile_items_pkey'),
    )
    op.create_index('ix_stockpile_items_stockpile_id', 'stockpile_items', ['stockpile_id'], unique=False)
    op.create_index('ix_stockpile_items_product_id', 'stockpile_items', ['product_id'], unique=False)


def downgrade() -> None:
    """Drop stockpiles tables."""
    op.drop_index('ix_stockpile_items_product_id', table_name='stockpile_items')
    op.drop_index('ix_stockpile_items_stockpile_id', table_name='stockpile_items')
    op.drop_index('ix_stockpiles_billing_client_id', table_name='stockpiles')
    op.drop_index('ix_stockpiles_client_id', table_name='stockpiles')
    op.drop_index('ix_stockpiles_business_id', table_name='stockpiles')
    op.drop_table('stockpile_items')
    op.drop_table('stockpiles')