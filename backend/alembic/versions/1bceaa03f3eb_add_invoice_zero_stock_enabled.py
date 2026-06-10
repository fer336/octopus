"""Add invoice_zero_stock_enabled to businesses.

Revision ID: 1bceaa03f3eb
Revises: z9y8x7w6v5u4
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "1bceaa03f3eb"
down_revision = "z9y8x7w6v5u4"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("businesses")}

    if "invoice_zero_stock_enabled" not in columns:
        op.add_column(
            "businesses",
            sa.Column(
                "invoice_zero_stock_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("businesses")}

    if "invoice_zero_stock_enabled" in columns:
        op.drop_column("businesses", "invoice_zero_stock_enabled")
