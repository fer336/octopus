"""Tests para borrado masivo de clientes."""

from decimal import Decimal
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.client import Client
from app.models.client_type import ClientType
from app.models.user import User
from app.tests.conftest import make_auth_header


async def create_client_type(db: AsyncSession, business_id) -> ClientType:
    """Crea un tipo de cliente para tests."""
    client_type = ClientType(business_id=business_id, name="Consumidor Final")
    db.add(client_type)
    await db.commit()
    await db.refresh(client_type)
    return client_type


def build_client(business_id, client_type_id, name: str, document_number: str) -> Client:
    """Construye un cliente mínimo para tests."""
    return Client(
        business_id=business_id,
        client_type_id=client_type_id,
        name=name,
        document_type="DNI",
        document_number=document_number,
        tax_condition="Consumidor Final",
    )


@pytest.mark.asyncio
async def test_bulk_delete_clients_deletes_matching_and_skips_unknown_or_foreign_ids(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    business_b: Business,
    user_a: User,
    membership_a,
):
    """Bulk delete debe soft-deletear solo clientes activos del negocio actual."""
    type_a = await create_client_type(db, business_a.id)
    type_b = await create_client_type(db, business_b.id)
    client_a = build_client(business_a.id, type_a.id, "Cliente A", "100")
    client_b = build_client(business_a.id, type_a.id, "Cliente B", "101")
    foreign_client = build_client(business_b.id, type_b.id, "Cliente externo", "200")
    db.add_all([client_a, client_b, foreign_client])
    await db.commit()
    await db.refresh(client_a)
    await db.refresh(client_b)
    await db.refresh(foreign_client)

    unknown_id = uuid4()
    response = await client.post(
        "/api/tenant/clients/bulk-delete",
        json={
            "ids": [
                str(client_a.id),
                str(client_b.id),
                str(foreign_client.id),
                str(unknown_id),
            ]
        },
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 2, "not_found": 2}

    await db.refresh(client_a)
    await db.refresh(client_b)
    await db.refresh(foreign_client)
    assert client_a.deleted_at is not None
    assert client_b.deleted_at is not None
    assert foreign_client.deleted_at is None


@pytest.mark.asyncio
async def test_bulk_deleted_clients_are_excluded_from_list(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Los clientes soft-deleted por bulk-delete no deben aparecer en el listado."""
    client_type = await create_client_type(db, business_a.id)
    deleted_client = build_client(business_a.id, client_type.id, "A eliminar", "300")
    visible_client = build_client(business_a.id, client_type.id, "Visible", "301")
    db.add_all([deleted_client, visible_client])
    await db.commit()
    await db.refresh(deleted_client)
    deleted_client_id = deleted_client.id

    delete_response = await client.post(
        "/api/tenant/clients/bulk-delete",
        json={"ids": [str(deleted_client_id)]},
        headers=make_auth_header(user_a),
    )
    assert delete_response.status_code == 200, delete_response.text

    list_response = await client.get(
        "/api/tenant/clients",
        headers=make_auth_header(user_a),
    )

    assert list_response.status_code == 200, list_response.text
    names = [item["name"] for item in list_response.json()["items"]]
    assert names == ["Visible"]

    db.expire_all()
    result = await db.execute(select(Client).where(Client.id == deleted_client_id))
    stored_deleted_client = result.scalar_one()
    assert stored_deleted_client.deleted_at is not None


@pytest.mark.asyncio
async def test_bulk_delete_client_with_balance_soft_deletes_like_individual_delete(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """Bulk delete debe replicar el delete individual: no bloquea por saldo."""
    client_type = await create_client_type(db, business_a.id)
    individual_client = build_client(business_a.id, client_type.id, "Individual", "400")
    bulk_client = build_client(business_a.id, client_type.id, "Masivo", "401")
    individual_client.current_balance = Decimal("150.00")
    bulk_client.current_balance = Decimal("250.00")
    db.add_all([individual_client, bulk_client])
    await db.commit()
    await db.refresh(individual_client)
    await db.refresh(bulk_client)

    individual_response = await client.delete(
        f"/api/tenant/clients/{individual_client.id}",
        headers=make_auth_header(user_a),
    )
    bulk_response = await client.post(
        "/api/tenant/clients/bulk-delete",
        json={"ids": [str(bulk_client.id)]},
        headers=make_auth_header(user_a),
    )

    assert individual_response.status_code == 200, individual_response.text
    assert bulk_response.status_code == 200, bulk_response.text

    await db.refresh(individual_client)
    await db.refresh(bulk_client)
    assert individual_client.deleted_at is not None
    assert bulk_client.deleted_at is not None
    assert individual_client.current_balance == Decimal("150.00")
    assert bulk_client.current_balance == Decimal("250.00")


@pytest.mark.asyncio
async def test_bulk_delete_clients_counts_duplicate_ids_once(
    client: AsyncClient,
    db: AsyncSession,
    business_a: Business,
    user_a: User,
    membership_a,
):
    """IDs repetidos en el request deben contarse una sola vez."""
    client_type = await create_client_type(db, business_a.id)
    stored_client = build_client(business_a.id, client_type.id, "Duplicado", "500")
    db.add(stored_client)
    await db.commit()
    await db.refresh(stored_client)

    response = await client.post(
        "/api/tenant/clients/bulk-delete",
        json={"ids": [str(stored_client.id), str(stored_client.id)]},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 1, "not_found": 0}
