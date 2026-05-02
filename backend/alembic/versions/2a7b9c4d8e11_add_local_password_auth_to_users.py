"""add_local_password_auth_to_users

Revision ID: 2a7b9c4d8e11
Revises: 1c2d3e4f5a6b
Create Date: 2026-04-12

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a7b9c4d8e11"
down_revision: str | Sequence[str] | None = "1c2d3e4f5a6b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users", sa.Column("password_hash", sa.String(length=512), nullable=True)
    )
    op.alter_column(
        "users", "google_id", existing_type=sa.String(length=255), nullable=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        """
        UPDATE users
        SET google_id = CONCAT('legacy_', id::text)
        WHERE google_id IS NULL
        """
    )
    op.alter_column(
        "users", "google_id", existing_type=sa.String(length=255), nullable=False
    )
    op.drop_column("users", "password_hash")
