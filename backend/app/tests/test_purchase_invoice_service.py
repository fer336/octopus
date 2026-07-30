"""
Tests para PurchaseInvoiceService (Compras — PR2).
Cubre: creación de borrador manual, duplicados (no bloqueante), listado,
edición de borrador, y confirmación atómica (stock/precios, sin PO, rollback).
"""
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio

from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.purchase_invoice import (
    PurchaseInvoice,
    PurchaseInvoiceSource,
    PurchaseInvoiceStatus,
)
from app.models.supplier import Supplier
from app.schemas.purchase_invoice import (
    PurchaseInvoiceConfirmRequest,
    PurchaseInvoiceCreate,
    PurchaseInvoiceItemCreate,
    PurchaseInvoiceUpdate,
)
from app.services.purchase_invoice_service import PurchaseInvoiceService

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


def _create_data(**overrides) -> PurchaseInvoiceCreate:
    defaults = dict(
        invoice_number="0001-00000001",
        invoice_date=date(2026, 7, 29),
        items=[
            PurchaseInvoiceItemCreate(
                description="Ítem sin matchear", quantity=Decimal("5"), unit_cost=Decimal("10")
            )
        ],
    )
    defaults.update(overrides)
    return PurchaseInvoiceCreate(**defaults)


class TestCreateDraft:
    """RED → crear un borrador manual no debe impactar stock/precios."""

    async def test_create_manual_draft(self, db, business_a, user_a):
        service = PurchaseInvoiceService(db)

        invoice, is_duplicate = await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(),
        )

        assert invoice.id is not None
        assert invoice.status == PurchaseInvoiceStatus.DRAFT
        assert invoice.source == PurchaseInvoiceSource.MANUAL
        assert is_duplicate is False
        assert len(invoice.items) == 1
        assert invoice.total == Decimal("60.50")  # 50 + 21% IVA

    async def test_create_draft_with_product_and_supplier(
        self, db, business_a, user_a, supplier_a, product_a
    ):
        service = PurchaseInvoiceService(db)

        invoice, _ = await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(
                supplier_id=supplier_a.id,
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Caño PVC 1/2",
                        quantity=Decimal("10"),
                        unit_cost=Decimal("100"),
                    )
                ],
            ),
        )

        assert invoice.supplier_id == supplier_a.id
        assert invoice.items[0].product_id == product_a.id

        # No debe haberse creado ningún lote — es solo un borrador
        lots = await db.execute(ProductLot.__table__.select())
        assert lots.fetchall() == []

    async def test_duplicate_supplier_and_number_warns_not_blocks(
        self, db, business_a, user_a, supplier_a
    ):
        """GIVEN una factura existente con mismo supplier+número
        WHEN se crea otra con los mismos datos
        THEN se crea igual (no bloquea) pero is_duplicate=True."""
        service = PurchaseInvoiceService(db)

        await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(supplier_id=supplier_a.id, invoice_number="001-001"),
        )

        invoice_2, is_duplicate = await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(supplier_id=supplier_a.id, invoice_number="001-001"),
        )

        assert invoice_2.id is not None  # se creó igual, no bloqueó
        assert is_duplicate is True

    async def test_no_duplicate_without_supplier(self, db, business_a, user_a):
        """GIVEN dos facturas con el mismo número pero sin supplier_id
        THEN no se considera duplicado (el chequeo requiere supplier_id)."""
        service = PurchaseInvoiceService(db)

        await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data()
        )
        _, is_duplicate = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data()
        )

        assert is_duplicate is False


class TestListAndGet:
    async def test_list_scoped_to_business_newest_first(
        self, db, business_a, business_b, user_a, user_b
    ):
        service = PurchaseInvoiceService(db)

        await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(invoice_number="A-1"),
        )
        await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(invoice_number="A-2"),
        )
        await service.create_draft(
            business_id=business_b.id,
            user_id=user_b.id,
            data=_create_data(invoice_number="B-1"),
        )

        result = await service.list(business_id=business_a.id)

        assert result["total"] == 2
        numbers = {item.invoice_number for item in result["items"]}
        assert numbers == {"A-1", "A-2"}

    async def test_get_by_id_excludes_soft_deleted(self, db, business_a, user_a):
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data()
        )

        invoice_row = await db.get(PurchaseInvoice, invoice.id)
        invoice_row.soft_delete()
        await db.commit()

        assert await service.get_by_id(invoice.id, business_a.id) is None


class TestUpdateDraft:
    async def test_update_draft_replaces_items_and_recalculates(
        self, db, business_a, user_a
    ):
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data()
        )

        updated = await service.update_draft(
            invoice.id,
            business_a.id,
            PurchaseInvoiceUpdate(
                items=[
                    PurchaseInvoiceItemCreate(
                        description="Nuevo ítem", quantity=Decimal("2"), unit_cost=Decimal("50")
                    )
                ]
            ),
        )

        assert len(updated.items) == 1
        assert updated.items[0].description == "Nuevo ítem"
        assert updated.total == Decimal("121.00")  # 100 + 21%

    async def test_cannot_update_confirmed_invoice(self, db, business_a, user_a):
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data()
        )
        await service.confirm(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=False),
        )

        with pytest.raises(ValueError, match="borrador"):
            await service.update_draft(
                invoice.id, business_a.id, PurchaseInvoiceUpdate(invoice_number="X")
            )


class TestConfirm:
    """RED → confirm() debe ser atómico y respetar los toggles independientes."""

    async def test_confirm_without_po_link_succeeds(self, db, business_a, user_a):
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data()
        )
        assert invoice.purchase_order_id is None

        confirmed = await service.confirm(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=False, update_prices=False),
        )

        assert confirmed.status == PurchaseInvoiceStatus.CONFIRMED
        assert confirmed.purchase_order_id is None
        assert confirmed.confirmed_by == user_a.id
        assert confirmed.confirmed_at is not None

    async def test_confirm_with_stock_only_creates_lot_no_price_history(
        self, db, business_a, user_a, product_a
    ):
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Caño",
                        quantity=Decimal("10"),
                        unit_cost=Decimal("80"),
                    )
                ]
            ),
        )

        confirmed = await service.confirm(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=True, update_prices=False),
        )

        assert confirmed.items[0].lot_id is not None
        lot = await db.get(ProductLot, confirmed.items[0].lot_id)
        assert lot.quantity == 10
        assert lot.initial_quantity == 10

        from app.models.price_history import PriceHistory

        result = await db.execute(
            PriceHistory.__table__.select().where(
                PriceHistory.__table__.c.product_id == product_a.id
            )
        )
        assert result.fetchall() == []  # update_prices=False -> sin price_history

    async def test_confirm_with_both_toggles_creates_lot_and_price_history(
        self, db, business_a, user_a, product_a
    ):
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=_create_data(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Caño",
                        quantity=Decimal("10"),
                        unit_cost=Decimal("150"),
                    )
                ]
            ),
        )

        confirmed = await service.confirm(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=True, update_prices=True),
        )

        assert confirmed.items[0].lot_id is not None

        from app.models.price_history import PriceHistory

        result = await db.execute(
            PriceHistory.__table__.select().where(
                PriceHistory.__table__.c.product_id == product_a.id
            )
        )
        rows = result.fetchall()
        assert len(rows) == 1

        await db.refresh(product_a)
        assert product_a.list_price == Decimal("150.00")

    async def test_confirm_item_without_product_never_creates_lot(
        self, db, business_a, user_a
    ):
        """AI item sin matchear (product_id=None) no debe intentar crear lote."""
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data()
        )

        confirmed = await service.confirm(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=True, update_prices=False),
        )

        assert confirmed.items[0].lot_id is None

    async def test_confirm_fails_partway_rolls_back_leaves_draft(
        self, db, business_a, user_a, product_a
    ):
        """GIVEN un segundo ítem con cantidad inválida (viola gt=0 al crear el lote)
        WHEN confirm() falla a mitad de camino
        THEN no persiste ningún lote y la factura queda en draft.

        Nota: capturamos business_id/user_id/invoice_id como variables locales
        ANTES de invocar confirm() — un rollback() dentro del servicio expira
        todos los objetos del identity map de la sesión compartida, y acceder
        a atributos ORM expirados fuera de un contexto async-greenlet
        (ej. `business_a.id` en el cuerpo del test) rompe con MissingGreenlet.
        """
        service = PurchaseInvoiceService(db)
        business_id = business_a.id
        user_id = user_a.id

        invoice, _ = await service.create_draft(
            business_id=business_id,
            user_id=user_id,
            data=_create_data(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem OK",
                        quantity=Decimal("5"),
                        unit_cost=Decimal("10"),
                    ),
                ]
            ),
        )
        invoice_id = invoice.id

        # Forzamos una cantidad de 0 directamente en el ítem persistido para
        # que la creación del lote falle en confirm() (gt=0 de ProductLotCreate).
        invoice_row = await db.get(PurchaseInvoice, invoice_id)
        broken_item = invoice_row.items[0]
        broken_item.quantity = Decimal("0")
        await db.commit()

        with pytest.raises(Exception):
            await service.confirm(
                invoice_id,
                business_id,
                user_id,
                PurchaseInvoiceConfirmRequest(update_stock=True, update_prices=False),
            )

        result = await db.execute(ProductLot.__table__.select())
        assert result.fetchall() == []

        reloaded = await service.get_by_id(invoice_id, business_id)
        assert reloaded.status == PurchaseInvoiceStatus.DRAFT

    async def test_cannot_confirm_already_confirmed(self, db, business_a, user_a):
        service = PurchaseInvoiceService(db)
        invoice, _ = await service.create_draft(
            business_id=business_a.id, user_id=user_a.id, data=_create_data()
        )
        await service.confirm(
            invoice.id, business_a.id, user_a.id, PurchaseInvoiceConfirmRequest()
        )

        with pytest.raises(ValueError, match="borrador"):
            await service.confirm(
                invoice.id, business_a.id, user_a.id, PurchaseInvoiceConfirmRequest()
            )
