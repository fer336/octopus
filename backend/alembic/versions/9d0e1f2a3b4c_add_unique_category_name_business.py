"""add unique category name business

Revision ID: 9d0e1f2a3b4c
Revises: 7c8d9e0f1a2b
Create Date: 2026-07-21 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9d0e1f2a3b4c"
down_revision: str | Sequence[str] | None = "7c8d9e0f1a2b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # categories.deleted_at wasn't accounted for here originally, and
    # category_service._ensure_unique_name only checks active rows
    # (case-insensitive), so real duplicates can exist among active rows
    # from before that check existed. Merge them before the constraint can
    # be created, or this migration fails every deploy on existing data
    # (see 850874c4b04b, which later rebuilds this as a partial index).
    duplicate_groups = conn.execute(
        sa.text(
            """
            SELECT business_id, lower(name) AS lname, array_agg(id ORDER BY created_at) AS ids
            FROM categories
            WHERE deleted_at IS NULL
            GROUP BY business_id, lower(name)
            HAVING count(*) > 1
            """
        )
    ).mappings()

    for group in duplicate_groups:
        ids = list(group["ids"])
        keep_id = ids[0]
        for dup_id in ids[1:]:
            conn.execute(
                sa.text(
                    "UPDATE products SET category_id = :keep WHERE category_id = :dup"
                ),
                {"keep": keep_id, "dup": dup_id},
            )
            conn.execute(
                sa.text(
                    "UPDATE purchase_orders SET category_id = :keep WHERE category_id = :dup"
                ),
                {"keep": keep_id, "dup": dup_id},
            )
            conn.execute(
                sa.text(
                    "UPDATE supplier_category_discounts SET category_id = :keep WHERE category_id = :dup"
                ),
                {"keep": keep_id, "dup": dup_id},
            )
            conn.execute(
                sa.text(
                    "UPDATE categories SET parent_id = :keep WHERE parent_id = :dup"
                ),
                {"keep": keep_id, "dup": dup_id},
            )
            # supplier_categories has a composite PK (supplier_id, category_id):
            # drop rows that would collide with the keeper, then repoint the rest.
            conn.execute(
                sa.text(
                    """
                    DELETE FROM supplier_categories sc
                    USING supplier_categories sc2
                    WHERE sc.category_id = :dup
                      AND sc2.category_id = :keep
                      AND sc.supplier_id = sc2.supplier_id
                    """
                ),
                {"keep": keep_id, "dup": dup_id},
            )
            conn.execute(
                sa.text(
                    "UPDATE supplier_categories SET category_id = :keep WHERE category_id = :dup"
                ),
                {"keep": keep_id, "dup": dup_id},
            )
            # Hard delete, not soft delete: the constraint below is a plain
            # UNIQUE(name, business_id) with no WHERE clause, so a
            # soft-deleted row (deleted_at set) would still collide with it.
            # All references were repointed to the keeper above, so nothing
            # points at this row anymore.
            conn.execute(
                sa.text("DELETE FROM categories WHERE id = :dup"),
                {"dup": dup_id},
            )

    # Índice parcial, no constraint plano: el dedup de arriba solo fusiona
    # duplicados entre filas ACTIVAS (deleted_at IS NULL). Si además existe
    # una fila ya borrada lógicamente con el mismo (name, business_id), un
    # constraint plano choca igual contra ella aunque no haya ningún
    # duplicado activo real — visto en producción con "Griferias". El
    # índice parcial ignora las filas borradas por completo.
    op.create_index(
        "uq_category_name_business",
        "categories",
        ["name", "business_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_category_name_business", table_name="categories")
