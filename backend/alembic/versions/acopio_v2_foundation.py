"""Add acopio v2 foundation (expiration, principal voucher)

Revision ID: acopio_v2_foundation
Revises: stockpile_item_product_null
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "acopio_v2_foundation"
down_revision: Union[str, Sequence[str], None] = "stockpile_item_product_null"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Agregar expiration_mode a stockpiles (default 'none')
    op.add_column(
        "stockpiles",
        sa.Column(
            "expiration_mode",
            sa.String(20),
            nullable=False,
            server_default="none",
        ),
    )

    # Agregar due_date a stockpiles
    op.add_column(
        "stockpiles",
        sa.Column(
            "due_date",
            sa.Date(),
            nullable=True,
        ),
    )

    # Agregar principal_voucher_id a stockpiles
    op.add_column(
        "stockpiles",
        sa.Column(
            "principal_voucher_id",
            UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "stockpiles_principal_voucher_id_fkey",
        "stockpiles",
        "vouchers",
        ["principal_voucher_id"],
        ["id"],
    )
    op.create_index(
        "ix_stockpiles_principal_voucher_id",
        "stockpiles",
        ["principal_voucher_id"],
        unique=False,
    )

    # Agregar stockpile_id a vouchers
    op.add_column(
        "vouchers",
        sa.Column(
            "stockpile_id",
            UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "vouchers_stockpile_id_fkey",
        "vouchers",
        "stockpiles",
        ["stockpile_id"],
        ["id"],
    )
    op.create_index(
        "ix_vouchers_stockpile_id",
        "vouchers",
        ["stockpile_id"],
        unique=False,
    )


def downgrade() -> None:
    # Eliminar stockpile_id de vouchers primero (por FK)
    op.drop_index("ix_vouchers_stockpile_id", table_name="vouchers")
    op.drop_constraint("vouchers_stockpile_id_fkey", "vouchers", type_="foreignkey")
    op.drop_column("vouchers", "stockpile_id")

    # Eliminar principal_voucher_id, due_date, expiration_mode de stockpiles
    op.drop_index("ix_stockpiles_principal_voucher_id", table_name="stockpiles")
    op.drop_constraint(
        "stockpiles_principal_voucher_id_fkey",
        "stockpiles",
        type_="foreignkey",
    )
    op.drop_column("stockpiles", "principal_voucher_id")
    op.drop_column("stockpiles", "due_date")
    op.drop_column("stockpiles", "expiration_mode")
