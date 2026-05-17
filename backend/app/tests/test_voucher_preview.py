"""
Tests de integración para preview de compilación con fiscal_client_id.
"""
from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.models.category import Category
from app.models.client import Client
from app.models.client_type import ClientType
from app.models.product import Product
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.tests.conftest import make_auth_header


@pytest_asyncio.fixture
async def test_client_type(db, business_a) -> ClientType:
    """Tipo de cliente de prueba."""
    ct = ClientType(
        business_id=business_a.id,
        name="Default",
        is_subclient_eligible=False,
    )
    db.add(ct)
    await db.commit()
    await db.refresh(ct)
    return ct


@pytest_asyncio.fixture
async def test_client_ri(db, business_a, test_client_type) -> Client:
    """Cliente RI para tests."""
    c = Client(
        business_id=business_a.id,
        client_type_id=test_client_type.id,
        name="Cliente RI",
        document_type="CUIT",
        document_number="30-12345678-1",
        tax_condition="RI",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@pytest_asyncio.fixture
async def test_client_mono(db, business_a, test_client_type) -> Client:
    """Cliente Monotributista para tests."""
    c = Client(
        business_id=business_a.id,
        client_type_id=test_client_type.id,
        name="Cliente Monotributista",
        document_type="CUIT",
        document_number="30-87654321-0",
        tax_condition="Monotributista",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@pytest_asyncio.fixture
async def test_category(db, business_a) -> Category:
    """Categoría de prueba."""
    cat = Category(
        business_id=business_a.id,
        name="Test Cat",
        description="Categoría de prueba",
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@pytest_asyncio.fixture
async def test_product(db, business_a, test_category) -> Product:
    """Producto de prueba con IVA 21%."""
    p = Product(
        business_id=business_a.id,
        category_id=test_category.id,
        code="TEST001",
        description="Producto de prueba",
        cost_price=Decimal("50"),
        net_price=Decimal("100"),
        sale_price=Decimal("121"),
        iva_rate=Decimal("21"),
        unit="unidad",
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@pytest_asyncio.fixture
async def test_quotation(
    db, business_a, test_client_ri, test_product
) -> Voucher:
    """Cotización de prueba con 1 ítem."""
    q = Voucher(
        business_id=business_a.id,
        client_id=test_client_ri.id,
        voucher_type=VoucherType.QUOTATION,
        status=VoucherStatus.CONFIRMED,
        sale_point="0001",
        number="00000001",
        date=date(2026, 5, 16),
        general_discount=Decimal("0"),
        subtotal=Decimal("100"),
        iva_amount=Decimal("21"),
        total=Decimal("121"),
    )
    db.add(q)
    await db.flush()

    item = VoucherItem(
        voucher_id=q.id,
        product_id=test_product.id,
        code=test_product.code,
        description=test_product.description,
        quantity=Decimal("1"),
        unit=test_product.unit,
        unit_price=Decimal("100"),  # net_price sin IVA
        iva_rate=Decimal("21"),
        discount_percent=Decimal("0"),
        subtotal=Decimal("100"),
        iva_amount=Decimal("21"),
        total=Decimal("121"),
        line_number=1,
    )
    db.add(item)
    await db.commit()
    await db.refresh(q)
    return q


class TestCompilePreviewFiscalClient:
    """RED: preview_compile_totals con fiscal_client_id."""

    @pytest.mark.asyncio
    async def test_preview_without_fiscal_client_id(
        self, client: AsyncClient, business_a, user_a, membership_a, test_quotation
    ):
        """Preview sin fiscal_client_id → usa cliente origen, retorna invoice_variant."""
        headers = make_auth_header(user_a)

        payload = {
            "quotation_ids": [str(test_quotation.id)],
            "price_strategy": "historical",
        }
        resp = await client.post(
            "/api/tenant/vouchers/compile-to-invoice/preview",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "subtotal" in data
        assert "iva_amount" in data
        assert "total" in data
        assert "invoice_variant" in data

    @pytest.mark.asyncio
    async def test_preview_with_fiscal_client_id_ri(
        self,
        client: AsyncClient,
        business_a,
        user_a,
        membership_a,
        test_quotation,
        test_client_ri,
    ):
        """Preview con fiscal_client_id RI → invoice_variant='A'."""
        headers = make_auth_header(user_a)

        payload = {
            "quotation_ids": [str(test_quotation.id)],
            "price_strategy": "historical",
            "fiscal_client_id": str(test_client_ri.id),
        }
        resp = await client.post(
            "/api/tenant/vouchers/compile-to-invoice/preview",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["invoice_variant"] == "A"

    @pytest.mark.asyncio
    async def test_preview_with_fiscal_client_id_mono(
        self,
        client: AsyncClient,
        business_a,
        user_a,
        membership_a,
        test_quotation,
        test_client_mono,
    ):
        """Preview con fiscal_client_id Monotributista → invoice_variant='B'."""
        headers = make_auth_header(user_a)

        payload = {
            "quotation_ids": [str(test_quotation.id)],
            "price_strategy": "historical",
            "fiscal_client_id": str(test_client_mono.id),
        }
        resp = await client.post(
            "/api/tenant/vouchers/compile-to-invoice/preview",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["invoice_variant"] == "B"

    @pytest.mark.asyncio
    async def test_preview_with_nonexistent_fiscal_client(
        self, client: AsyncClient, business_a, user_a, membership_a, test_quotation
    ):
        """Preview con fiscal_client_id inexistente → 404."""
        headers = make_auth_header(user_a)

        payload = {
            "quotation_ids": [str(test_quotation.id)],
            "price_strategy": "historical",
            "fiscal_client_id": str(uuid4()),
        }
        resp = await client.post(
            "/api/tenant/vouchers/compile-to-invoice/preview",
            json=payload,
            headers=headers,
        )
        assert resp.status_code == 404
