"""add unique category name business

Revision ID: 9d0e1f2a3b4c
Revises: 7c8d9e0f1a2b
Create Date: 2026-07-21 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9d0e1f2a3b4c"
down_revision: str | Sequence[str] | None = "7c8d9e0f1a2b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_category_name_business",
        "categories",
        ["name", "business_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_category_name_business",
        "categories",
        type_="unique",
    )
