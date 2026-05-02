"""Add business subscription fields

Revision ID: y3x4w5v6u7t8
Revises: z2y3x4w5v6u7
Create Date: 2026-04-28 00:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "y3x4w5v6u7t8"
down_revision: str | None = "z2y3x4w5v6u7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("subscription_starts_at", sa.DateTime(), nullable=True))
    op.add_column("businesses", sa.Column("subscription_ends_at", sa.DateTime(), nullable=True))
    op.add_column(
        "businesses",
        sa.Column("subscription_status", sa.String(length=20), nullable=False, server_default="active"),
    )
    op.add_column(
        "businesses",
        sa.Column("subscription_blocked_reason", sa.String(length=255), nullable=True),
    )
    op.alter_column("businesses", "subscription_status", server_default=None)


def downgrade() -> None:
    op.drop_column("businesses", "subscription_blocked_reason")
    op.drop_column("businesses", "subscription_status")
    op.drop_column("businesses", "subscription_ends_at")
    op.drop_column("businesses", "subscription_starts_at")
