"""Tests focalizados para normalización de marcas."""

from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.schemas.product import ProductCreate, ProductListParams
from app.services.brand_service import BrandService
from app.services.product_service import ProductService


@pytest.mark.asyncio
async def test_equivalent_brand_names_resolve_to_one_brand(
    db: AsyncSession,
    business_a: Business,
):
    """FV, F.V. y espacios/case variantes deben resolver a una sola marca."""
    service = BrandService(db)

    first = await service.resolve_or_create(business_a.id, "FV")
    second = await service.resolve_or_create(business_a.id, "F.V.")
    third = await service.resolve_or_create(business_a.id, " fv ")

    assert first.id == second.id == third.id
    assert first.normalized_name == "fv"


@pytest.mark.asyncio
async def test_product_create_sets_brand_id_and_filter_by_brand_id(
    db: AsyncSession,
    business_a: Business,
):
    """Crear producto con marca texto crea marca canónica y permite filtrar por brand_id."""
    product_service = ProductService(db)

    created = await product_service.create(
        business_a.id,
        ProductCreate(
            code="BR-001",
            description="Producto con marca normalizada",
            brand="F.V.",
            list_price=Decimal("100.00"),
        ),
    )

    assert created.brand_id is not None
    assert created.brand == "F.V."

    products, total = await product_service.list(
        business_a.id,
        ProductListParams(brand_id=created.brand_id),
    )

    assert total == 1
    assert products[0].id == created.id
