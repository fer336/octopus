"""add cost_price and cost_price_estimated to voucher_items

Revision ID: add_cost_price_001
Revises: merge_20260622_001
Create Date: 2026-06-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "add_cost_price_001"
down_revision: Union[str, Sequence[str], None] = "merge_20260622_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("voucher_items")}

    if "cost_price" not in columns:
        op.add_column(
            "voucher_items",
            sa.Column("cost_price", sa.Numeric(12, 2), nullable=True),
        )
    if "cost_price_estimated" not in columns:
        op.add_column(
            "voucher_items",
            sa.Column(
                "cost_price_estimated",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )
        # Quitar server_default después de agregar para no afectar inserts futuros
        op.alter_column(
            "voucher_items",
            "cost_price_estimated",
            server_default=None,
        )


def downgrade() -> None:
    op.drop_column("voucher_items", "cost_price_estimated")
    op.drop_column("voucher_items", "cost_price")
