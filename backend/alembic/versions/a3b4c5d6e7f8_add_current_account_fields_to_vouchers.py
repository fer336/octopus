"""add_current_account_fields_to_vouchers

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-04-15 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "vouchers",
        sa.Column(
            "is_current_account",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("vouchers", "is_current_account", server_default=None)

    op.add_column("vouchers", sa.Column("billing_client_id", sa.UUID(), nullable=True))
    op.add_column(
        "vouchers", sa.Column("operating_client_id", sa.UUID(), nullable=True)
    )

    op.create_index(
        op.f("ix_vouchers_billing_client_id"),
        "vouchers",
        ["billing_client_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_vouchers_operating_client_id"),
        "vouchers",
        ["operating_client_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_vouchers_billing_client_id",
        "vouchers",
        "clients",
        ["billing_client_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_vouchers_operating_client_id",
        "vouchers",
        "clients",
        ["operating_client_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "fk_vouchers_operating_client_id", "vouchers", type_="foreignkey"
    )
    op.drop_constraint("fk_vouchers_billing_client_id", "vouchers", type_="foreignkey")
    op.drop_index(op.f("ix_vouchers_operating_client_id"), table_name="vouchers")
    op.drop_index(op.f("ix_vouchers_billing_client_id"), table_name="vouchers")
    op.drop_column("vouchers", "operating_client_id")
    op.drop_column("vouchers", "billing_client_id")
    op.drop_column("vouchers", "is_current_account")
