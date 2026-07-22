"""Tests para validaciones y borrado masivo de categorías."""

from datetime import datetime
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.category import Category
from app.models.user import User
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.services.category_service import CategoryService
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_create_duplicate_name_same_business_returns_400(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Crear una categoría con nombre repetido en el mismo negocio debe fallar."""
    db.add(Category(business_id=business_a.id, name="Ferretería"))
    await db.commit()

    response = await client.post(
        "/api/tenant/categories",
        json={"name": "ferretería"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Ya existe una categoría con ese nombre"


@pytest.mark.asyncio
async def test_create_duplicate_name_different_business_is_allowed(
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
):
    """El mismo nombre en negocios distintos debe permitirse."""
    db.add(Category(business_id=business_a.id, name="Sanitarios"))
    await db.commit()

    service = CategoryService(db)
    created = await service.create(
        business_b.id,
        CategoryCreate(name="sanitarios"),
    )

    assert created.id is not None
    assert created.business_id == business_b.id
    assert created.name == "sanitarios"


@pytest.mark.asyncio
async def test_update_to_existing_name_same_business_is_rejected(
    db: AsyncSession,
    business_a: Business,
):
    """Actualizar una categoría al nombre de otra del mismo negocio debe fallar."""
    existing = Category(business_id=business_a.id, name="Herramientas")
    target = Category(business_id=business_a.id, name="Pinturas")
    db.add_all([existing, target])
    await db.commit()
    await db.refresh(target)

    service = CategoryService(db)

    with pytest.raises(ValueError, match="Ya existe una categoría con ese nombre"):
        await service.update(target.id, business_a.id, CategoryUpdate(name="herramientas"))


@pytest.mark.asyncio
async def test_create_ignores_soft_deleted_duplicate_name(
    db: AsyncSession,
    business_a: Business,
):
    """Un duplicado soft-deleted no debe bloquear recrear la categoría."""
    db.add(
        Category(
            business_id=business_a.id,
            name="Electricidad",
            deleted_at=datetime.utcnow(),
        )
    )
    await db.commit()

    service = CategoryService(db)
    created = await service.create(business_a.id, CategoryCreate(name="electricidad"))

    assert created.name == "electricidad"
    assert created.deleted_at is None


@pytest.mark.asyncio
async def test_bulk_delete_deletes_matching_and_skips_unknown_or_foreign_ids(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
    user_a: User,
    membership_a,
):
    """Bulk delete debe soft-deletear solo categorías activas del negocio actual."""
    category_a = Category(business_id=business_a.id, name="Caños")
    category_b = Category(business_id=business_a.id, name="Grifería")
    foreign_category = Category(business_id=business_b.id, name="Foreign")
    db.add_all([category_a, category_b, foreign_category])
    await db.commit()
    await db.refresh(category_a)
    await db.refresh(category_b)
    await db.refresh(foreign_category)

    unknown_id = uuid4()
    response = await client.post(
        "/api/tenant/categories/bulk-delete",
        json={
            "ids": [
                str(category_a.id),
                str(category_b.id),
                str(foreign_category.id),
                str(unknown_id),
            ]
        },
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 2, "not_found": 2}

    await db.refresh(category_a)
    await db.refresh(category_b)
    await db.refresh(foreign_category)
    assert category_a.deleted_at is not None
    assert category_b.deleted_at is not None
    assert foreign_category.deleted_at is None


@pytest.mark.asyncio
async def test_bulk_deleted_categories_are_excluded_from_list(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Las categorías soft-deleted por bulk-delete no deben aparecer en el listado."""
    deleted_category = Category(business_id=business_a.id, name="A eliminar")
    visible_category = Category(business_id=business_a.id, name="Visible")
    db.add_all([deleted_category, visible_category])
    await db.commit()
    await db.refresh(deleted_category)
    deleted_category_id = deleted_category.id

    delete_response = await client.post(
        "/api/tenant/categories/bulk-delete",
        json={"ids": [str(deleted_category_id)]},
        headers=make_auth_header(user_a),
    )
    assert delete_response.status_code == 200, delete_response.text

    list_response = await client.get(
        "/api/tenant/categories",
        headers=make_auth_header(user_a),
    )

    assert list_response.status_code == 200, list_response.text
    names = [item["name"] for item in list_response.json()["items"]]
    assert names == ["Visible"]

    db.expire_all()
    result = await db.execute(select(Category).where(Category.id == deleted_category_id))
    stored_deleted_category = result.scalar_one()
    assert stored_deleted_category.deleted_at is not None
