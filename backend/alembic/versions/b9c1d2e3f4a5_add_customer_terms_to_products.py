"""add customer_terms to products

Revision ID: b9c1d2e3f4a5
Revises: a1b2c3d4e5f6
Create Date: 2026-03-11

Agrega el campo customer_terms al modelo Product.
Este campo almacena los términos populares / jerga del cliente
que la IA usa para hacer matching semántico de productos.
Ejemplo: "rosca tuerca pp, bushing, niple macho, racor plástico"
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b9c1d2e3f4a5"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "customer_terms",
            sa.Text(),
            nullable=True,
            comment="Términos populares / jerga del cliente separados por comas. Usados por el agente IA para matching semántico.",
        ),
    )


def downgrade() -> None:
    op.drop_column("products", "customer_terms")
