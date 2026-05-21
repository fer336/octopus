"""add_invoice_x_to_vouchertype_enum

Revision ID: 4d5e6f7a8b9c
Revises: 1418c7624769
Create Date: 2026-05-20 23:45:00.000000

Agrega INVOICE_X al enum vouchertype de PostgreSQL.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4d5e6f7a8b9c'
down_revision: Union[str, Sequence[str], None] = '1418c7624769'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE vouchertype ADD VALUE IF NOT EXISTS 'INVOICE_X'")


def downgrade() -> None:
    # PostgreSQL no permite eliminar valores de enum fácilmente.
    # Para revertir habría que recrear el tipo, lo cual es complejo.
    # Esta operación no es reversible automáticamente.
    pass
