"""Add hide_business_name_in_pdf flag to businesses.

Revision ID: m1n2o3p4q5r6
Revises: x1y2z3w4v5u6
Create Date: 2026-05-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "m1n2o3p4q5r6"
down_revision = "x1y2z3w4v5u6"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("businesses")}

    if "hide_business_name_in_pdf" not in columns:
        op.add_column(
            "businesses",
            sa.Column(
                "hide_business_name_in_pdf",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("businesses")}

    if "hide_business_name_in_pdf" in columns:
        op.drop_column("businesses", "hide_business_name_in_pdf")
