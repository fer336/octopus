"""add product photo_url

Revision ID: f7e8d9c0b1a2
Revises: 53c349442068
Create Date: 2026-05-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'f7e8d9c0b1a2'
down_revision = '53c349442068'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('products', sa.Column('photo_url', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'photo_url')
