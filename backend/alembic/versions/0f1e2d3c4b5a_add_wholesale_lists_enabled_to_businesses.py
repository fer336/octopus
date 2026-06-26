"""Add wholesale_lists_enabled to businesses

Revision ID: 0f1e2d3c4b5a
Revises: b2b1c3d4e5f6
Create Date: 2026-06-22 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0f1e2d3c4b5a"
down_revision: Union[str, None] = "b2b1c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column(
            "wholesale_lists_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("businesses", "wholesale_lists_enabled")
