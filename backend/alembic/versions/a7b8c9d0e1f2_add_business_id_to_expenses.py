"""add business_id to expense_categories and expenses

Revision ID: a7b8c9d0e1f2
Revises: add_expense_tables_001
Create Date: 2026-06-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "add_expense_tables_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # --- expense_categories ---
    columns = {
        col["name"] for col in inspector.get_columns("expense_categories")
    }
    if "business_id" not in columns:
        op.add_column(
            "expense_categories",
            sa.Column("business_id", sa.UUID(), nullable=False),
        )
        op.create_index(
            "ix_expense_categories_business_id",
            "expense_categories",
            ["business_id"],
            unique=False,
        )
        op.create_foreign_key(
            "fk_expense_category_business",
            "expense_categories",
            "businesses",
            ["business_id"],
            ["id"],
        )

    # --- expenses ---
    columns = {col["name"] for col in inspector.get_columns("expenses")}
    if "business_id" not in columns:
        op.add_column(
            "expenses",
            sa.Column("business_id", sa.UUID(), nullable=False),
        )
        op.create_index(
            "ix_expenses_business_id",
            "expenses",
            ["business_id"],
            unique=False,
        )
        op.create_foreign_key(
            "fk_expense_business",
            "expenses",
            "businesses",
            ["business_id"],
            ["id"],
        )


def downgrade() -> None:
    op.drop_constraint("fk_expense_business", "expenses", type_="foreignkey")
    op.drop_index("ix_expenses_business_id", table_name="expenses")
    op.drop_column("expenses", "business_id")

    op.drop_constraint(
        "fk_expense_category_business", "expense_categories", type_="foreignkey"
    )
    op.drop_index(
        "ix_expense_categories_business_id", table_name="expense_categories"
    )
    op.drop_column("expense_categories", "business_id")
