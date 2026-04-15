"""
Tests de integración para exportación de reportes PDF.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.user import User
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_export_stock_report_pdf_success(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a,
    membership_a,
):
    """Debe exportar el reporte de stock en PDF para el tenant autenticado."""
    product = Product(
        business_id=business_a.id,
        code="PRD-001",
        supplier_code="SUP-001",
        description="Producto test reporte",
        current_stock=5,
        minimum_stock=10,
        cost_price=100,
        list_price=120,
        net_price=120,
        sale_price=145.2,
        iva_rate=21,
        is_active=True,
    )
    db.add(product)
    await db.commit()

    response = await client.get(
        "/api/tenant/reports/stock/pdf",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert "reporte_stock_" in response.headers.get("content-disposition", "")
    assert response.content.startswith(b"%PDF")
