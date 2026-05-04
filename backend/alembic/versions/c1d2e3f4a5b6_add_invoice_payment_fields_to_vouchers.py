"""add_invoice_payment_fields_to_vouchers

Revision ID: c1d2e3f4a5b6
Revises: c4d5e6f7a8b9
Create Date: 2026-05-03 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Agregar payment_days - días de plazo para facturas CC
    op.add_column(
        "vouchers",
        sa.Column(
            "payment_days",
            sa.Numeric(3, 0),
            nullable=True,
        ),
    )
    # Agregar is_paid - si la factura está pagada
    op.add_column(
        "vouchers",
        sa.Column(
            "is_paid",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Agregar payment_date - fecha del pago
    op.add_column(
        "vouchers",
        sa.Column(
            "payment_date",
            sa.Date(),
            nullable=True,
        ),
    )
    # Agregar paid_amount - monto abonado (puede ser parcial)
    op.add_column(
        "vouchers",
        sa.Column(
            "paid_amount",
            sa.Numeric(12, 2),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("vouchers", "paid_amount")
    op.drop_column("vouchers", "payment_date")
    op.drop_column("vouchers", "is_paid")
    op.drop_column("vouchers", "payment_days")