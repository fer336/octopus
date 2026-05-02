"""add_ai_agent_feature_flag_to_business

Revision ID: e9a1b2c3d4f5
Revises: c3e4f5a6d7b8, 2a7b9c4d8e11
Create Date: 2026-04-12 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e9a1b2c3d4f5"
down_revision: str | Sequence[str] | None = ("c3e4f5a6d7b8", "2a7b9c4d8e11")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "businesses",
        sa.Column(
            "ai_agent_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("businesses", "ai_agent_enabled")
