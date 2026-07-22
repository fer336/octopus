"""Tests para el endpoint liviano de IDs de productos."""

from datetime import datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.business import Business
from app.models.category import Category
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.user import User
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_product_ids_returns_all_filtered_ids_without_pagination(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Debe devolver más de una página de IDs sin aplicar paginación."""
    products = [
        Product(
            business_id=business_a.id,
            code=f"BULK-{index:03d}",
            description=f"Producto masivo {index}",
            list_price=Decimal("100.00"),
            sale_price=Decimal("121.00"),
            cost_price=Decimal("0.00"),
            unit="unidad",
        )
        for index in range(30)
    ]
    db.add_all(products)
    await db.commit()

    response = await client.get(
        "/api/tenant/products/ids",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] == 30
    assert len(data["ids"]) == 30


@pytest.mark.asyncio
async def test_product_ids_respects_category_supplier_brand_and_search_filters(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Debe aplicar los mismos filtros principales del listado de productos."""
    category = Category(business_id=business_a.id, name="Sanitarios")
    other_category = Category(business_id=business_a.id, name="Ferretería")
    supplier = Supplier(business_id=business_a.id, name="Proveedor A")
    other_supplier = Supplier(business_id=business_a.id, name="Proveedor B")
    brand = Brand(business_id=business_a.id, name="FV", normalized_name="fv")
    other_brand = Brand(business_id=business_a.id, name="Peirano", normalized_name="peirano")
    db.add_all([category, other_category, supplier, other_supplier, brand, other_brand])
    await db.commit()
    await db.refresh(category)
    await db.refresh(other_category)
    await db.refresh(supplier)
    await db.refresh(other_supplier)
    await db.refresh(brand)
    await db.refresh(other_brand)

    expected = Product(
        business_id=business_a.id,
        category_id=category.id,
        supplier_id=supplier.id,
        brand_id=brand.id,
        code="MATCH-001",
        supplier_code="SUP-MATCH",
        description="Grifería monocomando premium",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
    )
    wrong_category = Product(
        business_id=business_a.id,
        category_id=other_category.id,
        supplier_id=supplier.id,
        brand_id=brand.id,
        code="MATCH-002",
        description="Grifería monocomando premium",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
    )
    wrong_supplier = Product(
        business_id=business_a.id,
        category_id=category.id,
        supplier_id=other_supplier.id,
        brand_id=brand.id,
        code="MATCH-003",
        description="Grifería monocomando premium",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
    )
    wrong_brand = Product(
        business_id=business_a.id,
        category_id=category.id,
        supplier_id=supplier.id,
        brand_id=other_brand.id,
        code="MATCH-004",
        description="Grifería monocomando premium",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
    )
    wrong_search = Product(
        business_id=business_a.id,
        category_id=category.id,
        supplier_id=supplier.id,
        brand_id=brand.id,
        code="NOPE-001",
        description="Taladro eléctrico",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
    )
    db.add_all([expected, wrong_category, wrong_supplier, wrong_brand, wrong_search])
    await db.commit()
    await db.refresh(expected)

    response = await client.get(
        "/api/tenant/products/ids",
        params={
            "search": "monocomando",
            "category_id": str(category.id),
            "supplier_id": str(supplier.id),
            "brand_id": str(brand.id),
        },
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"ids": [str(expected.id)], "total": 1}


@pytest.mark.asyncio
async def test_product_ids_excludes_soft_deleted_and_other_business_products(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
    user_a: User,
    membership_a,
):
    """Debe aplicar business_id y deleted_at IS NULL siempre."""
    visible = Product(
        business_id=business_a.id,
        code="VISIBLE-001",
        description="Producto visible",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
    )
    deleted = Product(
        business_id=business_a.id,
        code="DELETED-001",
        description="Producto borrado",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
        deleted_at=datetime.utcnow(),
    )
    foreign = Product(
        business_id=business_b.id,
        code="FOREIGN-001",
        description="Producto externo",
        list_price=Decimal("100.00"),
        sale_price=Decimal("121.00"),
        cost_price=Decimal("0.00"),
        unit="unidad",
    )
    db.add_all([visible, deleted, foreign])
    await db.commit()
    await db.refresh(visible)

    response = await client.get(
        "/api/tenant/products/ids",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"ids": [str(visible.id)], "total": 1}
