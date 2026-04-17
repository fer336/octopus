"""add_cms_feature_flags_for_modules

Revision ID: e6f7a8b9c0d1
Revises: b4c5d6e7f8a9
Create Date: 2026-04-16 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "businesses",
        sa.Column(
            "invoicing_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "receipts_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "price_update_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "businesses",
        sa.Column(
            "reports_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    op.alter_column("businesses", "invoicing_enabled", server_default=None)
    op.alter_column("businesses", "receipts_enabled", server_default=None)
    op.alter_column("businesses", "price_update_enabled", server_default=None)
    op.alter_column("businesses", "reports_enabled", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("businesses", "reports_enabled")
    op.drop_column("businesses", "price_update_enabled")
    op.drop_column("businesses", "receipts_enabled")
    op.drop_column("businesses", "invoicing_enabled")
