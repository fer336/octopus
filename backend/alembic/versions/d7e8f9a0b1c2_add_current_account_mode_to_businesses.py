"""add_current_account_mode_to_businesses

Revision ID: d7e8f9a0b1c2
Revises: c4d5e6f7a8b9
Create Date: 2026-04-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e8f9a0b1c2"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "businesses",
        sa.Column(
            "current_account_mode",
            sa.String(length=20),
            nullable=False,
            server_default="disabled",
        ),
    )
    op.alter_column("businesses", "current_account_mode", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("businesses", "current_account_mode")
