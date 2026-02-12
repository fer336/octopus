"""add_arca_configuration_to_business

Revision ID: b5f92d3c8e11
Revises: a4ac8405e1f4
Create Date: 2026-02-06 23:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5f92d3c8e11'
down_revision: Union[str, None] = 'a4ac8405e1f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Agregar campos de configuración ARCA/AFIP
    op.add_column('businesses', sa.Column('arca_token', sa.Text(), nullable=True))
    op.add_column('businesses', sa.Column('arca_sign', sa.Text(), nullable=True))
    op.add_column('businesses', sa.Column('arca_token_expiration', sa.String(length=30), nullable=True))
    op.add_column('businesses', sa.Column('arca_cuit_representante', sa.String(length=13), nullable=True))
    op.add_column('businesses', sa.Column('arca_environment', sa.String(length=20), nullable=True, server_default='testing'))
    
    # Agregar campos de configuración MrBot API
    op.add_column('businesses', sa.Column('mrbot_email', sa.String(length=255), nullable=True))
    op.add_column('businesses', sa.Column('mrbot_api_key', sa.String(length=500), nullable=True))


def downgrade() -> None:
    # Eliminar campos en caso de rollback
    op.drop_column('businesses', 'mrbot_api_key')
    op.drop_column('businesses', 'mrbot_email')
    op.drop_column('businesses', 'arca_environment')
    op.drop_column('businesses', 'arca_cuit_representante')
    op.drop_column('businesses', 'arca_token_expiration')
    op.drop_column('businesses', 'arca_sign')
    op.drop_column('businesses', 'arca_token')
