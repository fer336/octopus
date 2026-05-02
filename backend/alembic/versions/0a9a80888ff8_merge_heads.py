"""merge heads

Revision ID: 0a9a80888ff8
Revises: 74bbeb216fa7, 999999999999
Create Date: 2026-02-14 00:18:46.497157

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = '0a9a80888ff8'
down_revision: str | Sequence[str] | None = ('74bbeb216fa7', '999999999999')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
