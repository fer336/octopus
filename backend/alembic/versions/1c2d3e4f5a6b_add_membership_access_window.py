"""add_membership_access_window

Revision ID: 1c2d3e4f5a6b
Revises: b5f92d3c8e11, 552b84041b07, c7a3e1f90d22
Create Date: 2026-04-01 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1c2d3e4f5a6b"
down_revision: Union[str, Sequence[str], None] = (
    "b5f92d3c8e11",
    "552b84041b07",
    "c7a3e1f90d22",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "tenant_memberships",
        sa.Column("access_starts_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "tenant_memberships",
        sa.Column("access_ends_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "tenant_memberships",
        sa.Column(
            "access_status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
    )
    op.add_column(
        "tenant_memberships",
        sa.Column("blocked_reason", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("tenant_memberships", "blocked_reason")
    op.drop_column("tenant_memberships", "access_status")
    op.drop_column("tenant_memberships", "access_ends_at")
    op.drop_column("tenant_memberships", "access_starts_at")
