"""
Tests para InvoiceReversalService (Compras — PR2).

Servicio de mayor riesgo del cambio (ver design.md): edita facturas de compra
YA CONFIRMADAS. Debe distinguir explícitamente entre:
  - Lotes sin consumo (quantity == initial_quantity): revierte y recalcula
    limpiamente (elimina y recrea el lote), sin advertencia.
  - Lotes con consumo, parcial o total (quantity != initial_quantity): NUNCA
    recalcula en silencio. Requiere `force_adjustment=True` explícito; si no
    se provee, lanza `InvoiceReversalConflictError` con el detalle de consumo.
    Con `force_adjustment=True`, aplica un ajuste COMPENSATORIO sobre el
    MISMO lote (nunca lo elimina/recrea) para preservar la trazabilidad.

Cobertura exigida por el apply batch: consumo total, consumo parcial, cero
consumo, y edición que no toca stock (price-only / update_stock=False).
"""
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio

from app.models.audit_log import AuditLog
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.purchase_invoice import PurchaseInvoiceStatus
from app.schemas.purchase_invoice import (
    PurchaseInvoiceConfirmRequest,
    PurchaseInvoiceCreate,
    PurchaseInvoiceItemCreate,
    PurchaseInvoiceReversalRequest,
)
from app.services.invoice_reversal_service import (
    InvoiceReversalConflictError,
    InvoiceReversalService,
)
from app.services.purchase_invoice_service import PurchaseInvoiceService

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def product_a(db, business_a):
    product = Product(
        business_id=business_a.id,
        code="REV-001",
        description="Producto para test de reversión",
        list_price=Decimal("100.00"),
        iva_rate=Decimal("21.00"),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


@pytest_asyncio.fixture
async def product_with_discounts(db, business_a):
    """Producto con descuentos de proveedor — para validar que cost_price
    (usado por profitability_service) sea el costo NETO, no el unit_cost
    bruto de la factura."""
    product = Product(
        business_id=business_a.id,
        code="REV-DESC-001",
        description="Producto con descuentos para test de reversión",
        list_price=Decimal("100.00"),
        discount_1=Decimal("10"),
        discount_2=Decimal("5"),
        discount_3=Decimal("0"),
        iva_rate=Decimal("21.00"),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


async def _confirmed_invoice_with_lot(
    db, business_a, user_a, product_a, quantity=Decimal("10"), update_prices=False
):
    """Helper: crea y confirma una factura con un ítem/lote, retorna (invoice, lot)."""
    invoice_service = PurchaseInvoiceService(db)
    invoice, _ = await invoice_service.create_draft(
        business_id=business_a.id,
        user_id=user_a.id,
        data=PurchaseInvoiceCreate(
            invoice_number="0001-00000001",
            invoice_date=date(2026, 7, 29),
            items=[
                PurchaseInvoiceItemCreate(
                    product_id=product_a.id,
                    description="Ítem con stock",
                    quantity=quantity,
                    unit_cost=Decimal("50"),
                )
            ],
        ),
    )
    confirmed = await invoice_service.confirm(
        invoice.id,
        business_a.id,
        user_a.id,
        PurchaseInvoiceConfirmRequest(update_stock=True, update_prices=update_prices),
    )
    lot = await db.get(ProductLot, confirmed.items[0].lot_id)
    return confirmed, lot


class TestCheckConsumption:
    """RED → detección de consumo compara quantity vs initial_quantity."""

    async def test_no_consumption_returns_no_conflicts(
        self, db, business_a, user_a, product_a
    ):
        invoice, lot = await _confirmed_invoice_with_lot(db, business_a, user_a, product_a)
        assert lot.quantity == lot.initial_quantity

        service = InvoiceReversalService(db)
        conflicts = await service.check_consumption(invoice)

        assert conflicts == []

    async def test_partial_consumption_detected(self, db, business_a, user_a, product_a):
        invoice, lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )
        lot.quantity = 4  # 6 unidades consumidas
        await db.commit()

        service = InvoiceReversalService(db)
        conflicts = await service.check_consumption(invoice)

        assert len(conflicts) == 1
        assert conflicts[0].lot_id == lot.id
        assert conflicts[0].consumed_quantity == 6

    async def test_full_consumption_detected(self, db, business_a, user_a, product_a):
        invoice, lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )
        lot.quantity = 0  # consumo total
        await db.commit()

        service = InvoiceReversalService(db)
        conflicts = await service.check_consumption(invoice)

        assert len(conflicts) == 1
        assert conflicts[0].consumed_quantity == 10


class TestEditWithNoConsumption:
    """RED → sin consumo: revierte y recalcula limpiamente, sin advertencia."""

    async def test_edit_quantity_deletes_and_recreates_lot(
        self, db, business_a, user_a, product_a
    ):
        invoice, old_lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )
        old_lot_id = old_lot.id

        service = InvoiceReversalService(db)
        updated = await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem con stock",
                        quantity=Decimal("15"),
                        unit_cost=Decimal("50"),
                    )
                ]
            ),
        )

        assert updated.items[0].quantity == Decimal("15")
        new_lot_id = updated.items[0].lot_id
        assert new_lot_id != old_lot_id

        # El lote viejo fue eliminado, no ajustado
        assert await db.get(ProductLot, old_lot_id) is None

        new_lot = await db.get(ProductLot, new_lot_id)
        assert new_lot.quantity == 15
        assert new_lot.initial_quantity == 15

    async def test_edit_quantity_recreates_lot_with_net_cost_price(
        self, db, business_a, user_a, product_with_discounts
    ):
        """RED — cost_price del lote recreado debe ser el costo NETO
        (post-descuentos del producto), no el unit_cost bruto del ítem editado."""
        invoice, _old_lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_with_discounts, quantity=Decimal("10")
        )

        service = InvoiceReversalService(db)
        updated = await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_with_discounts.id,
                        description="Ítem con stock",
                        quantity=Decimal("15"),
                        unit_cost=Decimal("200"),
                    )
                ]
            ),
        )

        new_lot = await db.get(ProductLot, updated.items[0].lot_id)
        # 200 * (1 - 10/100) * (1 - 5/100) = 171.00
        assert new_lot.cost_price == Decimal("171.00")

    async def test_edit_adds_new_item_lot_with_net_cost_price(
        self, db, business_a, user_a, product_with_discounts
    ):
        """RED — al agregar un ítem nuevo en la edición (más ítems que antes),
        el lote creado también debe usar el costo NETO."""
        invoice, _old_lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_with_discounts, quantity=Decimal("10")
        )

        service = InvoiceReversalService(db)
        updated = await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_with_discounts.id,
                        description="Ítem con stock",
                        quantity=Decimal("10"),
                        unit_cost=Decimal("50"),
                    ),
                    PurchaseInvoiceItemCreate(
                        product_id=product_with_discounts.id,
                        description="Ítem nuevo agregado en la edición",
                        quantity=Decimal("3"),
                        unit_cost=Decimal("200"),
                    ),
                ]
            ),
        )

        assert len(updated.items) == 2
        new_item = updated.items[1]
        new_lot = await db.get(ProductLot, new_item.lot_id)
        # 200 * (1 - 10/100) * (1 - 5/100) = 171.00
        assert new_lot.cost_price == Decimal("171.00")

    async def test_edit_recalculates_invoice_totals(self, db, business_a, user_a, product_a):
        invoice, _ = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )

        service = InvoiceReversalService(db)
        updated = await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem con stock",
                        quantity=Decimal("2"),
                        unit_cost=Decimal("50"),
                    )
                ]
            ),
        )

        assert updated.total == Decimal("121.00")  # 100 + 21%

    async def test_edit_writes_audit_log_even_without_conflicts(
        self, db, business_a, user_a, product_a
    ):
        invoice, _ = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )

        service = InvoiceReversalService(db)
        await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem con stock",
                        quantity=Decimal("3"),
                        unit_cost=Decimal("50"),
                    )
                ]
            ),
        )

        result = await db.execute(
            AuditLog.__table__.select().where(
                AuditLog.__table__.c.resource_type == "purchase_invoice",
                AuditLog.__table__.c.resource_id == invoice.id,
            )
        )
        rows = result.fetchall()
        assert len(rows) == 1
        assert rows[0].action == "update"
        assert rows[0].user_id == user_a.id


class TestEditWithConsumption:
    """RED → con consumo: bloquea sin force_adjustment, ajuste compensatorio con force_adjustment."""

    async def test_full_consumption_raises_without_force(
        self, db, business_a, user_a, product_a
    ):
        invoice, lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )
        lot.quantity = 0
        await db.commit()

        service = InvoiceReversalService(db)
        with pytest.raises(InvoiceReversalConflictError) as exc_info:
            await service.edit_confirmed(
                invoice.id,
                business_a.id,
                user_a.id,
                PurchaseInvoiceReversalRequest(
                    items=[
                        PurchaseInvoiceItemCreate(
                            product_id=product_a.id,
                            description="Ítem con stock",
                            quantity=Decimal("15"),
                            unit_cost=Decimal("50"),
                        )
                    ]
                ),
            )

        assert len(exc_info.value.conflicts) == 1
        assert exc_info.value.conflicts[0].consumed_quantity == 10

        # No debe haber modificado nada: la factura sigue confirmada, sin cambios
        service_invoices = PurchaseInvoiceService(db)
        reloaded = await service_invoices.get_by_id(invoice.id, business_a.id)
        assert reloaded.status == PurchaseInvoiceStatus.CONFIRMED
        assert reloaded.items[0].quantity == Decimal("10")

    async def test_partial_consumption_raises_without_force(
        self, db, business_a, user_a, product_a
    ):
        invoice, lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )
        lot.quantity = 4  # 6 consumidas
        await db.commit()

        service = InvoiceReversalService(db)
        with pytest.raises(InvoiceReversalConflictError) as exc_info:
            await service.edit_confirmed(
                invoice.id,
                business_a.id,
                user_a.id,
                PurchaseInvoiceReversalRequest(
                    items=[
                        PurchaseInvoiceItemCreate(
                            product_id=product_a.id,
                            description="Ítem con stock",
                            quantity=Decimal("15"),
                            unit_cost=Decimal("50"),
                        )
                    ]
                ),
            )

        assert exc_info.value.conflicts[0].consumed_quantity == 6

    async def test_partial_consumption_with_force_applies_compensating_delta(
        self, db, business_a, user_a, product_a
    ):
        """
        GIVEN un lote con initial_quantity=10, quantity=4 (6 consumidas)
        WHEN se edita a quantity=15 con force_adjustment=True
        THEN el MISMO lote se ajusta: initial_quantity=15,
             quantity = 4 (remaining) + (15-10) delta = 9
             (nunca se elimina/recrea — preserva trazabilidad de consumo)
        """
        invoice, lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )
        lot.quantity = 4
        await db.commit()
        original_lot_id = lot.id

        service = InvoiceReversalService(db)
        updated = await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem con stock",
                        quantity=Decimal("15"),
                        unit_cost=Decimal("50"),
                    )
                ],
                force_adjustment=True,
            ),
        )

        assert updated.items[0].lot_id == original_lot_id  # mismo lote, no recreado

        adjusted_lot = await db.get(ProductLot, original_lot_id)
        assert adjusted_lot.initial_quantity == 15
        assert adjusted_lot.quantity == 9

    async def test_force_adjustment_sets_net_cost_price_on_same_lot(
        self, db, business_a, user_a, product_with_discounts
    ):
        """RED — el ajuste compensatorio sobre el MISMO lote (consumo detectado
        + force_adjustment=True) también debe fijar el costo NETO, no el
        unit_cost bruto del ítem editado."""
        invoice, lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_with_discounts, quantity=Decimal("10")
        )
        lot.quantity = 4
        await db.commit()
        original_lot_id = lot.id

        service = InvoiceReversalService(db)
        updated = await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_with_discounts.id,
                        description="Ítem con stock",
                        quantity=Decimal("15"),
                        unit_cost=Decimal("200"),
                    )
                ],
                force_adjustment=True,
            ),
        )

        assert updated.items[0].lot_id == original_lot_id
        adjusted_lot = await db.get(ProductLot, original_lot_id)
        # 200 * (1 - 10/100) * (1 - 5/100) = 171.00
        assert adjusted_lot.cost_price == Decimal("171.00")

    async def test_full_consumption_with_force_applies_compensating_delta_clamped_at_zero(
        self, db, business_a, user_a, product_a
    ):
        """Consumo total (quantity=0) + reducción de cantidad: el delta compensatorio
        nunca deja quantity negativa (clamp en 0)."""
        invoice, lot = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10")
        )
        lot.quantity = 0
        await db.commit()
        original_lot_id = lot.id

        service = InvoiceReversalService(db)
        updated = await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem con stock",
                        quantity=Decimal("5"),  # reducción respecto a 10
                        unit_cost=Decimal("50"),
                    )
                ],
                force_adjustment=True,
            ),
        )

        adjusted_lot = await db.get(ProductLot, original_lot_id)
        assert adjusted_lot.initial_quantity == 5
        assert adjusted_lot.quantity == 0  # clamp: 0 + (5-10) = -5 -> 0
        assert updated.items[0].lot_id == original_lot_id


class TestEditWithoutStockImpact:
    """RED → factura confirmada con update_stock=False: la edición nunca toca lotes."""

    async def test_price_only_edit_no_stock_impact(self, db, business_a, user_a, product_a):
        invoice_service = PurchaseInvoiceService(db)
        from app.schemas.purchase_invoice import PurchaseInvoiceCreate

        invoice, _ = await invoice_service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=PurchaseInvoiceCreate(
                invoice_number="0001-00000002",
                invoice_date=date(2026, 7, 29),
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem sin impacto de stock",
                        quantity=Decimal("10"),
                        unit_cost=Decimal("50"),
                    )
                ],
            ),
        )
        confirmed = await invoice_service.confirm(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceConfirmRequest(update_stock=False, update_prices=False),
        )
        assert confirmed.items[0].lot_id is None

        service = InvoiceReversalService(db)
        conflicts = await service.check_consumption(confirmed)
        assert conflicts == []  # sin lote -> nunca hay conflicto

        updated = await service.edit_confirmed(
            confirmed.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem sin impacto de stock",
                        quantity=Decimal("10"),
                        unit_cost=Decimal("75"),  # solo cambia el costo
                    )
                ]
            ),
        )

        assert updated.items[0].unit_cost == Decimal("75.00")
        assert updated.items[0].lot_id is None

        lots = await db.execute(ProductLot.__table__.select())
        assert lots.fetchall() == []  # nunca se creó ningún lote


class TestEditWithPriceUpdates:
    async def test_edit_appends_new_price_history_row_when_update_prices_true(
        self, db, business_a, user_a, product_a
    ):
        invoice, _ = await _confirmed_invoice_with_lot(
            db, business_a, user_a, product_a, quantity=Decimal("10"), update_prices=True
        )

        service = InvoiceReversalService(db)
        await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_a.id,
                        description="Ítem con stock",
                        quantity=Decimal("10"),
                        unit_cost=Decimal("200"),
                    )
                ]
            ),
        )

        result = await db.execute(
            PriceHistory.__table__.select().where(
                PriceHistory.__table__.c.product_id == product_a.id
            )
        )
        rows = result.fetchall()
        # Una del confirm() original + una nueva de la edición
        assert len(rows) == 2
        assert rows[-1].change_reason == "Compras: edición de factura"

    async def test_edit_price_update_sets_net_cost_price_keeps_gross_list_price(
        self, db, business_a, user_a, product_with_discounts
    ):
        """RED — al re-aplicar precios durante una edición, Product.cost_price
        debe quedar en el costo NETO; Product.list_price sigue siendo el
        unit_cost bruto (comportamiento correcto y ya existente, no cambia)."""
        invoice, _lot = await _confirmed_invoice_with_lot(
            db,
            business_a,
            user_a,
            product_with_discounts,
            quantity=Decimal("10"),
            update_prices=True,
        )

        service = InvoiceReversalService(db)
        await service.edit_confirmed(
            invoice.id,
            business_a.id,
            user_a.id,
            PurchaseInvoiceReversalRequest(
                items=[
                    PurchaseInvoiceItemCreate(
                        product_id=product_with_discounts.id,
                        description="Ítem con stock",
                        quantity=Decimal("10"),
                        unit_cost=Decimal("200"),
                    )
                ]
            ),
        )

        await db.refresh(product_with_discounts)
        assert product_with_discounts.list_price == Decimal("200.00")
        assert product_with_discounts.cost_price == Decimal("171.00")


class TestEditGuards:
    async def test_cannot_edit_draft_invoice_with_reversal_service(
        self, db, business_a, user_a, product_a
    ):
        invoice_service = PurchaseInvoiceService(db)
        from app.schemas.purchase_invoice import PurchaseInvoiceCreate

        invoice, _ = await invoice_service.create_draft(
            business_id=business_a.id,
            user_id=user_a.id,
            data=PurchaseInvoiceCreate(
                invoice_number="0001-00000003",
                invoice_date=date(2026, 7, 29),
                items=[
                    PurchaseInvoiceItemCreate(
                        description="Ítem", quantity=Decimal("1"), unit_cost=Decimal("10")
                    )
                ],
            ),
        )

        service = InvoiceReversalService(db)
        with pytest.raises(ValueError, match="confirmadas"):
            await service.edit_confirmed(
                invoice.id,
                business_a.id,
                user_a.id,
                PurchaseInvoiceReversalRequest(),
            )
