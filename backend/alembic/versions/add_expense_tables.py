"""create expense_categories and expenses tables

Revision ID: add_expense_tables_001
Revises: add_cost_price_001
Create Date: 2026-06-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "add_expense_tables_001"
down_revision: Union[str, Sequence[str], None] = "add_cost_price_001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = inspector.get_table_names()

    # --- expense_categories ---
    if "expense_categories" not in tables:
        op.create_table(
            "expense_categories",
            sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
            sa.Column(
                "created_at",
                postgresql.TIMESTAMP(timezone=True),
                server_default=sa.text("now()"),
                autoincrement=False,
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                postgresql.TIMESTAMP(timezone=True),
                server_default=sa.text("now()"),
                autoincrement=False,
                nullable=False,
            ),
            sa.Column(
                "deleted_at",
                postgresql.TIMESTAMP(timezone=True),
                autoincrement=False,
                nullable=True,
            ),
            sa.Column(
                "name", sa.VARCHAR(length=100), autoincrement=False, nullable=False
            ),
            sa.Column(
                "description", sa.TEXT(), autoincrement=False, nullable=True
            ),
            sa.Column(
                "is_active",
                sa.Boolean(),
                server_default=sa.text("true"),
                autoincrement=False,
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id", name="expense_categories_pkey"),
            sa.UniqueConstraint("name", name="uq_expense_categories_name"),
        )

    # --- expenses ---
    if "expenses" not in tables:
        op.create_table(
            "expenses",
            sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
            sa.Column(
                "created_at",
                postgresql.TIMESTAMP(timezone=True),
                server_default=sa.text("now()"),
                autoincrement=False,
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                postgresql.TIMESTAMP(timezone=True),
                server_default=sa.text("now()"),
                autoincrement=False,
                nullable=False,
            ),
            sa.Column(
                "deleted_at",
                postgresql.TIMESTAMP(timezone=True),
                autoincrement=False,
                nullable=True,
            ),
            sa.Column(
                "category_id", sa.UUID(), autoincrement=False, nullable=False
            ),
            sa.Column(
                "description",
                sa.VARCHAR(length=255),
                autoincrement=False,
                nullable=False,
            ),
            sa.Column(
                "amount",
                sa.NUMERIC(precision=12, scale=2),
                autoincrement=False,
                nullable=False,
            ),
            sa.Column(
                "date", sa.DATE(), autoincrement=False, nullable=False
            ),
            sa.Column(
                "payment_method",
                sa.VARCHAR(length=50),
                autoincrement=False,
                nullable=False,
            ),
            sa.Column(
                "notes", sa.TEXT(), autoincrement=False, nullable=True
            ),
            sa.Column(
                "created_by", sa.UUID(), autoincrement=False, nullable=False
            ),
            sa.ForeignKeyConstraint(
                ["category_id"],
                ["expense_categories.id"],
                name="expenses_category_id_fkey",
            ),
            sa.ForeignKeyConstraint(
                ["created_by"],
                ["users.id"],
                name="expenses_created_by_fkey",
            ),
            sa.PrimaryKeyConstraint("id", name="expenses_pkey"),
        )
        op.create_index(
            "ix_expenses_category_id",
            "expenses",
            ["category_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index("ix_expenses_category_id", table_name="expenses")
    op.drop_table("expenses")
    op.drop_table("expense_categories")
