"""
Tests focalizados para actualización masiva de productos.
"""

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.product import Product
from app.models.user import User
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_bulk_update_persists_usd_pricing_fields(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Bulk update conserva precio fuente USD y lista canónica ARS."""
    product = Product(
        business_id=business_a.id,
        code="USD-BULK-001",
        description="Producto dolarizado bulk update",
        list_price=Decimal("100000.00"),
        price_currency="USD",
        list_price_usd=Decimal("100.00"),
        sale_price=Decimal("121000.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)

    response = await client.post(
        "/api/tenant/products/bulk-update",
        json={
            "products": [
                {
                    "id": str(product.id),
                    "description": product.description,
                    "price_currency": "USD",
                    "list_price_usd": 120,
                    "list_price": 150000,
                    "discount_1": 0,
                    "discount_2": 0,
                    "discount_3": 0,
                    "extra_cost": 0,
                    "profit_margin": 0,
                    "current_stock": 0,
                }
            ]
        },
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    data = response.json()
    updated_product = data["products"][0]

    assert data["updated_count"] == 1
    assert updated_product["price_currency"] == "USD"
    assert Decimal(str(updated_product["list_price_usd"])) == Decimal("120.00")
    assert Decimal(str(updated_product["list_price"])) == Decimal("150000.00")
