"""add related_voucher_id to vouchers

Revision ID: b8536960a28c
Revises: 0a9a80888ff8
Create Date: 2026-02-14 00:18:57.142676

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'b8536960a28c'
down_revision: str | Sequence[str] | None = '0a9a80888ff8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Esta columna ya fue agregada por la revisión legacy 999999999999 en otra
    # rama del grafo. La migración queda idempotente para que una DB fresca pueda
    # reconstruirse sin fallar por DuplicateColumn/DuplicateObject.
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column['name'] for column in inspector.get_columns('vouchers')}
    foreign_keys = {fk['name'] for fk in inspector.get_foreign_keys('vouchers')}

    if 'related_voucher_id' not in columns:
        op.add_column('vouchers', sa.Column('related_voucher_id', sa.UUID(), nullable=True))

    if 'fk_vouchers_related_voucher_id' not in foreign_keys:
        op.create_foreign_key(
            'fk_vouchers_related_voucher_id',
            'vouchers', 'vouchers',
            ['related_voucher_id'], ['id'],
            ondelete='SET NULL'
        )


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column['name'] for column in inspector.get_columns('vouchers')}
    foreign_keys = {fk['name'] for fk in inspector.get_foreign_keys('vouchers')}

    if 'fk_vouchers_related_voucher_id' in foreign_keys:
        op.drop_constraint('fk_vouchers_related_voucher_id', 'vouchers', type_='foreignkey')

    if 'related_voucher_id' in columns:
        op.drop_column('vouchers', 'related_voucher_id')
