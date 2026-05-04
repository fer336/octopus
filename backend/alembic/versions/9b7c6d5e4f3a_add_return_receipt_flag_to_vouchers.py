"""add_return_receipt_flag_to_vouchers

Revision ID: 9b7c6d5e4f3a
Revises: 810d76cf0d3f
Create Date: 2026-05-04 09:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9b7c6d5e4f3a"
down_revision: str | Sequence[str] | None = "810d76cf0d3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "vouchers",
        sa.Column("is_return_receipt", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("vouchers", "is_return_receipt", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("vouchers", "is_return_receipt")
