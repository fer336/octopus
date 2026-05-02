"""Add deleted_at to tenant_secrets

Revision ID: add_tenant_secrets_deleted_at
Revises: sql_backup_001
Create Date: 2026-04-17 12:35:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_tenant_secrets_deleted_at"
down_revision: str | None = "sql_backup_001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenant_secrets",
        sa.Column("deleted_at", sa.DateTime(), nullable=True, server_default=None),
    )


def downgrade() -> None:
    op.drop_column("tenant_secrets", "deleted_at")
