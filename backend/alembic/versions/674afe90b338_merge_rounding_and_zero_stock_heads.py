"""merge rounding and zero_stock heads

Revision ID: 674afe90b338
Revises: 1bceaa03f3eb, 8e5d7c540e06
Create Date: 2026-06-10 17:12:26.959722

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '674afe90b338'
down_revision: Union[str, Sequence[str], None] = ('1bceaa03f3eb', '8e5d7c540e06')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
