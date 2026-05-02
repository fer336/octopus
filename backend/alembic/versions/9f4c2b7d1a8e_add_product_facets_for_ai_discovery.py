"""add_product_facets_for_ai_discovery

Revision ID: 9f4c2b7d1a8e
Revises: 07c058b85650
Create Date: 2026-03-13 09:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9f4c2b7d1a8e"
down_revision: str | Sequence[str] | None = "07c058b85650"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("products", sa.Column("brand", sa.String(length=100), nullable=True))
    op.add_column("products", sa.Column("line", sa.String(length=100), nullable=True))
    op.add_column(
        "products", sa.Column("application_area", sa.String(length=100), nullable=True)
    )
    op.add_column("products", sa.Column("finish", sa.String(length=80), nullable=True))
    op.add_column(
        "products", sa.Column("quality_tier", sa.String(length=40), nullable=True)
    )
    op.add_column("products", sa.Column("attributes_json", sa.Text(), nullable=True))

    op.create_index("ix_products_brand", "products", ["brand"], unique=False)
    op.create_index("ix_products_line", "products", ["line"], unique=False)
    op.create_index(
        "ix_products_application_area", "products", ["application_area"], unique=False
    )
    op.create_index("ix_products_finish", "products", ["finish"], unique=False)
    op.create_index(
        "ix_products_quality_tier", "products", ["quality_tier"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_products_quality_tier", table_name="products")
    op.drop_index("ix_products_finish", table_name="products")
    op.drop_index("ix_products_application_area", table_name="products")
    op.drop_index("ix_products_line", table_name="products")
    op.drop_index("ix_products_brand", table_name="products")

    op.drop_column("products", "attributes_json")
    op.drop_column("products", "quality_tier")
    op.drop_column("products", "finish")
    op.drop_column("products", "application_area")
    op.drop_column("products", "line")
    op.drop_column("products", "brand")
