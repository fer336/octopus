"""add_tenant_memberships_and_platform_role

Revision ID: b2d3f4e5c6a7
Revises: a1c2e3f4b5d6
Create Date: 2026-03-31

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2d3f4e5c6a7"
down_revision: str | None = "a1c2e3f4b5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Agregar platform_role a users
    op.add_column(
        "users",
        sa.Column(
            "platform_role", sa.String(20), nullable=False, server_default="tenant_user"
        ),
    )

    # 2. Crear tabla tenant_memberships
    op.create_table(
        "tenant_memberships",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "business_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("role", sa.String(20), nullable=False, server_default="owner"),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_id", "business_id", name="uq_user_business_membership"
        ),
    )

    # 3. Seed: crear membresías owner para los owners actuales de cada business
    op.execute("""
        INSERT INTO tenant_memberships (id, user_id, business_id, role, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            b.owner_id,
            b.id,
            'owner',
            NOW(),
            NOW()
        FROM businesses b
        WHERE NOT EXISTS (
            SELECT 1 FROM tenant_memberships tm
            WHERE tm.user_id = b.owner_id AND tm.business_id = b.id
        )
    """)


def downgrade() -> None:
    op.drop_table("tenant_memberships")
    op.drop_column("users", "platform_role")
