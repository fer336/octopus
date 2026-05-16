"""
Tests de integración para exportación de reportes PDF.
"""

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.supplier import Supplier
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
    await db.refresh(product)

    # Crear un lote para darle stock (current_stock es @property que suma lotes)
    lot = ProductLot(
        product_id=product.id,
        business_id=business_a.id,
        quantity=5,
        initial_quantity=5,
        received_date=date.today(),
    )
    db.add(lot)
    await db.commit()

    response = await client.get(
        "/api/tenant/reports/stock/pdf",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert "reporte_stock_" in response.headers.get("content-disposition", "")
    assert response.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_export_inventory_count_pdf_success_with_lot_stock(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a,
    membership_a,
):
    """Debe exportar planilla de conteo cargando lotes para evitar lazy-load async."""
    supplier = Supplier(
        business_id=business_a.id,
        name="Proveedor Conteo",
    )
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)

    product = Product(
        business_id=business_a.id,
        supplier_id=supplier.id,
        code="CNT-001",
        supplier_code="SUP-CNT-001",
        description="Producto test conteo",
        minimum_stock=1,
        cost_price=100,
        list_price=120,
        net_price=120,
        sale_price=145.2,
        iva_rate=21,
        is_active=True,
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)

    lot = ProductLot(
        product_id=product.id,
        business_id=business_a.id,
        quantity=7,
        initial_quantity=7,
        received_date=date.today(),
    )
    db.add(lot)
    await db.commit()

    response = await client.get(
        f"/api/tenant/purchase-orders/inventory-count/pdf?supplier_id={supplier.id}",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert "planilla_conteo" in response.headers.get("content-disposition", "")
    assert response.content.startswith(b"%PDF")
