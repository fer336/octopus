"""add related_voucher_id to vouchers

Revision ID: 999999999999
Revises: 20509a0afd1e
Create Date: 2026-02-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '999999999999'
down_revision = '20509a0afd1e'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vouchers', sa.Column('related_voucher_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_vouchers_related_voucher_id', 'vouchers', 'vouchers', ['related_voucher_id'], ['id'])


def downgrade():
    op.drop_constraint('fk_vouchers_related_voucher_id', 'vouchers', type_='foreignkey')
    op.drop_column('vouchers', 'related_voucher_id')

