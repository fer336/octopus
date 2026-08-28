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

    # A previous run of 9d0e1f2a3b4c may have succeeded here (clean data).
    # Drop it unconditionally before rebuilding it as a partial index.
    conn.execute(
        sa.text(
            "ALTER TABLE categories DROP CONSTRAINT IF EXISTS uq_category_name_business"
        )
    )

    # categories.deleted_at wasn't accounted for by the original migration, so
    # an active category and a soft-deleted one with the same (name, business_id)
    # collide. category_service._ensure_unique_name only checks active rows
    # (case-insensitive), so merge any real active duplicates before rebuilding
    # the constraint as a partial index scoped to deleted_at IS NULL.
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
            conn.execute(
                sa.text(
                    "UPDATE categories SET deleted_at = now() WHERE id = :dup"
                ),
                {"dup": dup_id},
            )

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
