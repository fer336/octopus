"""Add stockpile_price_snapshots table

Revision ID: 8a7b6c5d4e3f
Revises: 4d5e6f7a8b9c
Create Date: 2026-05-25 03:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "8a7b6c5d4e3f"
down_revision: Union[str, Sequence[str], None] = "4d5e6f7a8b9c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stockpile_price_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column(
            "stockpile_id",
            UUID(as_uuid=True),
            sa.ForeignKey("stockpiles.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "product_id",
            UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column(
            "price_without_iva",
            sa.Numeric(12, 2),
            nullable=False,
        ),
        sa.Column("iva_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("iva_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("price_with_iva", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "frozen_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_stockpile_price_snapshots_stockpile_product",
        "stockpile_price_snapshots",
        ["stockpile_id", "product_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_stockpile_price_snapshots_stockpile_product",
        table_name="stockpile_price_snapshots",
    )
    op.drop_table("stockpile_price_snapshots")
