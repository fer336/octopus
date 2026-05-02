"""add created_by_user relation to vouchers

Revision ID: dbe83ffbb892
Revises: w4x5y6z7a8b9
Create Date: 2026-04-28 06:24:43.239014

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'dbe83ffbb892'
down_revision: str | Sequence[str] | None = 'w4x5y6z7a8b9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
