"""add_client_types_catalog

Revision ID: e1f2a3b4c5d6
Revises: d7e8f9a0b1c2
Create Date: 2026-04-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "client_types",
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column(
            "is_subclient_eligible",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id", "name", name="uq_client_types_business_name"
        ),
    )
    op.create_index(
        op.f("ix_client_types_business_id"),
        "client_types",
        ["business_id"],
        unique=False,
    )
    op.create_index(op.f("ix_client_types_id"), "client_types", ["id"], unique=False)
    op.create_index(
        op.f("ix_client_types_name"), "client_types", ["name"], unique=False
    )

    op.execute(
        """
        INSERT INTO client_types (id, business_id, name, is_subclient_eligible, created_at, updated_at)
        SELECT gen_random_uuid(), b.id, 'Sin clasificar', false, NOW(), NOW()
        FROM businesses b
        WHERE b.deleted_at IS NULL
        """
    )

    op.add_column("clients", sa.Column("client_type_id", sa.UUID(), nullable=True))

    op.execute(
        """
        UPDATE clients c
        SET client_type_id = ct.id
        FROM client_types ct
        WHERE ct.business_id = c.business_id
          AND ct.name = 'Sin clasificar'
          AND c.client_type_id IS NULL
        """
    )

    op.alter_column("clients", "client_type_id", nullable=False)
    op.create_index(
        op.f("ix_clients_client_type_id"), "clients", ["client_type_id"], unique=False
    )
    op.create_foreign_key(
        "fk_clients_client_type_id",
        "clients",
        "client_types",
        ["client_type_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_clients_client_type_id", "clients", type_="foreignkey")
    op.drop_index(op.f("ix_clients_client_type_id"), table_name="clients")
    op.drop_column("clients", "client_type_id")

    op.drop_index(op.f("ix_client_types_name"), table_name="client_types")
    op.drop_index(op.f("ix_client_types_id"), table_name="client_types")
    op.drop_index(op.f("ix_client_types_business_id"), table_name="client_types")
    op.drop_table("client_types")
