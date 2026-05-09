"""Add stockpile_enabled to businesses.

Revision ID: x1y2z3w4v5u6_add_stockpile_enabled
Revises: 
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "x1y2z3w4v5u6_add_stockpile_enabled"
down_revision = "a9b8c7d6e5f4_add_linear_sync_flag_to_business"


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("stockpile_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("businesses", "stockpile_enabled")