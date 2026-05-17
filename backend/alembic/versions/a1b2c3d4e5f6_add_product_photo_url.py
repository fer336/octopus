"""add product photo_url

Revision ID: a1b2c3d4e5f6
Revises: z9y8x7w6v5u4
Create Date: 2026-05-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'z9y8x7w6v5u4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('products', sa.Column('photo_url', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'photo_url')
