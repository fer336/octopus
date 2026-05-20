"""merge_srx_and_existing_heads

Revision ID: 1418c7624769
Revises: 859e6a405d22, add_audit_logs_deleted_at, c5d6e7f8a9b0
Create Date: 2026-05-20 04:06:02.707561

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1418c7624769'
down_revision: Union[str, Sequence[str], None] = ('859e6a405d22', 'add_audit_logs_deleted_at', 'c5d6e7f8a9b0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
