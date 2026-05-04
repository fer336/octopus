"""create_drafts_table

Revision ID: 42b53abba4f8
Revises: 02a713705d09
Create Date: 2026-05-04 12:05:22.531761

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '42b53abba4f8'
down_revision: Union[str, Sequence[str], None] = '02a713705d09'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create drafts table."""
    op.create_table(
        'drafts',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('business_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('client_name', sa.VARCHAR(length=255), nullable=True),
        sa.Column('voucher_type', sa.VARCHAR(length=50), nullable=False),
        sa.Column('operating_client_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('items', postgresql.JSONB, nullable=False, server_default='[]'),
        sa.Column('general_discount', sa.NUMERIC(precision=5, scale=2), nullable=False, server_default='0'),
        sa.Column('show_prices', sa.BOOLEAN(), nullable=False, server_default='true'),
        sa.Column('item_count', sa.INTEGER(), nullable=False, server_default='0'),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id', name='drafts_pkey'),
    )
    
    # Foreign keys
    op.create_foreign_key(
        'drafts_business_id_fkey',
        'drafts', 'businesses',
        ['business_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'drafts_user_id_fkey',
        'drafts', 'users',
        ['user_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'drafts_client_id_fkey',
        'drafts', 'clients',
        ['client_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'drafts_operating_client_id_fkey',
        'drafts', 'clients',
        ['operating_client_id'], ['id'],
        ondelete='SET NULL'
    )
    
    # Index
    op.create_index('ix_drafts_business_id', 'drafts', ['business_id'], unique=False)
    op.create_index('ix_drafts_id', 'drafts', ['id'], unique=False)


def downgrade() -> None:
    """Drop drafts table."""
    op.drop_index('ix_drafts_id', table_name='drafts')
    op.drop_index('ix_drafts_business_id', table_name='drafts')
    op.drop_constraint('drafts_operating_client_id_fkey', table_name='drafts', type_='foreignkey')
    op.drop_constraint('drafts_client_id_fkey', table_name='drafts', type_='foreignkey')
    op.drop_constraint('drafts_user_id_fkey', table_name='drafts', type_='foreignkey')
    op.drop_constraint('drafts_business_id_fkey', table_name='drafts', type_='foreignkey')
    op.drop_table('drafts')