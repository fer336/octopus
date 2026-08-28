"""
Tests para vinculación Remito <-> Factura (Compras — PR2).

Cubre `PurchaseReceiptService.link_to_invoice`, `PurchaseInvoiceService.confirm`
con `receipt_ids` (escenario 3: remito primero, corrige costo del lote ya
creado sin duplicar), `PurchaseReceiptService.confirm` con factura vinculada ya
CONFIRMADA (escenario 2: factura primero, usa el costo neto ya conocido), y
una regresión explícita del escenario 1 (factura sola, sin remitos).
"""
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.purchase_invoice import PurchaseInvoiceStatus
from app.models.supplier import Supplier
from app.schemas.purchase_invoice import (
    PurchaseInvoiceConfirmRequest,
    PurchaseInvoiceCreate,
    PurchaseInvoiceItemCreate,
)
from app.schemas.purchase_receipt import (
    PurchaseReceiptConfirmRequest,
    PurchaseReceiptCreate,
    PurchaseReceiptItemCreate,
)
from app.services.purchase_invoice_service import PurchaseInvoiceService
from app.services.purchase_receipt_service import PurchaseReceiptService

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def supplier_a(db, business_a):
    supplier = Supplier(business_id=business_a.id, name="Proveedor Uno")
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@pytest_asyncio.fixture
async def product_a(db, business_a):
    product = Product(
        business_id=business_a.id,
        code="CANIO-001",
        description="Caño PVC 1/2",
        list_price=Decimal("100.00"),
        iva_rate=Decimal("21.00"),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


def _invoice_data(**overrides) -> PurchaseInvoiceCreate:
    defaults = dict(
        invoice_number="0001-00000001",
        invoice_date=date(2026, 7, 29),
        items=[],
    )
    defaults.update(overrides)
    return PurchaseInvoiceCreate(**defaults)


def _receipt_data(product_id, **overrides) -> PurchaseReceiptCreate:
    defaults = dict(
        receipt_number="R-0001",
        received_date=date(2026, 7, 20),
        items=[PurchaseReceiptItemCreate(product_id=product_id, quantity=10)],
    )
    defaults.update(overrides)
    return PurchaseReceiptCreate(**defaults)


def _invoice_item(product_id, **overrides) -> PurchaseInvoiceItemCreate:
    defaults = dict(
        product_id=product_id,
        description="Caño PVC 1/2",
        quantity=Decimal("10"),
        unit_cost=Decimal("50"),
    )
    defaults.update(overrides)
    return PurchaseInvoiceItemCreate(**defaults)


class TestLinkToInvoice:
    async def test_link_draft_receipt_to_draft_invoice(self, db, business_a, user_a, product_a):
        invoice_service = PurchaseInvoiceService(db)
        receipt_service = PurchaseReceiptService(db)

        invoice, _ = await invoice_service.create_draft(
            business_a.id, user_a.id, _invoice_data(items=[_invoice_item(product_a.id)])
        )
        receipt = await receipt_service.create_draft(
            business_a.id, user_a.id, _receipt_data(product_a.id)
        )

        linked = await receipt_service.link_to_invoice(
            receipt.id, business_a.id, invoice.id, user_a.id
        )

        assert linked.purchase_invoice_id == invoice.id

    async def test_link_rejects_when_invoice_already_updated_stock(
        self, db, business_a, user_a, product_a
    ):
        invoice_service = PurchaseInvoiceService(db)
        receipt_service = PurchaseReceiptService(db)

        invoice, _ = await invoice_service.create_draft(
            business_a.id, user_a.id, _invoice_data(items=[_invoice_item(product_a.id)])
        )
        await invoice_service.confirm(
            invoice.id, business_a.id, user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=True),
        )

        receipt = await receipt_service.create_draft(
            business_a.id, user_a.id, _receipt_data(product_a.id)
        )

        with pytest.raises(ValueError, match="stock"):
            await receipt_service.link_to_invoice(
                receipt.id, business_a.id, invoice.id, user_a.id
            )

    async def test_link_rejects_relink_to_different_invoice(
        self, db, business_a, user_a, product_a
    ):
        invoice_service = PurchaseInvoiceService(db)
        receipt_service = PurchaseReceiptService(db)

        invoice_1, _ = await invoice_service.create_draft(
            business_a.id, user_a.id,
            _invoice_data(invoice_number="A", items=[_invoice_item(product_a.id)]),
        )
        invoice_2, _ = await invoice_service.create_draft(
            business_a.id, user_a.id,
            _invoice_data(invoice_number="B", items=[_invoice_item(product_a.id)]),
        )
        receipt = await receipt_service.create_draft(
            business_a.id, user_a.id, _receipt_data(product_a.id)
        )
        await receipt_service.link_to_invoice(receipt.id, business_a.id, invoice_1.id, user_a.id)

        with pytest.raises(ValueError, match="otra factura"):
            await receipt_service.link_to_invoice(
                receipt.id, business_a.id, invoice_2.id, user_a.id
            )

    async def test_link_is_idempotent_to_same_invoice(self, db, business_a, user_a, product_a):
        invoice_service = PurchaseInvoiceService(db)
        receipt_service = PurchaseReceiptService(db)

        invoice, _ = await invoice_service.create_draft(
            business_a.id, user_a.id, _invoice_data(items=[_invoice_item(product_a.id)])
        )
        receipt = await receipt_service.create_draft(
            business_a.id, user_a.id, _receipt_data(product_a.id)
        )

        await receipt_service.link_to_invoice(receipt.id, business_a.id, invoice.id, user_a.id)
        linked_again = await receipt_service.link_to_invoice(
            receipt.id, business_a.id, invoice.id, user_a.id
        )

        assert linked_again.purchase_invoice_id == invoice.id


class TestScenario3ReceiptFirst:
    """Remito llega y se confirma primero (crea lote sin costo); la factura
    llega después y se vincula/confirma → corrige el costo del lote que ya
    existe, sin crear uno nuevo."""

    async def test_confirm_invoice_with_receipt_ids_corrects_cost_no_new_lot(
        self, db, business_a, user_a, supplier_a, product_a
    ):
        receipt_service = PurchaseReceiptService(db)
        invoice_service = PurchaseInvoiceService(db)

        receipt = await receipt_service.create_draft(
            business_a.id, user_a.id,
            _receipt_data(product_a.id, supplier_id=supplier_a.id, received_date=date(2026, 6, 1)),
        )
        receipt = await receipt_service.confirm(
            receipt.id, business_a.id, user_a.id, PurchaseReceiptConfirmRequest(update_stock=True)
        )
        lot_id = receipt.items[0].lot_id
        assert lot_id is not None

        invoice, _ = await invoice_service.create_draft(
            business_a.id, user_a.id,
            _invoice_data(supplier_id=supplier_a.id, items=[_invoice_item(product_a.id)]),
        )

        confirmed = await invoice_service.confirm(
            invoice.id, business_a.id, user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=True, receipt_ids=[receipt.id]),
        )

        assert confirmed.status == PurchaseInvoiceStatus.CONFIRMED
        assert confirmed.items[0].lot_id is None  # no crea lote nuevo para lo ya cubierto
        assert confirmed.stock_warnings == []

        lot = await db.get(ProductLot, lot_id)
        assert lot.cost_price == Decimal("50.00")
        assert lot.received_date == date(2026, 6, 1)  # intacto — sigue siendo el del remito
        assert lot.quantity == 10  # intacto — no se duplicó

        linked_receipt = await receipt_service.get_by_id(receipt.id, business_a.id)
        assert linked_receipt.purchase_invoice_id == invoice.id

    async def test_confirm_invoice_qty_mismatch_adds_warning_but_confirms(
        self, db, business_a, user_a, supplier_a, product_a
    ):
        receipt_service = PurchaseReceiptService(db)
        invoice_service = PurchaseInvoiceService(db)

        receipt = await receipt_service.create_draft(
            business_a.id, user_a.id,
            _receipt_data(
                product_a.id,
                supplier_id=supplier_a.id,
                items=[PurchaseReceiptItemCreate(product_id=product_a.id, quantity=Decimal("8"))],
            ),
        )
        receipt = await receipt_service.confirm(
            receipt.id, business_a.id, user_a.id, PurchaseReceiptConfirmRequest(update_stock=True)
        )

        invoice, _ = await invoice_service.create_draft(
            business_a.id, user_a.id,
            _invoice_data(
                supplier_id=supplier_a.id,
                items=[_invoice_item(product_a.id, quantity=Decimal("10"))],
            ),
        )

        confirmed = await invoice_service.confirm(
            invoice.id, business_a.id, user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=True, receipt_ids=[receipt.id]),
        )

        assert confirmed.status == PurchaseInvoiceStatus.CONFIRMED
        assert len(confirmed.stock_warnings) == 1


class TestScenario2InvoiceFirst:
    """Factura llega y se confirma primero con `update_stock=False` (sin
    stock); el remito llega y se vincula/confirma después → usa el costo
    neto ya conocido de la factura en vez de `cost_price=None`."""

    async def test_receipt_confirm_uses_linked_invoice_net_cost(
        self, db, business_a, user_a, supplier_a, product_a
    ):
        invoice_service = PurchaseInvoiceService(db)
        receipt_service = PurchaseReceiptService(db)

        invoice, _ = await invoice_service.create_draft(
            business_a.id, user_a.id,
            _invoice_data(supplier_id=supplier_a.id, items=[_invoice_item(product_a.id)]),
        )
        await invoice_service.confirm(
            invoice.id, business_a.id, user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=False),
        )

        receipt = await receipt_service.create_draft(
            business_a.id, user_a.id, _receipt_data(product_a.id, supplier_id=supplier_a.id)
        )
        await receipt_service.link_to_invoice(receipt.id, business_a.id, invoice.id, user_a.id)

        confirmed = await receipt_service.confirm(
            receipt.id, business_a.id, user_a.id, PurchaseReceiptConfirmRequest(update_stock=True)
        )

        lot = await db.get(ProductLot, confirmed.items[0].lot_id)
        assert lot.cost_price == Decimal("50.00")


class TestScenario1Regression:
    """Sin `receipt_ids` y sin remitos pre-vinculados, `confirm()` debe
    comportarse EXACTAMENTE igual que antes de este cambio."""

    async def test_confirm_without_receipts_unchanged(self, db, business_a, user_a, product_a):
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_a.id, user_a.id, _invoice_data(items=[_invoice_item(product_a.id)])
        )

        confirmed = await service.confirm(
            invoice.id, business_a.id, user_a.id, PurchaseInvoiceConfirmRequest(update_stock=True)
        )

        assert confirmed.status == PurchaseInvoiceStatus.CONFIRMED
        assert confirmed.items[0].lot_id is not None
        assert confirmed.stock_warnings == []

        lot = await db.get(ProductLot, confirmed.items[0].lot_id)
        assert lot.cost_price == Decimal("50.00")
