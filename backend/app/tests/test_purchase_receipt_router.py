"""
Router tests for Purchase Receipts (Compras — remitos de proveedor, PR1).

Cubre: crear borrador, listar con filtros/paginación, obtener por id,
editar borrador, confirmar (con y sin impacto de stock), y aislamiento
por tenant. Vinculación con facturas queda para PR2, no se cubre acá.
"""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import make_auth_header

pytestmark = pytest.mark.asyncio

BASE_URL = "/api/tenant/purchase-receipts"


@pytest_asyncio.fixture
async def supplier_a(db: AsyncSession, business_a: Business) -> Supplier:
    supplier = Supplier(business_id=business_a.id, name="Proveedor Remito SA")
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@pytest_asyncio.fixture
async def product_a(db: AsyncSession, business_a: Business) -> Product:
    product = Product(
        business_id=business_a.id,
        code="RCPT-001",
        description="Caño PVC 1/2 Remito",
        list_price=Decimal("100.00"),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


def _create_payload(
    receipt_number: str = "R-0001",
    supplier_id=None,
    product_id=None,
) -> dict:
    return {
        "supplier_id": str(supplier_id) if supplier_id else None,
        "receipt_number": receipt_number,
        "received_date": str(date.today()),
        "items": [
            {
                "product_id": str(product_id) if product_id else str(uuid4()),
                "quantity": "10",
            }
        ],
    }


# ---------------------------------------------------------------------------
# Crear borrador
# ---------------------------------------------------------------------------


async def test_create_draft_manual(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    supplier_a: Supplier,
    product_a: Product,
):
    response = await client.post(
        BASE_URL,
        json=_create_payload(supplier_id=supplier_a.id, product_id=product_a.id),
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "draft"
    assert data["receipt_number"] == "R-0001"
    assert len(data["items"]) == 1
    assert data["items"][0]["product_id"] == str(product_a.id)


# ---------------------------------------------------------------------------
# Listar con filtros/paginación
# ---------------------------------------------------------------------------


async def test_list_purchase_receipts_with_filters_and_pagination(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    supplier_a: Supplier,
):
    await client.post(
        BASE_URL,
        json=_create_payload("A-001", supplier_id=supplier_a.id),
        headers=make_auth_header(user_a),
    )
    await client.post(
        BASE_URL,
        json=_create_payload("A-002"),
        headers=make_auth_header(user_a),
    )

    response = await client.get(
        BASE_URL,
        params={"supplier_id": str(supplier_a.id), "page": 1, "per_page": 20},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["receipt_number"] == "A-001"


# ---------------------------------------------------------------------------
# Obtener por id
# ---------------------------------------------------------------------------


async def test_get_purchase_receipt_by_id_200(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("GET-001"),
        headers=make_auth_header(user_a),
    )
    receipt_id = create_resp.json()["id"]

    response = await client.get(
        f"{BASE_URL}/{receipt_id}",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.json()["id"] == receipt_id


async def test_get_purchase_receipt_not_found_404(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    response = await client.get(
        f"{BASE_URL}/{uuid4()}",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Editar borrador
# ---------------------------------------------------------------------------


async def test_update_draft_200(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("UPD-001"),
        headers=make_auth_header(user_a),
    )
    receipt_id = create_resp.json()["id"]

    response = await client.put(
        f"{BASE_URL}/{receipt_id}",
        json={"receipt_number": "UPD-001-EDITED"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.json()["receipt_number"] == "UPD-001-EDITED"


async def test_update_draft_not_found_404(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    response = await client.put(
        f"{BASE_URL}/{uuid4()}",
        json={"receipt_number": "X"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 404


async def test_update_draft_not_in_draft_status_400(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("UPD-002"),
        headers=make_auth_header(user_a),
    )
    receipt_id = create_resp.json()["id"]

    confirm_resp = await client.post(
        f"{BASE_URL}/{receipt_id}/confirm",
        json={"update_stock": False},
        headers=make_auth_header(user_a),
    )
    assert confirm_resp.status_code == 200

    response = await client.put(
        f"{BASE_URL}/{receipt_id}",
        json={"receipt_number": "SHOULD-FAIL"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Confirmar
# ---------------------------------------------------------------------------


async def test_confirm_draft_200(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    product_a: Product,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("CONF-001", product_id=product_a.id),
        headers=make_auth_header(user_a),
    )
    receipt_id = create_resp.json()["id"]

    response = await client.post(
        f"{BASE_URL}/{receipt_id}/confirm",
        json={"update_stock": True},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "confirmed"
    assert data["items"][0]["lot_id"] is not None


async def test_confirm_with_update_stock_false_does_not_create_lot(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    product_a: Product,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("CONF-002", product_id=product_a.id),
        headers=make_auth_header(user_a),
    )
    receipt_id = create_resp.json()["id"]

    response = await client.post(
        f"{BASE_URL}/{receipt_id}/confirm",
        json={"update_stock": False},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["lot_id"] is None


async def test_confirm_not_found_404(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    response = await client.post(
        f"{BASE_URL}/{uuid4()}/confirm",
        json={"update_stock": True},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 404


async def test_confirm_already_confirmed_400(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    product_a: Product,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("CONF-003", product_id=product_a.id),
        headers=make_auth_header(user_a),
    )
    receipt_id = create_resp.json()["id"]

    first = await client.post(
        f"{BASE_URL}/{receipt_id}/confirm",
        json={"update_stock": True},
        headers=make_auth_header(user_a),
    )
    assert first.status_code == 200

    second = await client.post(
        f"{BASE_URL}/{receipt_id}/confirm",
        json={"update_stock": True},
        headers=make_auth_header(user_a),
    )

    assert second.status_code == 400


# ---------------------------------------------------------------------------
# Aislamiento por tenant
# ---------------------------------------------------------------------------


async def test_tenant_isolation_business_b_cannot_see_business_a_receipt(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    user_b: User,
    membership_b: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("ISO-001"),
        headers=make_auth_header(user_a),
    )
    receipt_id = create_resp.json()["id"]

    response = await client.get(
        f"{BASE_URL}/{receipt_id}",
        headers=make_auth_header(user_b),
    )

    assert response.status_code == 404
