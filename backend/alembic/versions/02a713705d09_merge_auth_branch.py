"""merge_auth_branch

Revision ID: 02a713705d09
Revises: 9b7c6d5e4f3a, z1y2x3w4v5u6_auth_req
Create Date: 2026-05-04 11:36:51.309563

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '02a713705d09'
down_revision: Union[str, Sequence[str], None] = ('9b7c6d5e4f3a', 'z1y2x3w4v5u6_auth_req')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
