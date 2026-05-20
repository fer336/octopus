"""add_electronic_sale_point_and_srx

Revision ID: 859e6a405d22
Revises: z9y8x7w6v5u4
Create Date: 2026-05-20 00:00:00.000000

Agrega columnas de punto de venta electrónico, punto de venta alternativo SRX,
habilitación de SRX y contador de comprobantes X al modelo Business.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic
revision = '859e6a405d22'
down_revision = 'z9y8x7w6v5u4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'businesses',
        sa.Column(
            'electronic_sale_point',
            sa.String(5),
            nullable=True,
            server_default='0012',
        ),
    )
    op.add_column(
        'businesses',
        sa.Column(
            'alternative_sale_point',
            sa.String(5),
            nullable=True,
            server_default='5001',
        ),
    )
    op.add_column(
        'businesses',
        sa.Column(
            'srx_enabled',
            sa.Boolean(),
            nullable=True,
            server_default='false',
        ),
    )
    op.add_column(
        'businesses',
        sa.Column(
            'last_invoice_x_number',
            sa.String(8),
            nullable=True,
            server_default='00000000',
        ),
    )


def downgrade() -> None:
    op.drop_column('businesses', 'last_invoice_x_number')
    op.drop_column('businesses', 'srx_enabled')
    op.drop_column('businesses', 'alternative_sale_point')
    op.drop_column('businesses', 'electronic_sale_point')
