"""merge wholesale heads before cost_price + expenses

Revision ID: merge_20260622_001
Revises: 0f1e2d3c4b5a, d5e6f7a8b9c0
Create Date: 2026-06-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "merge_20260622_001"
down_revision: Union[str, Sequence[str], None] = (
    "0f1e2d3c4b5a",
    "d5e6f7a8b9c0",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
