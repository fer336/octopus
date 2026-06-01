"""normalize product brands

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-06-01

"""
from __future__ import annotations

from datetime import datetime
import re
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize_brand_name(name: str) -> str:
    normalized = name.strip().casefold().replace("_", "")
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def upgrade() -> None:
    op.create_table(
        "brands",
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("normalized_name", sa.String(length=100), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_brands_business_id"), "brands", ["business_id"], unique=False)
    op.create_index(op.f("ix_brands_id"), "brands", ["id"], unique=False)
    op.create_index(op.f("ix_brands_name"), "brands", ["name"], unique=False)
    op.create_index(
        op.f("ix_brands_normalized_name"),
        "brands",
        ["normalized_name"],
        unique=False,
    )
    op.create_index(
        "uq_brands_business_normalized_active",
        "brands",
        ["business_id", "normalized_name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.add_column("products", sa.Column("brand_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_products_brand_id"), "products", ["brand_id"], unique=False)
    op.create_foreign_key(
        "fk_products_brand_id_brands",
        "products",
        "brands",
        ["brand_id"],
        ["id"],
    )

    connection = op.get_bind()
    products = connection.execute(
        sa.text(
            """
            SELECT id, business_id, brand
            FROM products
            WHERE deleted_at IS NULL
              AND brand IS NOT NULL
              AND btrim(brand) <> ''
            """
        )
    ).mappings()

    brands_by_key: dict[tuple[object, str], object] = {}
    now = datetime.utcnow()
    for product in products:
        brand_name = str(product["brand"]).strip()
        normalized_name = _normalize_brand_name(brand_name)
        if not normalized_name:
            continue
        key = (product["business_id"], normalized_name)
        brand_id = brands_by_key.get(key)
        if brand_id is None:
            brand_id = uuid4()
            brands_by_key[key] = brand_id
            connection.execute(
                sa.text(
                    """
                    INSERT INTO brands
                        (id, business_id, name, normalized_name, created_at, updated_at)
                    VALUES
                        (:id, :business_id, :name, :normalized_name, :created_at, :updated_at)
                    """
                ),
                {
                    "id": brand_id,
                    "business_id": product["business_id"],
                    "name": brand_name,
                    "normalized_name": normalized_name,
                    "created_at": now,
                    "updated_at": now,
                },
            )

        connection.execute(
            sa.text("UPDATE products SET brand_id = :brand_id WHERE id = :product_id"),
            {"brand_id": brand_id, "product_id": product["id"]},
        )


def downgrade() -> None:
    op.drop_constraint("fk_products_brand_id_brands", "products", type_="foreignkey")
    op.drop_index(op.f("ix_products_brand_id"), table_name="products")
    op.drop_column("products", "brand_id")
    op.drop_index("uq_brands_business_normalized_active", table_name="brands")
    op.drop_index(op.f("ix_brands_normalized_name"), table_name="brands")
    op.drop_index(op.f("ix_brands_name"), table_name="brands")
    op.drop_index(op.f("ix_brands_id"), table_name="brands")
    op.drop_index(op.f("ix_brands_business_id"), table_name="brands")
    op.drop_table("brands")
