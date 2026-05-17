"""Add missing units_per_pack column to products

Revision ID: 842969c6a2a4
Revises: d4e5f6a7b8c9
Create Date: 2026-05-13 20:42:11.296171

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '842969c6a2a4'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # d4e5f6a7b8c9 already adds this column; use IF NOT EXISTS to be safe on all envs
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_pack INTEGER")


def downgrade() -> None:
    # Column is owned by d4e5f6a7b8c9 — do not drop it here
    pass
