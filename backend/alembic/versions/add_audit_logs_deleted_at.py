"""add deleted_at to audit_logs

Revision ID: add_audit_logs_deleted_at
Revises: tm_deleted_at_20260508
Create Date: 2026-05-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = "add_audit_logs_deleted_at"
down_revision: str | Sequence[str] | None = "tm_deleted_at_20260508"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Agrega soft delete faltante para alinear audit_logs con BaseModel."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("audit_logs")}

    if "deleted_at" not in columns:
        op.add_column(
            "audit_logs",
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    """Elimina soft delete de audit_logs."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("audit_logs")}

    if "deleted_at" in columns:
        op.drop_column("audit_logs", "deleted_at")
