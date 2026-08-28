"""merge category and meli sim heads

Revision ID: 0060c898b849
Revises: 9d0e1f2a3b4c, meli_sim_001
Create Date: 2026-07-29 22:41:38.645732

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0060c898b849'
down_revision: Union[str, Sequence[str], None] = ('9d0e1f2a3b4c', 'meli_sim_001')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
