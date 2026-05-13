"""Add pg_trgm extension and GIN trigram indexes for search optimization.

Revision ID: search_optimization_trigram_indexes
Revises: b_logo_layout_20260509
Create Date: 2026-05-13

"""
from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "search_optimization_trigram_indexes"
down_revision: str | Sequence[str] | None = "b_logo_layout_20260509"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


PRODUCT_TRGM_INDEXES = [
    ("ix_products_code_trgm", "products", "code"),
    ("ix_products_supplier_code_trgm", "products", "supplier_code"),
    ("ix_products_description_trgm", "products", "description"),
    ("ix_products_brand_trgm", "products", "brand"),
    ("ix_products_line_trgm", "products", "line"),
    ("ix_products_application_area_trgm", "products", "application_area"),
    ("ix_products_finish_trgm", "products", "finish"),
    ("ix_products_customer_terms_trgm", "products", "customer_terms"),
]

CLIENT_TRGM_INDEXES = [
    ("ix_clients_name_trgm", "clients", "name"),
    ("ix_clients_document_number_trgm", "clients", "document_number"),
]

SUPPLIER_TRGM_INDEXES = [
    ("ix_suppliers_name_trgm", "suppliers", "name"),
    ("ix_suppliers_cuit_trgm", "suppliers", "cuit"),
]


def upgrade() -> None:
    """Upgrade schema."""
    # Enable pg_trgm extension (safe to run inside transaction)
    op.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    # Commit Alembic's implicit transaction so CONCURRENTLY can run
    op.execute("COMMIT")

    # Create all trigram indexes with CONCURRENTLY, one by one,
    # each must run outside a transaction
    for idx_name, table, column in PRODUCT_TRGM_INDEXES:
        op.execute(
            text(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {idx_name} "
                f"ON {table} USING gin ({column} gin_trgm_ops)"
            )
        )

    for idx_name, table, column in CLIENT_TRGM_INDEXES:
        op.execute(
            text(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {idx_name} "
                f"ON {table} USING gin ({column} gin_trgm_ops)"
            )
        )

    for idx_name, table, column in SUPPLIER_TRGM_INDEXES:
        op.execute(
            text(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {idx_name} "
                f"ON {table} USING gin ({column} gin_trgm_ops)"
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    all_indexes = PRODUCT_TRGM_INDEXES + CLIENT_TRGM_INDEXES + SUPPLIER_TRGM_INDEXES
    for idx_name, _, _ in all_indexes:
        op.execute(text(f"DROP INDEX CONCURRENTLY IF EXISTS {idx_name}"))

    op.execute(text("DROP EXTENSION IF EXISTS pg_trgm"))
