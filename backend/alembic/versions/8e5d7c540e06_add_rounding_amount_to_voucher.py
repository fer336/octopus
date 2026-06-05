"""add_rounding_amount_to_voucher

Revision ID: 8e5d7c540e06
Revises: 2ad7df597c92
Create Date: 2026-06-05 19:02:47.348070

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8e5d7c540e06'
down_revision: Union[str, Sequence[str], None] = '2ad7df597c92'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Agrega columna rounding_amount (Numeric 12,2 nullable) a la tabla vouchers."""
    op.add_column('vouchers', sa.Column('rounding_amount', sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    """Elimina la columna rounding_amount de la tabla vouchers."""
    op.drop_column('vouchers', 'rounding_amount')
