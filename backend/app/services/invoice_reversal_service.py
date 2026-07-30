"""
Servicio de Reversión de Facturas de Compra (Compras — edición post-confirmación).

Aislado de `PurchaseInvoiceService` por su mayor riesgo (ver design.md):
editar una factura YA CONFIRMADA requiere revertir/recalcular los lotes y el
historial de precios que generó, y NUNCA debe recalcular en silencio si algún
lote ya fue consumido (parcial o totalmente) por una venta posterior.

Reglas (spec — "Post-Confirmation Edit with Reversal"):
  - Lote sin consumo (ProductLot.quantity == initial_quantity): se elimina y
    se recrea con los nuevos valores. Sin advertencia.
  - Lote con consumo (quantity != initial_quantity), parcial o total: se
    lanza `InvoiceReversalConflictError` con el detalle, A MENOS que el
    llamador pase `force_adjustment=True`. En ese caso se aplica un ajuste
    COMPENSATORIO sobre el MISMO lote (nunca se elimina/recrea) para no
    perder la trazabilidad de lo ya consumido (LotConsumption apunta a ese
    lot_id).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit_log import AuditLog
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.purchase_invoice import (
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseInvoiceStatus,
)
from app.schemas.product_lot import ProductLotCreate
from app.schemas.purchase_invoice import (
    PurchaseInvoiceItemCreate,
    PurchaseInvoiceReversalRequest,
)
from app.services.product_lot_service import ProductLotService


@dataclass
class ReversalConflictDetail:
    """Detalle de un lote consumido detectado durante una edición post-confirmación."""

    lot_id: UUID
    product_id: UUID | None
    initial_quantity: int
    remaining_quantity: int

    @property
    def consumed_quantity(self) -> int:
        return self.initial_quantity - self.remaining_quantity


class InvoiceReversalConflictError(Exception):
    """
    Se lanza cuando una edición post-confirmación afecta lotes ya consumidos
    (parcial o totalmente) y el llamador no confirmó `force_adjustment=True`.

    El router (PR3) debe mapear esta excepción a un 409 con `conflicts` en el
    body, para que el frontend muestre el detalle de consumo y pida
    confirmación explícita antes de reintentar con `force_adjustment=True`.
    """

    def __init__(self, conflicts: list[ReversalConflictDetail]):
        self.conflicts = conflicts
        super().__init__(
            f"{len(conflicts)} lote(s) de esta factura ya fueron consumidos "
            "(parcial o totalmente). Confirmá el ajuste compensatorio "
            "(force_adjustment=true) para continuar."
        )


class InvoiceReversalService:
    """Servicio para editar facturas de compra ya confirmadas."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _round_money(value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    async def _get_confirmed_invoice(
        self, invoice_id: UUID, business_id: UUID
    ) -> PurchaseInvoice:
        result = await self.db.execute(
            select(PurchaseInvoice)
            .options(selectinload(PurchaseInvoice.items))
            .where(
                PurchaseInvoice.id == invoice_id,
                PurchaseInvoice.business_id == business_id,
                PurchaseInvoice.deleted_at.is_(None),
            )
        )
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise ValueError("Factura de compra no encontrada")
        if invoice.status != PurchaseInvoiceStatus.CONFIRMED:
            raise ValueError(
                "Solo se pueden editar facturas confirmadas con este flujo "
                "(las facturas en borrador se editan con "
                "PurchaseInvoiceService.update_draft)"
            )
        return invoice

    async def check_consumption(
        self, invoice: PurchaseInvoice
    ) -> list[ReversalConflictDetail]:
        """Detecta lotes de esta factura ya consumidos (quantity != initial_quantity)."""
        conflicts: list[ReversalConflictDetail] = []
        for item in invoice.items:
            if not item.lot_id:
                continue
            lot = await self.db.get(ProductLot, item.lot_id)
            if not lot:
                continue
            if lot.quantity != lot.initial_quantity:
                conflicts.append(
                    ReversalConflictDetail(
                        lot_id=lot.id,
                        product_id=lot.product_id,
                        initial_quantity=lot.initial_quantity,
                        remaining_quantity=lot.quantity,
                    )
                )
        return conflicts

    async def edit_confirmed(
        self,
        invoice_id: UUID,
        business_id: UUID,
        user_id: UUID,
        data: PurchaseInvoiceReversalRequest,
    ) -> PurchaseInvoice:
        """
        Edita una factura ya confirmada, revirtiendo/recalculando lotes y
        precios en una única transacción atómica. Ítems se emparejan por
        posición con los existentes (misma convención de "reemplazo total"
        que el resto del dominio); ítems sin par nuevo se eliminan (y su
        lote se revierte/ajusta según corresponda), ítems nuevos sin par
        viejo se crean.
        """
        invoice = await self._get_confirmed_invoice(invoice_id, business_id)

        conflicts = await self.check_consumption(invoice)
        if conflicts and not data.force_adjustment:
            raise InvoiceReversalConflictError(conflicts)

        try:
            await self._apply_edit(invoice, business_id, user_id, data, conflicts)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        return await self._reload(invoice_id, business_id)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def _apply_edit(
        self,
        invoice: PurchaseInvoice,
        business_id: UUID,
        user_id: UUID,
        data: PurchaseInvoiceReversalRequest,
        conflicts: list[ReversalConflictDetail],
    ) -> None:
        old_items = list(invoice.items)
        new_items_data = (
            data.items
            if data.items is not None
            else [
                PurchaseInvoiceItemCreate(
                    product_id=old.product_id,
                    description=old.description,
                    quantity=Decimal(str(old.quantity)),
                    unit_cost=Decimal(str(old.unit_cost)),
                    iva_rate=Decimal(str(old.iva_rate)),
                    expiration_date=old.expiration_date,
                )
                for old in old_items
            ]
        )

        lot_service = ProductLotService(self.db)
        conflict_lot_ids = {c.lot_id for c in conflicts}

        max_len = max(len(old_items), len(new_items_data))
        for i in range(max_len):
            old_item = old_items[i] if i < len(old_items) else None
            new_data = new_items_data[i] if i < len(new_items_data) else None

            old_lot = None
            if old_item is not None and old_item.lot_id:
                old_lot = await self.db.get(ProductLot, old_item.lot_id)

            if new_data is None:
                await self._remove_item(old_item, old_lot, conflict_lot_ids)
                continue

            if old_item is None:
                await self._add_item(invoice, new_data, business_id, user_id, lot_service)
                continue

            await self._update_item(
                old_item, old_lot, new_data, conflict_lot_ids, invoice, business_id, user_id, lot_service
            )

        await self.db.flush()
        await self._recalculate_totals(invoice)

        if data.supplier_id is not None:
            invoice.supplier_id = data.supplier_id
        if data.purchase_order_id is not None:
            invoice.purchase_order_id = data.purchase_order_id
        if data.invoice_number is not None:
            invoice.invoice_number = data.invoice_number
        if data.invoice_date is not None:
            invoice.invoice_date = data.invoice_date

        if invoice.update_prices:
            await self._reapply_price_updates(invoice, user_id)

        self.db.add(
            AuditLog(
                user_id=user_id,
                business_id=business_id,
                action="update",
                resource_type="purchase_invoice",
                resource_id=invoice.id,
                details={
                    "invoice_number": invoice.invoice_number,
                    "had_consumption_conflicts": bool(conflicts),
                    "force_adjustment": data.force_adjustment,
                    "conflicts_count": len(conflicts),
                },
            )
        )

    async def _remove_item(
        self,
        old_item: PurchaseInvoiceItem,
        old_lot: ProductLot | None,
        conflict_lot_ids: set[UUID],
    ) -> None:
        """Ítem removido en la edición (menos ítems que antes)."""
        if old_lot is not None:
            if old_lot.id in conflict_lot_ids:
                # Ajuste compensatorio: no se puede eliminar (hay consumo), se lleva a 0.
                old_lot.quantity = max(0, old_lot.quantity - old_lot.initial_quantity)
                old_lot.initial_quantity = 0
            else:
                await self.db.delete(old_lot)
        await self.db.delete(old_item)

    async def _add_item(
        self,
        invoice: PurchaseInvoice,
        new_data: PurchaseInvoiceItemCreate,
        business_id: UUID,
        user_id: UUID,
        lot_service: ProductLotService,
    ) -> None:
        """Ítem nuevo agregado en la edición (más ítems que antes)."""
        new_item = PurchaseInvoiceItem(
            purchase_invoice_id=invoice.id,
            product_id=new_data.product_id,
            description=new_data.description,
            quantity=new_data.quantity,
            unit_cost=new_data.unit_cost,
            iva_rate=new_data.iva_rate,
            expiration_date=new_data.expiration_date,
        )
        new_item.recalculate()
        self.db.add(new_item)
        await self.db.flush()

        if invoice.update_stock and new_data.product_id:
            lot = await lot_service.create_uncommitted(
                product_id=new_data.product_id,
                business_id=business_id,
                data=ProductLotCreate(
                    quantity=int(new_data.quantity),
                    initial_quantity=int(new_data.quantity),
                    expiration_date=new_data.expiration_date,
                    cost_price=new_data.unit_cost,
                    code=f"FC-{invoice.invoice_number}",
                ),
                user_id=user_id,
            )
            new_item.lot_id = lot.id

    async def _update_item(
        self,
        old_item: PurchaseInvoiceItem,
        old_lot: ProductLot | None,
        new_data: PurchaseInvoiceItemCreate,
        conflict_lot_ids: set[UUID],
        invoice: PurchaseInvoice,
        business_id: UUID,
        user_id: UUID,
        lot_service: ProductLotService,
    ) -> None:
        """Ítem presente en ambos lados: actualiza campos y revierte/ajusta el lote."""
        old_item.product_id = new_data.product_id
        old_item.description = new_data.description
        old_item.quantity = new_data.quantity
        old_item.unit_cost = new_data.unit_cost
        old_item.iva_rate = new_data.iva_rate
        old_item.expiration_date = new_data.expiration_date
        old_item.recalculate()

        if old_lot is not None and old_lot.id in conflict_lot_ids:
            # Ajuste compensatorio sobre el MISMO lote (preserva trazabilidad de consumo)
            delta = int(new_data.quantity) - old_lot.initial_quantity
            old_lot.quantity = max(0, old_lot.quantity + delta)
            old_lot.initial_quantity = int(new_data.quantity)
            old_lot.cost_price = new_data.unit_cost
            old_lot.expiration_date = new_data.expiration_date
            return

        if old_lot is not None:
            # Sin consumo: eliminar y recrear limpiamente
            await self.db.delete(old_lot)
            await self.db.flush()
            old_item.lot_id = None

        if invoice.update_stock and new_data.product_id:
            lot = await lot_service.create_uncommitted(
                product_id=new_data.product_id,
                business_id=business_id,
                data=ProductLotCreate(
                    quantity=int(new_data.quantity),
                    initial_quantity=int(new_data.quantity),
                    expiration_date=new_data.expiration_date,
                    cost_price=new_data.unit_cost,
                    code=f"FC-{invoice.invoice_number}",
                ),
                user_id=user_id,
            )
            old_item.lot_id = lot.id
        elif old_lot is not None:
            old_item.lot_id = None

    async def _recalculate_totals(self, invoice: PurchaseInvoice) -> None:
        """Recalcula subtotal/iva_amount/total desde los ítems vigentes en DB."""
        result = await self.db.execute(
            select(PurchaseInvoiceItem).where(
                PurchaseInvoiceItem.purchase_invoice_id == invoice.id
            )
        )
        items = list(result.scalars().all())

        subtotal = self._round_money(
            sum((Decimal(str(i.subtotal)) for i in items), Decimal("0"))
        )
        iva_amount = self._round_money(
            sum((Decimal(str(i.iva_amount)) for i in items), Decimal("0"))
        )
        total = self._round_money(
            sum((Decimal(str(i.total)) for i in items), Decimal("0"))
        )

        invoice.subtotal = subtotal
        invoice.iva_amount = iva_amount
        invoice.total = total

    async def _reapply_price_updates(
        self, invoice: PurchaseInvoice, user_id: UUID
    ) -> None:
        """
        Revierte y reaplica el impacto de precios para cada ítem con producto
        matcheado: agrega una NUEVA fila de PriceHistory (old_* = precios
        actuales, new_* = valores tras la edición) — nunca muta/elimina
        historial previo (PriceHistory es append-only en todo el codebase).
        """
        result = await self.db.execute(
            select(PurchaseInvoiceItem).where(
                PurchaseInvoiceItem.purchase_invoice_id == invoice.id
            )
        )
        items = list(result.scalars().all())

        for item in items:
            if not item.product_id:
                continue
            product = await self.db.get(Product, item.product_id)
            if not product:
                continue

            old_list_price = product.list_price
            old_net_price = product.net_price
            old_sale_price = product.sale_price

            product.list_price = item.unit_cost
            product.cost_price = item.unit_cost
            product.calculate_prices()

            self.db.add(
                PriceHistory(
                    product_id=product.id,
                    changed_by=user_id,
                    old_list_price=old_list_price,
                    old_net_price=old_net_price,
                    old_sale_price=old_sale_price,
                    new_list_price=product.list_price,
                    new_net_price=product.net_price,
                    new_sale_price=product.sale_price,
                    change_reason="Compras: edición de factura",
                )
            )

    async def _reload(self, invoice_id: UUID, business_id: UUID) -> PurchaseInvoice:
        result = await self.db.execute(
            select(PurchaseInvoice)
            .options(
                selectinload(PurchaseInvoice.items).selectinload(
                    PurchaseInvoiceItem.product
                ),
                selectinload(PurchaseInvoice.supplier),
            )
            .where(
                PurchaseInvoice.id == invoice_id,
                PurchaseInvoice.business_id == business_id,
            )
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()
