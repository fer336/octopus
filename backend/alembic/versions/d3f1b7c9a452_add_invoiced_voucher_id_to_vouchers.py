"""add invoiced_voucher_id to vouchers

Revision ID: d3f1b7c9a452
Revises: b8536960a28c
Create Date: 2026-02-23 00:00:00.000000

Agrega el campo invoiced_voucher_id a la tabla vouchers.
Este campo almacena el ID de la factura generada a partir de una cotización,
permitiendo saber si una cotización ya fue facturada.

Reglas de negocio:
- Si invoiced_voucher_id IS NULL → cotización pendiente de facturar
- Si invoiced_voucher_id NOT NULL → cotización ya facturada (no se puede volver a facturar)
- La única forma de revertir es emitiendo una Nota de Crédito Fiscal desde la factura generada
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd3f1b7c9a452'
down_revision: str | Sequence[str] | None = '8b5905d522b4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: agrega invoiced_voucher_id para trackear cotizaciones facturadas."""
    op.add_column('vouchers', sa.Column('invoiced_voucher_id', sa.UUID(), nullable=True))
    op.create_index(
        'ix_vouchers_invoiced_voucher_id',
        'vouchers',
        ['invoiced_voucher_id'],
    )
    op.create_foreign_key(
        'fk_vouchers_invoiced_voucher_id',
        'vouchers', 'vouchers',
        ['invoiced_voucher_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema: elimina invoiced_voucher_id."""
    op.drop_constraint('fk_vouchers_invoiced_voucher_id', 'vouchers', type_='foreignkey')
    op.drop_index('ix_vouchers_invoiced_voucher_id', table_name='vouchers')
    op.drop_column('vouchers', 'invoiced_voucher_id')
