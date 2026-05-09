"""add logo layout fields to businesses

Revision ID: b_logo_layout_20260509
Revises: m1n2o3p4q5r6
Create Date: 2026-05-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "b_logo_layout_20260509"
down_revision: str | Sequence[str] | None = "m1n2o3p4q5r6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("businesses")}

    if "logo_position" not in columns:
        op.add_column(
            "businesses",
            sa.Column(
                "logo_position",
                sa.String(length=20),
                nullable=False,
                server_default="left",
            ),
        )

    if "logo_display_mode" not in columns:
        op.add_column(
            "businesses",
            sa.Column(
                "logo_display_mode",
                sa.String(length=30),
                nullable=False,
                server_default="alongside_text",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("businesses")}

    if "logo_display_mode" in columns:
        op.drop_column("businesses", "logo_display_mode")

    if "logo_position" in columns:
        op.drop_column("businesses", "logo_position")
