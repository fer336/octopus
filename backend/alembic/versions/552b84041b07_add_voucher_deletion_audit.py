"""add_voucher_deletion_audit

Revision ID: 552b84041b07
Revises: 20509a0afd1e
Create Date: 2026-02-06 20:07:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '552b84041b07'
down_revision: Union[str, None] = '20509a0afd1e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Agregar campos de auditoría de eliminación
    op.add_column('vouchers', sa.Column('deleted_by', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('vouchers', sa.Column('deletion_reason', sa.Text(), nullable=True))
    
    # Agregar foreign key a users
    op.create_foreign_key(
        'fk_vouchers_deleted_by_users',
        'vouchers', 'users',
        ['deleted_by'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_vouchers_deleted_by_users', 'vouchers', type_='foreignkey')
    op.drop_column('vouchers', 'deletion_reason')
    op.drop_column('vouchers', 'deleted_by')
