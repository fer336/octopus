"""
Router tests for Purchase Invoices (Compras — facturas, PR3).

Cubre: crear borrador (manual), listar con filtros/paginación, obtener por
id, editar borrador, confirmar, extracción IA (mockeada — nunca se llama a
un proveedor real) y edición post-confirmación (reversión) vía
InvoiceReversalService, incluyendo el conflicto 409 por consumo de lotes.
"""
import json
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.supplier import Supplier
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.services.llm_factory import LLMFactory
from app.tests.conftest import make_auth_header

pytestmark = pytest.mark.asyncio

BASE_URL = "/api/tenant/purchase-invoices"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def supplier_a(db: AsyncSession, business_a: Business) -> Supplier:
    supplier = Supplier(business_id=business_a.id, name="Proveedor Router SA")
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@pytest_asyncio.fixture
async def product_a(db: AsyncSession, business_a: Business) -> Product:
    product = Product(
        business_id=business_a.id,
        code="RTR-001",
        description="Caño PVC 1/2 Router",
        list_price=Decimal("100.00"),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


def _create_payload(
    invoice_number: str = "0001-00000001",
    supplier_id=None,
    product_id=None,
) -> dict:
    return {
        "supplier_id": str(supplier_id) if supplier_id else None,
        "invoice_number": invoice_number,
        "invoice_date": str(date.today()),
        "items": [
            {
                "product_id": str(product_id) if product_id else None,
                "description": "Ítem de prueba",
                "quantity": "5",
                "unit_cost": "80.00",
                "iva_rate": "21.00",
            }
        ],
    }


class _FakeCompletions:
    def __init__(self, content: str):
        self._content = content

    def create(self, **kwargs):
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self._content))]
        )


class _FakeOpenAIClient:
    def __init__(self, content: str):
        self.chat = SimpleNamespace(completions=_FakeCompletions(content))


def _mock_llm(monkeypatch, extracted: dict):
    """Mockea LLMFactory para que la extracción devuelva `extracted` sin red."""

    async def fake_resolve(business_id, db):
        return ("openai", "sk-test-fake", "gpt-4o")

    monkeypatch.setattr(LLMFactory, "resolve", fake_resolve)
    monkeypatch.setattr(
        LLMFactory,
        "build_openai_compatible",
        lambda api_key, provider, base_url=None: _FakeOpenAIClient(
            json.dumps(extracted)
        ),
    )


def _make_pdf_bytes(text: str | None) -> bytes:
    """Genera un PDF real en memoria con PyMuPDF (con o sin texto extraíble)."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    if text:
        page.insert_text((72, 72), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


# ---------------------------------------------------------------------------
# Crear borrador (manual)
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
    assert data["source"] == "manual"
    assert data["invoice_number"] == "0001-00000001"
    assert len(data["items"]) == 1
    assert data["total"] == "484.00"  # 80*5 = 400 + 21% iva = 484


# ---------------------------------------------------------------------------
# Listar con filtros/paginación
# ---------------------------------------------------------------------------


async def test_list_purchase_invoices_with_filters_and_pagination(
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
    assert body["page"] == 1
    assert body["items"][0]["invoice_number"] == "A-001"


# ---------------------------------------------------------------------------
# Obtener por id
# ---------------------------------------------------------------------------


async def test_get_purchase_invoice_by_id_200(
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
    invoice_id = create_resp.json()["id"]

    response = await client.get(
        f"{BASE_URL}/{invoice_id}",
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.json()["id"] == invoice_id


async def test_get_purchase_invoice_not_found_404(
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
    invoice_id = create_resp.json()["id"]

    response = await client.put(
        f"{BASE_URL}/{invoice_id}",
        json={"invoice_number": "UPD-001-EDITED"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.json()["invoice_number"] == "UPD-001-EDITED"


async def test_update_draft_not_found_404(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    response = await client.put(
        f"{BASE_URL}/{uuid4()}",
        json={"invoice_number": "X"},
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
    invoice_id = create_resp.json()["id"]

    confirm_resp = await client.post(
        f"{BASE_URL}/{invoice_id}/confirm",
        json={"update_stock": False, "update_prices": False},
        headers=make_auth_header(user_a),
    )
    assert confirm_resp.status_code == 200

    response = await client.put(
        f"{BASE_URL}/{invoice_id}",
        json={"invoice_number": "SHOULD-FAIL"},
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
    invoice_id = create_resp.json()["id"]

    response = await client.post(
        f"{BASE_URL}/{invoice_id}/confirm",
        json={"update_stock": True, "update_prices": False},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "confirmed"
    assert body["items"][0]["lot_id"] is not None


async def test_confirm_not_found_404(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    response = await client.post(
        f"{BASE_URL}/{uuid4()}/confirm",
        json={},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 404


async def test_confirm_already_confirmed_400(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("CONF-002"),
        headers=make_auth_header(user_a),
    )
    invoice_id = create_resp.json()["id"]

    await client.post(
        f"{BASE_URL}/{invoice_id}/confirm",
        json={"update_stock": False},
        headers=make_auth_header(user_a),
    )
    response = await client.post(
        f"{BASE_URL}/{invoice_id}/confirm",
        json={"update_stock": False},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 400


async def test_confirm_without_items_400(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("CONF-003"),
        headers=make_auth_header(user_a),
    )
    invoice_id = create_resp.json()["id"]

    await client.put(
        f"{BASE_URL}/{invoice_id}",
        json={"items": []},
        headers=make_auth_header(user_a),
    )

    response = await client.post(
        f"{BASE_URL}/{invoice_id}/confirm",
        json={"update_stock": False},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Extracción IA
# ---------------------------------------------------------------------------


async def test_ai_extract_creates_draft(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    supplier_a: Supplier,
    product_a: Product,
    monkeypatch,
):
    extracted = {
        "supplier_name": "Proveedor Router SA",
        "invoice_number": "AI-0001",
        "invoice_date": str(date.today()),
        "items": [
            {
                "code": "RTR-001",
                "description": "Caño PVC 1/2 Router",
                "quantity": 3,
                "unit_cost": 50,
                "iva_rate": 21,
            }
        ],
    }
    _mock_llm(monkeypatch, extracted)
    pdf_bytes = _make_pdf_bytes("Factura Proveedor Router SA")

    response = await client.post(
        f"{BASE_URL}/ai-extract",
        files={"file": ("factura.pdf", pdf_bytes, "application/pdf")},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["source"] == "ai"
    assert data["status"] == "draft"
    assert data["supplier_id"] == str(supplier_a.id)
    assert data["items"][0]["product_id"] == str(product_a.id)

    # Contrato: la IA nunca escribe stock directamente.
    lots = await db.execute(ProductLot.__table__.select())
    assert lots.fetchall() == []


async def test_ai_extract_unreadable_pdf_returns_422(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    monkeypatch,
):
    pdf_bytes = _make_pdf_bytes(None)

    response = await client.post(
        f"{BASE_URL}/ai-extract",
        files={"file": ("blank.pdf", pdf_bytes, "application/pdf")},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Edición post-confirmación (reversión)
# ---------------------------------------------------------------------------


async def test_edit_confirmed_invoice_200(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("REV-001"),
        headers=make_auth_header(user_a),
    )
    invoice_id = create_resp.json()["id"]
    await client.post(
        f"{BASE_URL}/{invoice_id}/confirm",
        json={"update_stock": False},
        headers=make_auth_header(user_a),
    )

    response = await client.post(
        f"{BASE_URL}/{invoice_id}/edit-confirmed",
        json={"invoice_number": "REV-001-EDITED"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.json()["invoice_number"] == "REV-001-EDITED"


async def test_edit_confirmed_not_found_404(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    response = await client.post(
        f"{BASE_URL}/{uuid4()}/edit-confirmed",
        json={"invoice_number": "X"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 404


async def test_edit_confirmed_on_draft_returns_400(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("REV-002"),
        headers=make_auth_header(user_a),
    )
    invoice_id = create_resp.json()["id"]

    response = await client.post(
        f"{BASE_URL}/{invoice_id}/edit-confirmed",
        json={"invoice_number": "SHOULD-FAIL"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 400


async def test_edit_confirmed_with_consumption_conflict_returns_409(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    product_a: Product,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("REV-003", product_id=product_a.id),
        headers=make_auth_header(user_a),
    )
    invoice_id = create_resp.json()["id"]

    confirm_resp = await client.post(
        f"{BASE_URL}/{invoice_id}/confirm",
        json={"update_stock": True},
        headers=make_auth_header(user_a),
    )
    lot_id = confirm_resp.json()["items"][0]["lot_id"]

    # Simula consumo del lote por una venta posterior.
    lot = await db.get(ProductLot, UUID(lot_id))
    lot.quantity = lot.initial_quantity - 1
    await db.commit()

    response = await client.post(
        f"{BASE_URL}/{invoice_id}/edit-confirmed",
        json={"invoice_number": "REV-003-EDITED"},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["conflicts"][0]["lot_id"] == lot_id


async def test_edit_confirmed_with_consumption_and_force_adjustment_200(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    membership_a: TenantMembership,
    product_a: Product,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("REV-004", product_id=product_a.id),
        headers=make_auth_header(user_a),
    )
    invoice_id = create_resp.json()["id"]

    confirm_resp = await client.post(
        f"{BASE_URL}/{invoice_id}/confirm",
        json={"update_stock": True},
        headers=make_auth_header(user_a),
    )
    lot_id = confirm_resp.json()["items"][0]["lot_id"]

    lot = await db.get(ProductLot, UUID(lot_id))
    lot.quantity = lot.initial_quantity - 1
    await db.commit()

    response = await client.post(
        f"{BASE_URL}/{invoice_id}/edit-confirmed",
        json={"invoice_number": "REV-004-EDITED", "force_adjustment": True},
        headers=make_auth_header(user_a),
    )

    assert response.status_code == 200
    assert response.json()["invoice_number"] == "REV-004-EDITED"


# ---------------------------------------------------------------------------
# Aislamiento multi-tenant
# ---------------------------------------------------------------------------


async def test_tenant_isolation_business_b_cannot_see_business_a_invoice(
    client: AsyncClient,
    db: AsyncSession,
    user_a: User,
    user_b: User,
    membership_a: TenantMembership,
    membership_b: TenantMembership,
):
    create_resp = await client.post(
        BASE_URL,
        json=_create_payload("ISO-001"),
        headers=make_auth_header(user_a),
    )
    invoice_id = create_resp.json()["id"]

    response = await client.get(
        f"{BASE_URL}/{invoice_id}",
        headers=make_auth_header(user_b),
    )

    assert response.status_code == 404
