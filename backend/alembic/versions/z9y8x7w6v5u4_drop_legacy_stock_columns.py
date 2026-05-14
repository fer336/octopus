"""drop_legacy_stock_and_expiration_columns

Revision ID: z9y8x7w6v5u4
Revises: f6e7d8c9a0b1
Create Date: 2026-05-14 12:00:00.000000

Dropea las columnas current_stock y expiration_date de la tabla products.
Estos datos ahora se gestionan exclusivamente a través de la tabla product_lots.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "z9y8x7w6v5u4"
down_revision: Union[str, Sequence[str], None] = "f6e7d8c9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Elimina las columnas legacy de products."""
    op.drop_column("products", "current_stock")
    op.drop_column("products", "expiration_date")


def downgrade() -> None:
    """Restaura las columnas legacy y popula desde los lotes existentes."""
    op.add_column(
        "products",
        text("current_stock integer NOT NULL DEFAULT 0"),
    )
    op.add_column(
        "products",
        text("expiration_date date"),
    )

    # Popular current_stock desde la suma de lotes activos
    conn = op.get_bind()
    conn.execute(
        text("""
            UPDATE products SET current_stock = (
                SELECT COALESCE(SUM(pl.quantity), 0)
                FROM product_lots pl
                WHERE pl.product_id = products.id
                  AND pl.deleted_at IS NULL
            )
        """)
    )

    # Popular expiration_date desde el lote con vencimiento más próximo
    conn.execute(
        text("""
            UPDATE products SET expiration_date = (
                SELECT pl.expiration_date
                FROM product_lots pl
                WHERE pl.product_id = products.id
                  AND pl.deleted_at IS NULL
                  AND pl.quantity > 0
                  AND pl.expiration_date IS NOT NULL
                ORDER BY pl.expiration_date ASC
                LIMIT 1
            )
        """)
    )
