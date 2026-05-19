"""add whatsapp_instance_name to businesses

Revision ID: b3c4d5e6f7a8
Revises: 2a14d6c151f2
Create Date: 2026-05-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | None = "2a14d6c151f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("whatsapp_instance_name", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("businesses", "whatsapp_instance_name")
