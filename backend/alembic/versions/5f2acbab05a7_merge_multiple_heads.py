"""merge_multiple_heads

Revision ID: 5f2acbab05a7
Revises: 552b84041b07, b5f92d3c8e11
Create Date: 2026-02-06 23:49:03.051057

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f2acbab05a7'
down_revision: Union[str, Sequence[str], None] = ('552b84041b07', 'b5f92d3c8e11')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
