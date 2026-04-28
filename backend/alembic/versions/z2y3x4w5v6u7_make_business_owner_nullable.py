"""Make business owner nullable

Revision ID: z2y3x4w5v6u7
Revises: add_tenant_secrets_deleted_at
Create Date: 2026-04-28 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "z2y3x4w5v6u7"
down_revision: Union[str, None] = "add_tenant_secrets_deleted_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "businesses",
        "owner_id",
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "businesses",
        "owner_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
