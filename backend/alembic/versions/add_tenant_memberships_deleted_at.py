"""add deleted_at to tenant_memberships

Revision ID: add_tenant_memberships_deleted_at
Revises: acopio_number_description
Create Date: 2026-05-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "tm_deleted_at_20260508"
down_revision: str | Sequence[str] | None = "acopio_number_description"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Agrega soft delete faltante para alinear la tabla con BaseModel."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("tenant_memberships")}

    if "deleted_at" not in columns:
        op.add_column(
            "tenant_memberships",
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    """Elimina soft delete de tenant_memberships."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("tenant_memberships")}

    if "deleted_at" in columns:
        op.drop_column("tenant_memberships", "deleted_at")
