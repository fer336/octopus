"""add_lot_consumptions_and_created_by

Adds:
- lot_consumptions table (auditable FIFO consumption)
- created_by column to product_lots (user attribution)

Revision ID: 53c349442068
Revises: z9y8x7w6v5u4
Create Date: 2026-05-14 23:49:39.245079

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "53c349442068"
down_revision: Union[str, Sequence[str], None] = "z9y8x7w6v5u4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create lot_consumptions table and add created_by to product_lots."""

    # ── 1. Agregar created_by a product_lots ──────────────────────
    op.add_column(
        "product_lots",
        sa.Column(
            "created_by",
            sa.UUID(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_product_lots_created_by",
        "product_lots",
        "users",
        ["created_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_product_lots_created_by",
        "product_lots",
        ["created_by"],
        unique=False,
    )

    # ── 2. Crear tabla lot_consumptions ───────────────────────────
    op.create_table(
        "lot_consumptions",
        sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "deleted_at",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=True,
        ),
        sa.Column(
            "voucher_item_id",
            sa.UUID(),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column("lot_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column(
            "quantity_taken",
            sa.Integer(),
            autoincrement=False,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["voucher_item_id"],
            ["voucher_items.id"],
            name="fk_lot_consumptions_voucher_item_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lot_id"],
            ["product_lots.id"],
            name="fk_lot_consumptions_lot_id",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_lot_consumptions"),
    )
    op.create_index(
        "ix_lot_consumptions_voucher_item_id",
        "lot_consumptions",
        ["voucher_item_id"],
        unique=False,
    )
    op.create_index(
        "ix_lot_consumptions_lot_id",
        "lot_consumptions",
        ["lot_id"],
        unique=False,
    )


def downgrade() -> None:
    """Reverse: drop lot_consumptions table, remove created_by from product_lots."""

    # ── 1. Eliminar tabla lot_consumptions ────────────────────────
    op.drop_index("ix_lot_consumptions_lot_id", table_name="lot_consumptions")
    op.drop_index(
        "ix_lot_consumptions_voucher_item_id",
        table_name="lot_consumptions",
    )
    op.drop_table("lot_consumptions")

    # ── 2. Eliminar created_by de product_lots ────────────────────
    op.drop_index("ix_product_lots_created_by", table_name="product_lots")
    op.drop_constraint(
        "fk_product_lots_created_by",
        "product_lots",
        type_="foreignkey",
    )
    op.drop_column("product_lots", "created_by")
