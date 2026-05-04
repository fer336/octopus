"""create_payment_receipts_table

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-05-03 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2e3f4a5b6c7"
down_revision: str | Sequence[str] | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "payment_receipts",
        sa.Column(
            "id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=True,
        ),
        sa.Column(
            "deleted_at",
            sa.DateTime(),
            nullable=True,
        ),
        sa.Column(
            "business_id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "invoice_voucher_id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "client_id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "received_by",
            sa.UUID(),
            nullable=True,
        ),
        sa.Column(
            "payment_date",
            sa.Date(),
            nullable=False,
        ),
        sa.Column(
            "amount",
            sa.Numeric(12, 2),
            nullable=False,
        ),
        sa.Column(
            "payment_method",
            sa.Enum("cash", "transfer", "check", "credit_card", "debit_card", "mercadopago", "other", name="paymentmethod"),
            nullable=False,
        ),
        sa.Column(
            "reference",
            sa.String(100),
            nullable=True,
        ),
        sa.Column(
            "sale_point",
            sa.String(5),
            nullable=False,
        ),
        sa.Column(
            "number",
            sa.String(8),
            nullable=False,
        ),
        sa.Column(
            "notes",
            sa.Text(),
            nullable=True,
        ),
    )
    
    # Agregar índices
    op.create_index("ix_payment_receipts_business_id", "payment_receipts", ["business_id"])
    op.create_index("ix_payment_receipts_invoice_voucher_id", "payment_receipts", ["invoice_voucher_id"])
    op.create_index("ix_payment_receipts_client_id", "payment_receipts", ["client_id"])
    
    # Agregar foreign keys
    op.create_foreign_key(
        "fk_payment_receipts_business_id",
        "payment_receipts",
        "businesses",
        ["business_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_payment_receipts_invoice_voucher_id",
        "payment_receipts",
        "vouchers",
        ["invoice_voucher_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_payment_receipts_client_id",
        "payment_receipts",
        "clients",
        ["client_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_payment_receipts_client_id", "payment_receipts", type_="foreignkey")
    op.drop_constraint("fk_payment_receipts_invoice_voucher_id", "payment_receipts", type_="foreignkey")
    op.drop_constraint("fk_payment_receipts_business_id", "payment_receipts", type_="foreignkey")
    op.drop_index("ix_payment_receipts_client_id", "payment_receipts")
    op.drop_index("ix_payment_receipts_invoice_voucher_id", "payment_receipts")
    op.drop_index("ix_payment_receipts_business_id", "payment_receipts")
    op.drop_table("payment_receipts")