"""add_tenant_secrets_table

Revision ID: a1c2e3f4b5d6
Revises: 70253179bd70
Create Date: 2026-03-31

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1c2e3f4b5d6"
down_revision: Union[str, None] = "70253179bd70"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tenant_secrets",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "business_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("secret_type", sa.String(100), nullable=False),
        sa.Column("encrypted_value", sa.Text(), nullable=True),
        sa.Column("last4", sa.String(4), nullable=True),
        sa.Column(
            "is_configured", sa.Boolean(), server_default="false", nullable=False
        ),
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
    )

    # Índice compuesto para búsquedas por tenant + tipo
    op.create_index(
        "ix_tenant_secrets_business_secret_type",
        "tenant_secrets",
        ["business_id", "secret_type"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_tenant_secrets_business_secret_type", table_name="tenant_secrets")
    op.drop_table("tenant_secrets")
