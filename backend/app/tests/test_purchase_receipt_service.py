"""
Tests para PurchaseReceiptService (Compras — remitos de proveedor, PR1).
Cubre: creación de borrador manual, listado, edición de borrador, y
confirmación atómica (creación de ProductLot con received_date explícito
y cost_price=None — el remito nunca maneja costo, eso es responsabilidad
de la factura vinculada, ver design.md de remitos).
"""
from datetime import date

import pytest
import pytest_asyncio

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.purchase_receipt import PurchaseReceiptStatus
from app.models.supplier import Supplier
from app.schemas.purchase_receipt import (
    PurchaseReceiptConfirmRequest,
    PurchaseReceiptCreate,
    PurchaseReceiptItemCreate,
    PurchaseReceiptUpdate,
)
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
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


def _create_data(product_id, **overrides) -> PurchaseReceiptCreate:
    defaults = dict(
        receipt_number="R-0001",
        received_date=date(2026, 7, 29),
        items=[PurchaseReceiptItemCreate(product_id=product_id, quantity=10)],
    )
    defaults.update(overrides)
    return PurchaseReceiptCreate(**defaults)


class TestCreateDraft:
    """RED → crear un borrador de remito no debe impactar stock."""

    async def test_create_manual_draft(self, db, business_a, user_a, product_a):
        service = PurchaseReceiptService(db)

        receipt = await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(product_a.id),
        )

        assert receipt.id is not None
        assert receipt.status == PurchaseReceiptStatus.DRAFT
        assert receipt.receipt_number == "R-0001"
        assert receipt.received_date == date(2026, 7, 29)
        assert len(receipt.items) == 1
        assert receipt.items[0].quantity == 10
        assert receipt.items[0].lot_id is None

    async def test_create_draft_with_supplier_and_expected_invoice(
        self, db, business_a, user_a, supplier_a, product_a
    ):
        service = PurchaseReceiptService(db)

        receipt = await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(
                product_a.id,
                supplier_id=supplier_a.id,
                expected_invoice_number="0001-00012345",
            ),
        )

        assert receipt.supplier_id == supplier_a.id
        assert receipt.expected_invoice_number == "0001-00012345"
        assert receipt.purchase_invoice_id is None


class TestListAndGet:
    async def test_list_scoped_to_business_newest_first(
        self, db, business_a, business_b, user_a, product_a
    ):
        service = PurchaseReceiptService(db)
        await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(product_a.id, receipt_number="R-0001"),
        )
        await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(product_a.id, receipt_number="R-0002"),
        )

        result = await service.list(business_id=business_a.id)

        assert result["total"] == 2
        assert {r.receipt_number for r in result["items"]} == {"R-0001", "R-0002"}

    async def test_get_by_id_not_found_returns_none(self, db, business_a):
        service = PurchaseReceiptService(db)
        from uuid import uuid4

        assert await service.get_by_id(uuid4(), business_a.id) is None


class TestUpdateDraft:
    async def test_update_draft_replaces_items(
        self, db, business_a, user_a, product_a
    ):
        service = PurchaseReceiptService(db)
        receipt = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data(product_a.id)
        )

        updated = await service.update_draft(
            receipt.id,
            business_a.id,
            PurchaseReceiptUpdate(
                items=[PurchaseReceiptItemCreate(product_id=product_a.id, quantity=25)]
            ),
        )

        assert len(updated.items) == 1
        assert updated.items[0].quantity == 25

    async def test_cannot_update_confirmed_receipt(
        self, db, business_a, user_a, product_a
    ):
        service = PurchaseReceiptService(db)
        receipt = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data(product_a.id)
        )
        await service.confirm(
            receipt.id, business_a.id, user_a.id, PurchaseReceiptConfirmRequest()
        )

        with pytest.raises(ValueError, match="borrador"):
            await service.update_draft(
                receipt.id, business_a.id, PurchaseReceiptUpdate(receipt_number="R-9999")
            )


class TestConfirm:
    """RED → confirm() crea lotes con received_date explícito y sin costo."""

    async def test_confirm_creates_lot_with_received_date_and_no_cost(
        self, db, business_a, user_a, product_a
    ):
        service = PurchaseReceiptService(db)
        receipt = await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(product_a.id, received_date=date(2026, 6, 1)),
        )

        confirmed = await service.confirm(
            receipt.id, business_a.id, user_a.id, PurchaseReceiptConfirmRequest(update_stock=True)
        )

        assert confirmed.status == PurchaseReceiptStatus.CONFIRMED
        assert confirmed.confirmed_by == user_a.id
        assert confirmed.confirmed_at is not None
        assert confirmed.items[0].lot_id is not None

        lot = await db.get(ProductLot, confirmed.items[0].lot_id)
        assert lot.quantity == 10
        assert lot.initial_quantity == 10
        assert lot.received_date == date(2026, 6, 1)  # fecha real, no date.today()
        assert lot.cost_price is None

    async def test_confirm_with_update_stock_false_does_not_create_lot(
        self, db, business_a, user_a, product_a
    ):
        service = PurchaseReceiptService(db)
        receipt = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data(product_a.id)
        )

        confirmed = await service.confirm(
            receipt.id, business_a.id, user_a.id, PurchaseReceiptConfirmRequest(update_stock=False)
        )

        assert confirmed.status == PurchaseReceiptStatus.CONFIRMED
        assert confirmed.items[0].lot_id is None

    async def test_cannot_confirm_already_confirmed(
        self, db, business_a, user_a, product_a
    ):
        service = PurchaseReceiptService(db)
        receipt = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data(product_a.id)
        )
        await service.confirm(
            receipt.id, business_a.id, user_a.id, PurchaseReceiptConfirmRequest()
        )

        with pytest.raises(ValueError, match="borrador"):
            await service.confirm(
                receipt.id, business_a.id, user_a.id, PurchaseReceiptConfirmRequest()
            )
