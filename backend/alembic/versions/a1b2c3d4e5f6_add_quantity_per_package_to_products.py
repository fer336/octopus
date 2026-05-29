"""add quantity_per_package to products

Revision ID: a1b2c3d4e5f6
Revises: 492c6bfa0b57
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '492c6bfa0b57'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('products', sa.Column('quantity_per_package', sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'quantity_per_package')
