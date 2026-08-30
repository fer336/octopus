"""fix category unique constraint to exclude soft-deleted rows

Revision ID: 850874c4b04b
Revises: b7eb304b1beb
Create Date: 2026-08-28 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "850874c4b04b"
down_revision: str | Sequence[str] | None = "b7eb304b1beb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # 9d0e1f2a3b4c ahora crea directamente el índice parcial (nunca llegó a
    # correr en producción con el constraint plano viejo), pero esta
    # migración se deja idempotente por si alguna base quedó en el estado
    # intermedio: dropea el constraint plano si existe, y solo crea el
    # índice si todavía no está.
    conn.execute(
        sa.text(
            "ALTER TABLE categories DROP CONSTRAINT IF EXISTS uq_category_name_business"
        )
    )

    index_exists = conn.execute(
        sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname = 'uq_category_name_business'"
        )
    ).scalar()

    if not index_exists:
        op.create_index(
            "uq_category_name_business",
            "categories",
            ["name", "business_id"],
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        )


def downgrade() -> None:
    op.drop_index("uq_category_name_business", table_name="categories")
    op.create_unique_constraint(
        "uq_category_name_business",
        "categories",
        ["name", "business_id"],
    )
