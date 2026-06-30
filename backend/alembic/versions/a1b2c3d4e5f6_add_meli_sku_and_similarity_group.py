"""add_meli_sku_and_similarity_group_to_products

Revision ID: meli_sim_001
Revises: merge_profit_heads
Create Date: 2026-06-28 00:00:00.000000

Agrega meli_sku (SKU de MercadoLibre) y similarity_group_code (código compartido
entre productos equivalentes para recomendación por bajo stock).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "meli_sim_001"
down_revision: Union[str, Sequence[str], None] = "merge_profit_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("meli_sku", sa.String(100), nullable=True))
    op.add_column("products", sa.Column("similarity_group_code", sa.String(50), nullable=True))
    op.create_index("ix_products_meli_sku", "products", ["meli_sku"])
    op.create_index("ix_products_similarity_group_code", "products", ["similarity_group_code"])


def downgrade() -> None:
    op.drop_index("ix_products_similarity_group_code", table_name="products")
    op.drop_index("ix_products_meli_sku", table_name="products")
    op.drop_column("products", "similarity_group_code")
    op.drop_column("products", "meli_sku")
