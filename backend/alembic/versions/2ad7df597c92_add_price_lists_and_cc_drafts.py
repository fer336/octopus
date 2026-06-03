"""add_price_lists_and_cc_drafts

Revision ID: a1b2c3d4e5f6
Revises: d1e2f3a4b5c6
Create Date: 2026-06-01 00:00:00.000000

Creates price_lists, price_list_items and cc_drafts tables.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "2ad7df597c92"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create price_lists, price_list_items and cc_drafts tables."""

    # price_lists
    op.create_table(
        "price_lists",
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
        sa.Column("business_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("name", sa.VARCHAR(length=255), autoincrement=False, nullable=False),
        sa.Column("snapshot_date", sa.DATE(), autoincrement=False, nullable=False),
        sa.Column("notes", sa.TEXT(), autoincrement=False, nullable=True),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name="price_lists_business_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="price_lists_pkey"),
    )
    op.create_index("ix_price_lists_business_id", "price_lists", ["business_id"], unique=False)

    # price_list_items
    op.create_table(
        "price_list_items",
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
        sa.Column("price_list_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("product_code", sa.VARCHAR(length=50), autoincrement=False, nullable=False),
        sa.Column(
            "unit_price",
            sa.NUMERIC(precision=15, scale=4),
            autoincrement=False,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["price_list_id"],
            ["price_lists.id"],
            name="price_list_items_price_list_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="price_list_items_pkey"),
        sa.UniqueConstraint(
            "price_list_id",
            "product_code",
            name="uq_price_list_items_list_code",
        ),
    )
    op.create_index(
        "ix_price_list_items_price_list_id",
        "price_list_items",
        ["price_list_id"],
        unique=False,
    )
    op.create_index(
        "ix_price_list_items_product_code",
        "price_list_items",
        ["product_code"],
        unique=False,
    )

    # cc_drafts
    op.create_table(
        "cc_drafts",
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
        sa.Column("business_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("titular_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("closure_notes", sa.TEXT(), autoincrement=False, nullable=True),
        sa.Column("special_list_items", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("selected_receipt_ids", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("item_overrides", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("applied_price_lists", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            name="cc_drafts_business_id_fkey",
        ),
        sa.ForeignKeyConstraint(
            ["titular_id"],
            ["clients.id"],
            name="cc_drafts_titular_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="cc_drafts_pkey"),
        sa.UniqueConstraint(
            "business_id",
            "titular_id",
            name="uq_cc_drafts_business_titular",
        ),
    )
    op.create_index("ix_cc_drafts_business_id", "cc_drafts", ["business_id"], unique=False)
    op.create_index("ix_cc_drafts_titular_id", "cc_drafts", ["titular_id"], unique=False)


def downgrade() -> None:
    """Drop price_lists, price_list_items and cc_drafts tables."""
    op.drop_index("ix_cc_drafts_titular_id", table_name="cc_drafts")
    op.drop_index("ix_cc_drafts_business_id", table_name="cc_drafts")
    op.drop_table("cc_drafts")

    op.drop_index("ix_price_list_items_product_code", table_name="price_list_items")
    op.drop_index("ix_price_list_items_price_list_id", table_name="price_list_items")
    op.drop_table("price_list_items")

    op.drop_index("ix_price_lists_business_id", table_name="price_lists")
    op.drop_table("price_lists")
