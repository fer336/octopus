"""add_supplier_category_relation

Revision ID: 8feee9046942
Revises: a4ac8405e1f4
Create Date: 2026-02-06 15:44:11.748310

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '8feee9046942'
down_revision: str | Sequence[str] | None = 'a4ac8405e1f4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Crear tabla de relación many-to-many entre suppliers y categories
    op.create_table(
        'supplier_categories',
        sa.Column('supplier_id', sa.UUID(), nullable=False),
        sa.Column('category_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('supplier_id', 'category_id')
    )

    # Crear índices para mejorar el rendimiento
    op.create_index(
        'ix_supplier_categories_supplier_id',
        'supplier_categories',
        ['supplier_id']
    )
    op.create_index(
        'ix_supplier_categories_category_id',
        'supplier_categories',
        ['category_id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_supplier_categories_category_id', table_name='supplier_categories')
    op.drop_index('ix_supplier_categories_supplier_id', table_name='supplier_categories')
    op.drop_table('supplier_categories')
