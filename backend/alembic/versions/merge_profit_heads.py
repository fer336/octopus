"""merge profitability and expense heads

Revision ID: merge_profit_heads
Revises: a7b8c9d0e1f2, 1a2b3c4d5e6f
Create Date: 2026-06-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "merge_profit_heads"
down_revision: Union[str, Sequence[str], None] = (
    "a7b8c9d0e1f2",
    "1a2b3c4d5e6f",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
