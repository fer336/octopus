"""add_client_authorizations_and_modes

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-04-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "clients",
        sa.Column(
            "current_account_mode",
            sa.String(length=20),
            nullable=False,
            server_default="disabled",
        ),
    )
    op.alter_column("clients", "current_account_mode", server_default=None)

    op.create_table(
        "client_authorizations",
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("billing_client_id", sa.UUID(), nullable=False),
        sa.Column("operating_client_id", sa.UUID(), nullable=False),
        sa.Column(
            "operating_credit_limit", sa.Numeric(precision=12, scale=2), nullable=True
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["billing_client_id"], ["clients.id"]),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"]),
        sa.ForeignKeyConstraint(["operating_client_id"], ["clients.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id",
            "billing_client_id",
            "operating_client_id",
            name="uq_client_authorizations_triplet",
        ),
    )
    op.create_index(
        op.f("ix_client_authorizations_billing_client_id"),
        "client_authorizations",
        ["billing_client_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_client_authorizations_business_id"),
        "client_authorizations",
        ["business_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_client_authorizations_id"),
        "client_authorizations",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_client_authorizations_operating_client_id"),
        "client_authorizations",
        ["operating_client_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_client_authorizations_operating_client_id"),
        table_name="client_authorizations",
    )
    op.drop_index(
        op.f("ix_client_authorizations_id"), table_name="client_authorizations"
    )
    op.drop_index(
        op.f("ix_client_authorizations_business_id"), table_name="client_authorizations"
    )
    op.drop_index(
        op.f("ix_client_authorizations_billing_client_id"),
        table_name="client_authorizations",
    )
    op.drop_table("client_authorizations")

    op.drop_column("clients", "current_account_mode")
