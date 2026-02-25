"""add_cash_registers_and_cash_movements_tables

Revision ID: fa3bbaaf3d7b
Revises: e8c2a4f1b369
Create Date: 2026-02-23 18:01:09.262375

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fa3bbaaf3d7b'
down_revision: Union[str, Sequence[str], None] = 'e8c2a4f1b369'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: crea tablas cash_registers y cash_movements."""
    op.create_table(
        'cash_registers',
        sa.Column('business_id', sa.UUID(), nullable=False),
        sa.Column('opened_by', sa.UUID(), nullable=False),
        sa.Column('closed_by', sa.UUID(), nullable=True),
        sa.Column('status', sa.Enum('OPEN', 'CLOSED', name='cashregisterstatus'), nullable=False),
        sa.Column('opening_amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('opened_at', sa.DateTime(), nullable=False),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('counted_cash', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('difference', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('difference_reason', sa.Text(), nullable=True),
        sa.Column('closing_pdf_path', sa.String(length=500), nullable=True),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.ForeignKeyConstraint(['closed_by'], ['users.id']),
        sa.ForeignKeyConstraint(['opened_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cash_registers_business_id'), 'cash_registers', ['business_id'], unique=False)
    op.create_index(op.f('ix_cash_registers_id'), 'cash_registers', ['id'], unique=False)

    op.create_table(
        'cash_movements',
        sa.Column('cash_register_id', sa.UUID(), nullable=False),
        sa.Column('type', sa.Enum('SALE', 'PAYMENT_RECEIVED', 'INCOME', 'EXPENSE', name='cashmovementtype'), nullable=False),
        sa.Column('payment_method', sa.Enum('CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER', name='cashpaymentmethod'), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=False),
        sa.Column('voucher_id', sa.UUID(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['cash_register_id'], ['cash_registers.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['voucher_id'], ['vouchers.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cash_movements_cash_register_id'), 'cash_movements', ['cash_register_id'], unique=False)
    op.create_index(op.f('ix_cash_movements_id'), 'cash_movements', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema: elimina tablas de caja."""
    op.drop_index(op.f('ix_cash_movements_id'), table_name='cash_movements')
    op.drop_index(op.f('ix_cash_movements_cash_register_id'), table_name='cash_movements')
    op.drop_table('cash_movements')
    op.drop_index(op.f('ix_cash_registers_id'), table_name='cash_registers')
    op.drop_index(op.f('ix_cash_registers_business_id'), table_name='cash_registers')
    op.drop_table('cash_registers')
    op.execute("DROP TYPE IF EXISTS cashregisterstatus")
    op.execute("DROP TYPE IF EXISTS cashmovementtype")
    op.execute("DROP TYPE IF EXISTS cashpaymentmethod")
