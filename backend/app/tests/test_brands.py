"""Tests para borrado masivo de marcas."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import Brand
from app.models.business import Business
from app.models.product import Product
from app.models.user import User
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_bulk_delete_brands_deletes_matching_and_skips_unknown_or_foreign_ids(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
    user_a: User,
    membership_a,
):
    """Bulk delete debe soft-deletear solo marcas activas del negocio actual."""
    brand_a = Brand(business_id=business_a.id, name="FV", normalized_name="fv")
    brand_b = Brand(business_id=business_a.id, name="Ferrum", normalized_name="ferrum")
    foreign_brand = Brand(business_id=business_b.id, name="Foreign", normalized_name="foreign")
    db.add_all([brand_a, brand_b, foreign_brand])
    await db.commit()
    await db.refresh(brand_a)
    await db.refresh(brand_b)
    await db.refresh(foreign_brand)

    unknown_id = uuid4()
    response = await client.post(
        "/api/tenant/brands/bulk-delete",
        json={
            "ids": [
                str(brand_a.id),
                str(brand_b.id),
                str(foreign_brand.id),
                str(unknown_id),
            ]
        },
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 2, "not_found": 2}

    await db.refresh(brand_a)
    await db.refresh(brand_b)
    await db.refresh(foreign_brand)
    assert brand_a.deleted_at is not None
    assert brand_b.deleted_at is not None
    assert foreign_brand.deleted_at is None


@pytest.mark.asyncio
async def test_bulk_deleted_brands_are_excluded_from_list(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Las marcas soft-deleted por bulk-delete no deben aparecer en el listado."""
    deleted_brand = Brand(business_id=business_a.id, name="A eliminar", normalized_name="a-eliminar")
    visible_brand = Brand(business_id=business_a.id, name="Visible", normalized_name="visible")
    db.add_all([deleted_brand, visible_brand])
    await db.commit()
    await db.refresh(deleted_brand)
    deleted_brand_id = deleted_brand.id

    delete_response = await client.post(
        "/api/tenant/brands/bulk-delete",
        json={"ids": [str(deleted_brand_id)]},
        headers=make_auth_header(user_a),
    )
    assert delete_response.status_code == 200, delete_response.text

    list_response = await client.get(
        "/api/tenant/brands",
        headers=make_auth_header(user_a),
    )

    assert list_response.status_code == 200, list_response.text
    names = [item["name"] for item in list_response.json()["items"]]
    assert names == ["Visible"]

    db.expire_all()
    result = await db.execute(select(Brand).where(Brand.id == deleted_brand_id))
    stored_deleted_brand = result.scalar_one()
    assert stored_deleted_brand.deleted_at is not None


@pytest.mark.asyncio
async def test_bulk_delete_brand_with_products_is_blocked_like_individual_delete(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Bulk delete debe bloquear marcas con productos igual que el delete individual."""
    individual_brand = Brand(business_id=business_a.id, name="Individual", normalized_name="individual")
    bulk_brand = Brand(business_id=business_a.id, name="Masivo", normalized_name="masivo")
    db.add_all([individual_brand, bulk_brand])
    await db.commit()
    await db.refresh(individual_brand)
    await db.refresh(bulk_brand)

    db.add_all([
        Product(
            business_id=business_a.id,
            brand_id=individual_brand.id,
            code="IND-BRAND-001",
            description="Producto marca individual",
        ),
        Product(
            business_id=business_a.id,
            brand_id=bulk_brand.id,
            code="BULK-BRAND-001",
            description="Producto marca masiva",
        ),
    ])
    await db.commit()

    individual_response = await client.delete(
        f"/api/tenant/brands/{individual_brand.id}",
        headers=make_auth_header(user_a),
    )
    bulk_response = await client.post(
        "/api/tenant/brands/bulk-delete",
        json={"ids": [str(bulk_brand.id)]},
        headers=make_auth_header(user_a),
    )

    assert individual_response.status_code == 409, individual_response.text
    assert bulk_response.status_code == 409, bulk_response.text
    assert "tiene 1 producto asociado" in bulk_response.json()["detail"]

    await db.refresh(bulk_brand)
    assert bulk_brand.deleted_at is None


@pytest.mark.asyncio
async def test_bulk_delete_brands_counts_duplicate_ids_once(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """IDs repetidos en el request deben contarse una sola vez."""
    brand = Brand(business_id=business_a.id, name="Duplicada", normalized_name="duplicada")
    db.add(brand)
    await db.commit()
    await db.refresh(brand)

    response = await client.post(
        "/api/tenant/brands/bulk-delete",
        json={"ids": [str(brand.id), str(brand.id)]},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 1, "not_found": 0}
