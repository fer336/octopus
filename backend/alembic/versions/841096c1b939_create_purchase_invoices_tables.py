"""create purchase_invoices and purchase_invoice_items tables

Revision ID: 841096c1b939
Revises: 0060c898b849
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '841096c1b939'
down_revision: Union[str, Sequence[str], None] = '0060c898b849'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'purchase_invoices',
        sa.Column('business_id', sa.UUID(), nullable=False),
        sa.Column('supplier_id', sa.UUID(), nullable=True),
        sa.Column('purchase_order_id', sa.UUID(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('confirmed_by', sa.UUID(), nullable=True),
        sa.Column('deleted_by', sa.UUID(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('DRAFT', 'CONFIRMED', name='purchaseinvoicestatus'),
            nullable=False,
        ),
        sa.Column(
            'source',
            sa.Enum('MANUAL', 'AI', name='purchaseinvoicesource'),
            nullable=False,
        ),
        sa.Column('invoice_number', sa.String(length=50), nullable=False),
        sa.Column('invoice_date', sa.Date(), nullable=False),
        sa.Column('update_stock', sa.Boolean(), nullable=False),
        sa.Column('update_prices', sa.Boolean(), nullable=False),
        sa.Column('subtotal', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('iva_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('source_document_key', sa.String(length=500), nullable=True),
        sa.Column('is_duplicate_ack', sa.Boolean(), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(), nullable=True),
        sa.Column('deletion_reason', sa.Text(), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.ForeignKeyConstraint(['confirmed_by'], ['users.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['deleted_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id']),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_purchase_invoices_business_id'),
        'purchase_invoices', ['business_id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_invoices_id'), 'purchase_invoices', ['id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_invoices_invoice_number'),
        'purchase_invoices', ['invoice_number'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_invoices_purchase_order_id'),
        'purchase_invoices', ['purchase_order_id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_invoices_status'), 'purchase_invoices', ['status'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_invoices_supplier_id'),
        'purchase_invoices', ['supplier_id'], unique=False,
    )

    op.create_table(
        'purchase_invoice_items',
        sa.Column('purchase_invoice_id', sa.UUID(), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=True),
        sa.Column('lot_id', sa.UUID(), nullable=True),
        sa.Column('description', sa.String(length=500), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('unit_cost', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('iva_rate', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('expiration_date', sa.Date(), nullable=True),
        sa.Column('subtotal', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('iva_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['lot_id'], ['product_lots.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(
            ['purchase_invoice_id'], ['purchase_invoices.id'], ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_purchase_invoice_items_id'), 'purchase_invoice_items', ['id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_invoice_items_lot_id'),
        'purchase_invoice_items', ['lot_id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_invoice_items_product_id'),
        'purchase_invoice_items', ['product_id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_invoice_items_purchase_invoice_id'),
        'purchase_invoice_items', ['purchase_invoice_id'], unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_purchase_invoice_items_purchase_invoice_id'),
        table_name='purchase_invoice_items',
    )
    op.drop_index(
        op.f('ix_purchase_invoice_items_product_id'), table_name='purchase_invoice_items',
    )
    op.drop_index(
        op.f('ix_purchase_invoice_items_lot_id'), table_name='purchase_invoice_items',
    )
    op.drop_index(
        op.f('ix_purchase_invoice_items_id'), table_name='purchase_invoice_items',
    )
    op.drop_table('purchase_invoice_items')

    op.drop_index(
        op.f('ix_purchase_invoices_supplier_id'), table_name='purchase_invoices',
    )
    op.drop_index(
        op.f('ix_purchase_invoices_status'), table_name='purchase_invoices',
    )
    op.drop_index(
        op.f('ix_purchase_invoices_purchase_order_id'), table_name='purchase_invoices',
    )
    op.drop_index(
        op.f('ix_purchase_invoices_invoice_number'), table_name='purchase_invoices',
    )
    op.drop_index(
        op.f('ix_purchase_invoices_id'), table_name='purchase_invoices',
    )
    op.drop_index(
        op.f('ix_purchase_invoices_business_id'), table_name='purchase_invoices',
    )
    op.drop_table('purchase_invoices')

    sa.Enum(name='purchaseinvoicesource').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='purchaseinvoicestatus').drop(op.get_bind(), checkfirst=True)
