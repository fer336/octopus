"""add_authorization_requests_table

Revision ID: z1y2x3w4v5u6_auth_req
Revises: 810d76cf0d3f
Create Date: 2026-05-04 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "z1y2x3w4v5u6_auth_req"
down_revision: str | Sequence[str] | None = "810d76cf0d3f"
branch_labels: str | Sequence[str] | None = "auth_branch"
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Tabla de solicitudes de autorización (4-eyes principle)
    op.create_table(
        "authorization_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        # Usuario que solicita
        sa.Column(
            "requested_by",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=False,
        ),
        # Usuario que autoriza
        sa.Column(
            "authorized_by",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Negocio
        sa.Column(
            "business_id",
            sa.UUID(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Tipo de autorización
        sa.Column(
            "authorization_type",
            sa.String(50),
            nullable=False,
        ),
        # ID del recurso
        sa.Column("resource_id", sa.UUID(), nullable=False),
        # Estado
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        # Motivo de la operación
        sa.Column("reason", sa.Text(), nullable=False),
        # Si fue rechazado, motivo
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        # Timestamp de resolución
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Índices para optimizar queries comunes
    op.create_index(
        "ix_authorization_requests_requested_by",
        "authorization_requests",
        ["requested_by"],
    )
    op.create_index(
        "ix_authorization_requests_authorized_by",
        "authorization_requests",
        ["authorized_by"],
    )
    op.create_index(
        "ix_authorization_requests_business_id",
        "authorization_requests",
        ["business_id"],
    )
    op.create_index(
        "ix_authorization_requests_status",
        "authorization_requests",
        ["status"],
    )
    op.create_index(
        "ix_authorization_requests_resource_id",
        "authorization_requests",
        ["resource_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_authorization_requests_resource_id", table_name="authorization_requests")
    op.drop_index("ix_authorization_requests_status", table_name="authorization_requests")
    op.drop_index("ix_authorization_requests_business_id", table_name="authorization_requests")
    op.drop_index("ix_authorization_requests_authorized_by", table_name="authorization_requests")
    op.drop_index("ix_authorization_requests_requested_by", table_name="authorization_requests")
    op.drop_table("authorization_requests")