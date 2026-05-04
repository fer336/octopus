"""merge_payment_receipts_and_quotation_flags

Revision ID: 810d76cf0d3f
Revises: d2e3f4a5b6c7, f0e1d2c3b4a5
Create Date: 2026-05-04 03:59:03.034960

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '810d76cf0d3f'
down_revision: Union[str, Sequence[str], None] = ('d2e3f4a5b6c7', 'f0e1d2c3b4a5')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
