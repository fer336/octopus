"""add_afipsdk_access_token_to_business

Revision ID: c7a3e1f90d22
Revises: 5f2acbab05a7
Create Date: 2026-02-10 01:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c7a3e1f90d22'
down_revision: str | None = '5f2acbab05a7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Agregar campos para Afip SDK
    op.add_column(
        'businesses',
        sa.Column('afipsdk_access_token', sa.String(length=500), nullable=True),
    )
    op.add_column(
        'businesses',
        sa.Column('afip_cert', sa.Text(), nullable=True),
    )
    op.add_column(
        'businesses',
        sa.Column('afip_key', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('businesses', 'afip_key')
    op.drop_column('businesses', 'afip_cert')
    op.drop_column('businesses', 'afipsdk_access_token')

