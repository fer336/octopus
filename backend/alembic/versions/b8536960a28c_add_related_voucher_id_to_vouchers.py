"""add related_voucher_id to vouchers

Revision ID: b8536960a28c
Revises: 0a9a80888ff8
Create Date: 2026-02-14 00:18:57.142676

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8536960a28c'
down_revision: Union[str, Sequence[str], None] = '0a9a80888ff8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Agregar columna related_voucher_id para referenciar factura original en NC
    op.add_column('vouchers', sa.Column('related_voucher_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_vouchers_related_voucher_id',
        'vouchers', 'vouchers',
        ['related_voucher_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_vouchers_related_voucher_id', 'vouchers', type_='foreignkey')
    op.drop_column('vouchers', 'related_voucher_id')
