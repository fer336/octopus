"""
Integration tests for ARCA invoice emission and number sync endpoints.
AfipSdkService is mocked — tests focus on router logic, not ARCA connectivity.
"""
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.client import Client
from app.models.client_type import ClientType
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.tests.conftest import make_auth_header


async def _make_client(db: AsyncSession, business: Business) -> Client:
    ct = ClientType(business_id=business.id, name="Consumidor Final")
    db.add(ct)
    await db.flush()
    c = Client(
        business_id=business.id,
        client_type_id=ct.id,
        name="Test Client",
        document_type="DNI",
        document_number="99999999",
        tax_condition="Consumidor Final",
    )
    db.add(c)
    await db.flush()
    return c


async def _make_voucher(
    db: AsyncSession,
    business: Business,
    client: Client,
    voucher_type: VoucherType = VoucherType.INVOICE_B,
    cae: str | None = None,
) -> Voucher:
    v = Voucher(
        business_id=business.id,
        client_id=client.id,
        billing_client_id=client.id,
        operating_client_id=client.id,
        voucher_type=voucher_type,
        status=VoucherStatus.DRAFT,
        sale_point="0012",
        number="00000001",
        date=date(2026, 1, 1),
        total="121.00",
        subtotal="100.00",
        cae=cae,
    )
    db.add(v)
    await db.flush()
    return v


# ─── emit-invoice ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_emit_invoice_not_found_returns_404(
    client: AsyncClient,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """Non-existent voucher_id returns 404."""
    headers = make_auth_header(user_a)
    response = await client.post(
        "/api/tenant/arca/emit-invoice",
        headers=headers,
        json={"voucher_id": str(uuid4())},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_emit_invoice_quotation_type_rejected(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """QUOTATION type cannot be submitted to ARCA."""
    c = await _make_client(db, business_a)
    v = await _make_voucher(db, business_a, c, VoucherType.QUOTATION)
    await db.commit()

    headers = make_auth_header(user_a)
    response = await client.post(
        "/api/tenant/arca/emit-invoice",
        headers=headers,
        json={"voucher_id": str(v.id)},
    )
    assert response.status_code == 400
    assert "no se puede facturar" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_emit_invoice_invoice_x_type_rejected(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """INVOICE_X (Comprobante X) cannot be submitted to ARCA — no fiscal validity."""
    c = await _make_client(db, business_a)
    v = await _make_voucher(db, business_a, c, VoucherType.INVOICE_X)
    await db.commit()

    headers = make_auth_header(user_a)
    response = await client.post(
        "/api/tenant/arca/emit-invoice",
        headers=headers,
        json={"voucher_id": str(v.id)},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_emit_invoice_already_has_cae_rejected(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """Voucher already authorized (has CAE) cannot be re-emitted."""
    c = await _make_client(db, business_a)
    v = await _make_voucher(db, business_a, c, VoucherType.INVOICE_B, cae="12345678901234")
    await db.commit()

    headers = make_auth_header(user_a)
    response = await client.post(
        "/api/tenant/arca/emit-invoice",
        headers=headers,
        json={"voucher_id": str(v.id)},
    )
    assert response.status_code == 400
    assert "cae" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_emit_invoice_invoicing_disabled_returns_403(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """When invoicing_enabled=False for the tenant, emission is forbidden."""
    business_a.invoicing_enabled = False
    await db.commit()

    c = await _make_client(db, business_a)
    v = await _make_voucher(db, business_a, c)
    await db.commit()

    headers = make_auth_header(user_a)
    response = await client.post(
        "/api/tenant/arca/emit-invoice",
        headers=headers,
        json={"voucher_id": str(v.id)},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_emit_invoice_success_assigns_cae(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """Successful emission returns CAE and updates voucher status."""
    business_a.invoicing_enabled = True
    await db.commit()

    c = await _make_client(db, business_a)
    v = await _make_voucher(db, business_a, c)
    await db.commit()

    mock_service = MagicMock()
    mock_service.emit_invoice = AsyncMock(return_value={
        "success": True,
        "CAE": "99887766554433",
        "CAEFchVto": "2026-12-31",
        "voucherNumber": 1,
    })

    headers = make_auth_header(user_a)
    with patch("app.routers.arca.AfipSdkService", return_value=mock_service):
        response = await client.post(
            "/api/tenant/arca/emit-invoice",
            headers=headers,
            json={"voucher_id": str(v.id)},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["cae"] == "99887766554433"


@pytest.mark.asyncio
async def test_emit_invoice_arca_error_returns_failure_payload(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """When ARCA rejects the voucher, success=False is returned (not 500)."""
    business_a.invoicing_enabled = True
    await db.commit()

    c = await _make_client(db, business_a)
    v = await _make_voucher(db, business_a, c)
    await db.commit()

    mock_service = MagicMock()
    mock_service.emit_invoice = AsyncMock(return_value={
        "success": False,
        "error": "(10016) El numero del comprobante no se corresponde con el proximo a autorizar.",
    })

    headers = make_auth_header(user_a)
    with patch("app.routers.arca.AfipSdkService", return_value=mock_service):
        response = await client.post(
            "/api/tenant/arca/emit-invoice",
            headers=headers,
            json={"voucher_id": str(v.id)},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "10016" in data["errors"][0]


# ─── sync-numbers ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_numbers_updates_local_counters(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """sync-numbers writes ARCA values to local last_invoice_a/b_number."""
    business_a.last_invoice_a_number = "00000000"
    business_a.last_invoice_b_number = "00000000"
    await db.commit()

    mock_service = MagicMock()
    mock_service.get_last_voucher = AsyncMock(side_effect=[
        {"success": True, "lastVoucher": 5},   # Factura A
        {"success": True, "lastVoucher": 12},  # Factura B
    ])

    headers = make_auth_header(user_a)
    with patch("app.routers.arca.AfipSdkService", return_value=mock_service):
        response = await client.post(
            "/api/tenant/arca/sync-numbers",
            headers=headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["synced"]["last_invoice_a"] == 5
    assert data["synced"]["last_invoice_b"] == 12
    assert data["synced"]["next_invoice_a"] == 6
    assert data["synced"]["next_invoice_b"] == 13

    await db.refresh(business_a)
    assert business_a.last_invoice_a_number == "00000005"
    assert business_a.last_invoice_b_number == "00000012"


@pytest.mark.asyncio
async def test_sync_numbers_arca_error_returns_500(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    business_a: Business,
    membership_a: TenantMembership,
):
    """If ARCA call raises, sync-numbers returns 500."""
    mock_service = MagicMock()
    mock_service.get_last_voucher = AsyncMock(side_effect=Exception("Connection refused"))

    headers = make_auth_header(user_a)
    with patch("app.routers.arca.AfipSdkService", return_value=mock_service):
        response = await client.post(
            "/api/tenant/arca/sync-numbers",
            headers=headers,
        )

    assert response.status_code == 500
