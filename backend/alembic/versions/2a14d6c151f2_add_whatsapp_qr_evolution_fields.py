"""add whatsapp qr evolution fields

Revision ID: 2a14d6c151f2
Revises: f7e8d9c0b1a2
Create Date: 2026-05-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2a14d6c151f2"
down_revision: str | None = "f7e8d9c0b1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("whatsapp_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("businesses", sa.Column("qr_scanner_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("businesses", sa.Column("evolution_api_key", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("businesses", "evolution_api_key")
    op.drop_column("businesses", "qr_scanner_enabled")
    op.drop_column("businesses", "whatsapp_enabled")
