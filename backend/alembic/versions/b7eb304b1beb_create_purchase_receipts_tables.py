"""create purchase_receipts and purchase_receipt_items tables

Revision ID: b7eb304b1beb
Revises: 93db341e8ea4
Create Date: 2026-08-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7eb304b1beb'
down_revision: Union[str, Sequence[str], None] = '93db341e8ea4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'purchase_receipts',
        sa.Column('business_id', sa.UUID(), nullable=False),
        sa.Column('supplier_id', sa.UUID(), nullable=True),
        sa.Column('purchase_invoice_id', sa.UUID(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('confirmed_by', sa.UUID(), nullable=True),
        sa.Column('deleted_by', sa.UUID(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('DRAFT', 'CONFIRMED', name='purchasereceiptstatus'),
            nullable=False,
        ),
        sa.Column('receipt_number', sa.String(length=50), nullable=False),
        sa.Column('received_date', sa.Date(), nullable=False),
        sa.Column('expected_invoice_number', sa.String(length=50), nullable=True),
        sa.Column('update_stock', sa.Boolean(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(['purchase_invoice_id'], ['purchase_invoices.id']),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_purchase_receipts_business_id'),
        'purchase_receipts', ['business_id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_receipts_id'), 'purchase_receipts', ['id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_receipts_purchase_invoice_id'),
        'purchase_receipts', ['purchase_invoice_id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_receipts_receipt_number'),
        'purchase_receipts', ['receipt_number'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_receipts_status'), 'purchase_receipts', ['status'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_receipts_supplier_id'),
        'purchase_receipts', ['supplier_id'], unique=False,
    )

    op.create_table(
        'purchase_receipt_items',
        sa.Column('purchase_receipt_id', sa.UUID(), nullable=False),
        sa.Column('product_id', sa.UUID(), nullable=False),
        sa.Column('lot_id', sa.UUID(), nullable=True),
        sa.Column('quantity', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('expiration_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['lot_id'], ['product_lots.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(
            ['purchase_receipt_id'], ['purchase_receipts.id'], ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_purchase_receipt_items_id'), 'purchase_receipt_items', ['id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_receipt_items_lot_id'),
        'purchase_receipt_items', ['lot_id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_receipt_items_product_id'),
        'purchase_receipt_items', ['product_id'], unique=False,
    )
    op.create_index(
        op.f('ix_purchase_receipt_items_purchase_receipt_id'),
        'purchase_receipt_items', ['purchase_receipt_id'], unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_purchase_receipt_items_purchase_receipt_id'),
        table_name='purchase_receipt_items',
    )
    op.drop_index(
        op.f('ix_purchase_receipt_items_product_id'), table_name='purchase_receipt_items',
    )
    op.drop_index(
        op.f('ix_purchase_receipt_items_lot_id'), table_name='purchase_receipt_items',
    )
    op.drop_index(
        op.f('ix_purchase_receipt_items_id'), table_name='purchase_receipt_items',
    )
    op.drop_table('purchase_receipt_items')

    op.drop_index(
        op.f('ix_purchase_receipts_supplier_id'), table_name='purchase_receipts',
    )
    op.drop_index(
        op.f('ix_purchase_receipts_status'), table_name='purchase_receipts',
    )
    op.drop_index(
        op.f('ix_purchase_receipts_receipt_number'), table_name='purchase_receipts',
    )
    op.drop_index(
        op.f('ix_purchase_receipts_purchase_invoice_id'), table_name='purchase_receipts',
    )
    op.drop_index(
        op.f('ix_purchase_receipts_id'), table_name='purchase_receipts',
    )
    op.drop_index(
        op.f('ix_purchase_receipts_business_id'), table_name='purchase_receipts',
    )
    op.drop_table('purchase_receipts')

    sa.Enum(name='purchasereceiptstatus').drop(op.get_bind(), checkfirst=True)
