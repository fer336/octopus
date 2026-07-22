"""Tests para borrado masivo de proveedores."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.user import User
from app.tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_bulk_delete_suppliers_deletes_matching_and_skips_unknown_or_foreign_ids(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
    user_a: User,
    membership_a,
):
    """Bulk delete debe soft-deletear solo proveedores activos del negocio actual."""
    supplier_a = Supplier(business_id=business_a.id, name="Proveedor A")
    supplier_b = Supplier(business_id=business_a.id, name="Proveedor B")
    foreign_supplier = Supplier(business_id=business_b.id, name="Proveedor externo")
    db.add_all([supplier_a, supplier_b, foreign_supplier])
    await db.commit()
    await db.refresh(supplier_a)
    await db.refresh(supplier_b)
    await db.refresh(foreign_supplier)

    unknown_id = uuid4()
    response = await client.post(
        "/api/tenant/suppliers/bulk-delete",
        json={
            "ids": [
                str(supplier_a.id),
                str(supplier_b.id),
                str(foreign_supplier.id),
                str(unknown_id),
            ]
        },
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 2, "not_found": 2}

    await db.refresh(supplier_a)
    await db.refresh(supplier_b)
    await db.refresh(foreign_supplier)
    assert supplier_a.deleted_at is not None
    assert supplier_b.deleted_at is not None
    assert foreign_supplier.deleted_at is None


@pytest.mark.asyncio
async def test_bulk_deleted_suppliers_are_excluded_from_list(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Los proveedores soft-deleted por bulk-delete no deben aparecer en el listado."""
    deleted_supplier = Supplier(business_id=business_a.id, name="A eliminar")
    visible_supplier = Supplier(business_id=business_a.id, name="Visible")
    db.add_all([deleted_supplier, visible_supplier])
    await db.commit()
    await db.refresh(deleted_supplier)
    deleted_supplier_id = deleted_supplier.id

    delete_response = await client.post(
        "/api/tenant/suppliers/bulk-delete",
        json={"ids": [str(deleted_supplier_id)]},
        headers=make_auth_header(user_a),
    )
    assert delete_response.status_code == 200, delete_response.text

    list_response = await client.get(
        "/api/tenant/suppliers",
        headers=make_auth_header(user_a),
    )

    assert list_response.status_code == 200, list_response.text
    names = [item["name"] for item in list_response.json()["items"]]
    assert names == ["Visible"]

    db.expire_all()
    result = await db.execute(select(Supplier).where(Supplier.id == deleted_supplier_id))
    stored_deleted_supplier = result.scalar_one()
    assert stored_deleted_supplier.deleted_at is not None


@pytest.mark.asyncio
async def test_bulk_delete_supplier_keeps_product_association_like_individual_delete(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Bulk delete debe replicar el delete individual: no desasocia productos."""
    individual_supplier = Supplier(business_id=business_a.id, name="Individual")
    bulk_supplier = Supplier(business_id=business_a.id, name="Masivo")
    db.add_all([individual_supplier, bulk_supplier])
    await db.commit()
    await db.refresh(individual_supplier)
    await db.refresh(bulk_supplier)

    individual_product = Product(
        business_id=business_a.id,
        supplier_id=individual_supplier.id,
        code="IND-001",
        description="Producto individual",
    )
    bulk_product = Product(
        business_id=business_a.id,
        supplier_id=bulk_supplier.id,
        code="BULK-001",
        description="Producto masivo",
    )
    db.add_all([individual_product, bulk_product])
    await db.commit()
    await db.refresh(individual_product)
    await db.refresh(bulk_product)

    individual_response = await client.delete(
        f"/api/tenant/suppliers/{individual_supplier.id}",
        headers=make_auth_header(user_a),
    )
    bulk_response = await client.post(
        "/api/tenant/suppliers/bulk-delete",
        json={"ids": [str(bulk_supplier.id)]},
        headers=make_auth_header(user_a),
    )

    assert individual_response.status_code == 200, individual_response.text
    assert bulk_response.status_code == 200, bulk_response.text

    await db.refresh(individual_product)
    await db.refresh(bulk_product)
    assert individual_product.supplier_id == individual_supplier.id
    assert bulk_product.supplier_id == bulk_supplier.id


@pytest.mark.asyncio
async def test_bulk_delete_suppliers_counts_duplicate_ids_once(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """IDs repetidos en el request deben contarse una sola vez."""
    supplier = Supplier(business_id=business_a.id, name="Duplicado")
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)

    response = await client.post(
        "/api/tenant/suppliers/bulk-delete",
        json={"ids": [str(supplier.id), str(supplier.id)]},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 1, "not_found": 0}
