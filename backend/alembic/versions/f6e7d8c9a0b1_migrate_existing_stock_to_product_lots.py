"""migrate_existing_stock_to_product_lots

Revision ID: f6e7d8c9a0b1
Revises: e1d2c3b4a5f6
Create Date: 2026-05-14 08:00:00.000000

Crea un ProductLot por cada producto con current_stock > 0 usando SQL puro.
NO dropea las columnas current_stock / expiration_date (eso va en PR 3).
"""

from typing import Sequence, Union
from uuid import uuid4

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "f6e7d8c9a0b1"
down_revision: Union[str, Sequence[str], None] = "e1d2c3b4a5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Para cada producto con current_stock > 0, crea un ProductLot."""
    conn = op.get_bind()

    # Seleccionar productos con stock positivo (no eliminados)
    products = conn.execute(
        text("""
            SELECT id, business_id, current_stock, expiration_date, created_at
            FROM products
            WHERE current_stock > 0 AND deleted_at IS NULL
        """)
    ).fetchall()

    for product in products:
        product_id = product[0]
        business_id = product[1]
        stock = product[2]
        exp_date = product[3]
        created_at = product[4]

        lot_id = str(uuid4())
        code = f"LEGACY-{str(product_id)[:8]}"

        received_date = created_at.date() if hasattr(created_at, "date") else created_at

        conn.execute(
            text("""
                INSERT INTO product_lots
                    (id, created_at, updated_at, deleted_at,
                     product_id, business_id, code, quantity, initial_quantity,
                     expiration_date, received_date)
                VALUES
                    (:id, NOW(), NOW(), NULL,
                     :product_id, :business_id, :code, :quantity, :quantity,
                     :expiration_date, :received_date)
            """),
            {
                "id": lot_id,
                "product_id": str(product_id),
                "business_id": str(business_id),
                "code": code,
                "quantity": stock,
                "expiration_date": exp_date,
                "received_date": received_date,
            },
        )


def downgrade() -> None:
    """Elimina los lotes legacy creados por esta migración."""
    conn = op.get_bind()
    conn.execute(
        text("DELETE FROM product_lots WHERE code LIKE 'LEGACY-%'")
    )
