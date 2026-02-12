"""create supplier_category_discounts table manual

Revision ID: 74bbeb216fa7
Revises: fcd7abe2eb17
Create Date: 2026-02-12 18:45:24.112349

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '74bbeb216fa7'
down_revision: Union[str, Sequence[str], None] = 'fcd7abe2eb17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'supplier_category_discounts',
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('discount_1', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0.00'),
        sa.Column('discount_2', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0.00'),
        sa.Column('discount_3', sa.Numeric(precision=5, scale=2), nullable=False, server_default='0.00'),
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id'], ),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_supplier_category_discounts_category_id'), 'supplier_category_discounts', ['category_id'], unique=False)
    op.create_index(op.f('ix_supplier_category_discounts_supplier_id'), 'supplier_category_discounts', ['supplier_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_supplier_category_discounts_supplier_id'), table_name='supplier_category_discounts')
    op.drop_index(op.f('ix_supplier_category_discounts_category_id'), table_name='supplier_category_discounts')
    op.drop_table('supplier_category_discounts')
