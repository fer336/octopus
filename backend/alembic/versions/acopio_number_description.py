"""Add stockpile number and editable description

Revision ID: acopio_number_description
Revises: acopio_v2_foundation
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "acopio_number_description"
down_revision: Union[str, Sequence[str], None] = "acopio_v2_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("stockpiles", sa.Column("stockpile_number", sa.String(20), nullable=True))
    op.add_column("stockpiles", sa.Column("description", sa.String(500), nullable=True))
    op.create_index("ix_stockpiles_stockpile_number", "stockpiles", ["stockpile_number"])
    op.create_index(
        "uq_stockpiles_business_number",
        "stockpiles",
        ["business_id", "stockpile_number"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_stockpiles_business_number", table_name="stockpiles")
    op.drop_index("ix_stockpiles_stockpile_number", table_name="stockpiles")
    op.drop_column("stockpiles", "description")
    op.drop_column("stockpiles", "stockpile_number")
