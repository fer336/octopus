"""Extend price_lists with B2B fields and add price_list_send_logs

Revision ID: b2b1c3d4e5f6
Revises: a7bfac3c55fa
Create Date: 2026-06-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2b1c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "a7bfac3c55fa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- price_lists: add B2B columns ---
    op.add_column("price_lists", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "price_lists",
        sa.Column("currency", sa.String(10), nullable=False, server_default="ARS"),
    )
    op.add_column(
        "price_lists",
        sa.Column("includes_tax", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column("price_lists", sa.Column("valid_from", sa.Date(), nullable=True))
    op.add_column("price_lists", sa.Column("valid_until", sa.Date(), nullable=True))
    op.add_column(
        "price_lists",
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
    )
    op.add_column(
        "price_lists", sa.Column("terms_and_conditions", sa.Text(), nullable=True)
    )
    op.add_column(
        "price_lists",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "price_lists", sa.Column("previous_version_id", sa.UUID(), nullable=True)
    )
    op.add_column(
        "price_lists", sa.Column("created_by_user_id", sa.UUID(), nullable=True)
    )
    op.add_column("price_lists", sa.Column("client_type_id", sa.UUID(), nullable=True))
    op.add_column("price_lists", sa.Column("client_id", sa.UUID(), nullable=True))

    op.create_foreign_key(
        "fk_price_lists_previous_version",
        "price_lists",
        "price_lists",
        ["previous_version_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_price_lists_created_by_user",
        "price_lists",
        "users",
        ["created_by_user_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_price_lists_client_type",
        "price_lists",
        "client_types",
        ["client_type_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_price_lists_client",
        "price_lists",
        "clients",
        ["client_id"],
        ["id"],
    )
    op.create_index(
        "ix_price_lists_business_status", "price_lists", ["business_id", "status"]
    )
    op.create_index(
        "ix_price_lists_client_type_id", "price_lists", ["client_type_id"]
    )
    op.create_index("ix_price_lists_client_id", "price_lists", ["client_id"])
    op.create_check_constraint(
        "ck_price_list_target_exclusive",
        "price_lists",
        "client_type_id IS NULL OR client_id IS NULL",
    )

    # --- price_list_items: add B2B columns ---
    op.add_column(
        "price_list_items", sa.Column("product_id", sa.UUID(), nullable=True)
    )
    op.add_column(
        "price_list_items",
        sa.Column("supplier_code", sa.String(50), nullable=True),
    )
    op.add_column(
        "price_list_items", sa.Column("brand_name", sa.String(100), nullable=True)
    )
    op.add_column(
        "price_list_items",
        sa.Column("category_name", sa.String(120), nullable=True),
    )
    op.add_column(
        "price_list_items", sa.Column("unit", sa.String(20), nullable=True)
    )
    op.add_column(
        "price_list_items",
        sa.Column("quantity_per_package", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "price_list_items", sa.Column("iva_rate", sa.Numeric(5, 2), nullable=True)
    )
    op.add_column(
        "price_list_items", sa.Column("base_price", sa.Numeric(12, 2), nullable=True)
    )
    op.add_column(
        "price_list_items",
        sa.Column(
            "discount_percent", sa.Numeric(7, 2), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "price_list_items",
        sa.Column(
            "surcharge_percent", sa.Numeric(7, 2), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "price_list_items", sa.Column("net_price", sa.Numeric(12, 2), nullable=True)
    )
    op.add_column(
        "price_list_items", sa.Column("tax_percent", sa.Numeric(5, 2), nullable=True)
    )
    op.add_column(
        "price_list_items",
        sa.Column("final_price", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "price_list_items",
        sa.Column("min_quantity", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "price_list_items",
        sa.Column("pack_quantity", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "price_list_items", sa.Column("item_notes", sa.Text(), nullable=True)
    )

    op.create_foreign_key(
        "fk_price_list_items_product",
        "price_list_items",
        "products",
        ["product_id"],
        ["id"],
    )
    op.create_index(
        "ix_price_list_items_product_id", "price_list_items", ["product_id"]
    )

    # --- price_list_send_logs: create table ---
    op.create_table(
        "price_list_send_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("price_list_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.UUID(), nullable=True),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.Column("sent_by_user_id", sa.UUID(), nullable=True),
        sa.Column("file_url", sa.String(500), nullable=True),
        sa.Column(
            "log_status", sa.String(30), nullable=False, server_default="recorded"
        ),
        sa.Column("message_preview", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["price_list_id"],
            ["price_lists.id"],
            name="fk_send_logs_price_list",
        ),
        sa.ForeignKeyConstraint(
            ["client_id"], ["clients.id"], name="fk_send_logs_client"
        ),
        sa.ForeignKeyConstraint(
            ["sent_by_user_id"], ["users.id"], name="fk_send_logs_user"
        ),
        sa.PrimaryKeyConstraint("id", name="price_list_send_logs_pkey"),
    )
    op.create_index(
        "ix_send_logs_price_list_id", "price_list_send_logs", ["price_list_id"]
    )
    op.create_index(
        "ix_send_logs_client_id", "price_list_send_logs", ["client_id"]
    )


def downgrade() -> None:
    # Drop send_logs table
    op.drop_index("ix_send_logs_client_id", table_name="price_list_send_logs")
    op.drop_index("ix_send_logs_price_list_id", table_name="price_list_send_logs")
    op.drop_table("price_list_send_logs")

    # Drop price_list_items additions
    op.drop_index("ix_price_list_items_product_id", table_name="price_list_items")
    op.drop_constraint(
        "fk_price_list_items_product", "price_list_items", type_="foreignkey"
    )
    for col in [
        "item_notes",
        "pack_quantity",
        "min_quantity",
        "final_price",
        "tax_percent",
        "net_price",
        "surcharge_percent",
        "discount_percent",
        "base_price",
        "iva_rate",
        "quantity_per_package",
        "unit",
        "category_name",
        "brand_name",
        "supplier_code",
        "product_id",
    ]:
        op.drop_column("price_list_items", col)

    # Drop price_lists additions
    op.drop_constraint(
        "ck_price_list_target_exclusive", "price_lists", type_="check"
    )
    op.drop_index("ix_price_lists_client_id", table_name="price_lists")
    op.drop_index("ix_price_lists_client_type_id", table_name="price_lists")
    op.drop_index("ix_price_lists_business_status", table_name="price_lists")
    op.drop_constraint("fk_price_lists_client", "price_lists", type_="foreignkey")
    op.drop_constraint(
        "fk_price_lists_client_type", "price_lists", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_price_lists_created_by_user", "price_lists", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_price_lists_previous_version", "price_lists", type_="foreignkey"
    )
    for col in [
        "client_id",
        "client_type_id",
        "created_by_user_id",
        "previous_version_id",
        "version",
        "terms_and_conditions",
        "status",
        "valid_until",
        "valid_from",
        "includes_tax",
        "currency",
        "description",
    ]:
        op.drop_column("price_lists", col)
