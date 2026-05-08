"""add deleted_at to audit_logs

Revision ID: add_audit_logs_deleted_at
Revises: add_tenant_memberships_deleted_at
Create Date: 2026-05-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "add_audit_logs_deleted_at"
down_revision: str | Sequence[str] | None = "add_tenant_memberships_deleted_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Agrega soft delete faltante para alinear audit_logs con BaseModel."""
    op.add_column(
        "audit_logs",
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Elimina soft delete de audit_logs."""
    op.drop_column("audit_logs", "deleted_at")
