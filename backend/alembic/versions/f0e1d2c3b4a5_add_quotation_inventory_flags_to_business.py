"""add quotation/inventory feature flags to businesses

Revision ID: f0e1d2c3b4a5
Revises: dbe83ffbb892
Create Date: 2026-05-01 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f0e1d2c3b4a5"
down_revision: Union[str, Sequence[str], None] = "dbe83ffbb892"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("quotation_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "businesses",
        sa.Column("inventory_enabled", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("businesses", "inventory_enabled")
    op.drop_column("businesses", "quotation_enabled")
