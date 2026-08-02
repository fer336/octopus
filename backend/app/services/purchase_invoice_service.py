"""
Servicio de Facturas de Compra (Compras — carga manual e IA).

Maneja el ciclo de vida de una factura de compra: creación de borrador,
listado/historial, edición previa a confirmación y confirmación atómica
(creación de lotes vía `ProductLotService.create_uncommitted` y actualización
de precios vía `PriceHistory`, ambos dentro de una única transacción).

La edición de una factura YA CONFIRMADA vive en `InvoiceReversalService`
(servicio aislado por su mayor riesgo — ver design.md).
"""
from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit_log import AuditLog
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.purchase_invoice import (
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseInvoiceSource,
    PurchaseInvoiceStatus,
)
from app.models.purchase_receipt import (
    PurchaseReceipt,
    PurchaseReceiptItem,
    PurchaseReceiptStatus,
)
from app.schemas.product_lot import ProductLotCreate
from app.schemas.purchase_invoice import (
    PurchaseInvoiceConfirmRequest,
    PurchaseInvoiceCreate,
    PurchaseInvoiceItemCreate,
    PurchaseInvoiceUpdate,
)
from app.services.product_lot_service import ProductLotService


class PurchaseInvoiceService:
    """Servicio para gestión de facturas de compra (borrador, listado, confirmación)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Helpers internos
    # ------------------------------------------------------------------

    @staticmethod
    def _round_money(value: Decimal) -> Decimal:
        """Redondea montos monetarios a 2 decimales (ROUND_HALF_UP, convención
        del proyecto — ver `VoucherService._round_money`)."""
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @staticmethod
    def _net_cost(product: Product | None, gross_unit_cost: Decimal) -> Decimal:
        """Costo neto real pagado (post-descuentos del producto).

        `PurchaseInvoiceItem.unit_cost` es el precio de lista BRUTO del
        proveedor (antes de bonificaciones) — correcto tal cual para
        `Product.list_price` (ver `Product.calculate_prices`). Pero
        `Product.cost_price` / `ProductLot.cost_price` se usan en
        `profitability_service` como el costo NETO efectivamente pagado, así
        que hay que aplicarles la misma cadena de descuentos que
        `calculate_prices()` (solo discount_1/2/3, sin extra_cost/
        profit_margin/IVA).
        """
        if product is None:
            return gross_unit_cost.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        d1 = Decimal(str(product.discount_1 or 0))
        d2 = Decimal(str(product.discount_2 or 0))
        d3 = Decimal(str(product.discount_3 or 0))
        net = gross_unit_cost * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
        return net.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def _build_items(
        self, items_data: list[PurchaseInvoiceItemCreate]
    ) -> tuple[list[PurchaseInvoiceItem], Decimal, Decimal, Decimal]:
        """Construye los PurchaseInvoiceItem (sin persistir) y calcula totales."""
        items_db: list[PurchaseInvoiceItem] = []
        total_subtotal = Decimal("0")
        total_iva = Decimal("0")
        total = Decimal("0")

        for item_data in items_data:
            item = PurchaseInvoiceItem(
                product_id=item_data.product_id,
                description=item_data.description,
                quantity=item_data.quantity,
                unit_cost=item_data.unit_cost,
                iva_rate=item_data.iva_rate,
                expiration_date=item_data.expiration_date,
            )
            item.recalculate()
            items_db.append(item)
            total_subtotal += Decimal(str(item.subtotal))
            total_iva += Decimal(str(item.iva_amount))
            total += Decimal(str(item.total))

        return (
            items_db,
            self._round_money(total_subtotal),
            self._round_money(total_iva),
            self._round_money(total),
        )

    async def _enrich(self, invoice: PurchaseInvoice) -> PurchaseInvoice:
        """Agrega nombres relacionados para la respuesta (supplier, created_by)."""
        if invoice.supplier:
            invoice.supplier_name = invoice.supplier.name
        if invoice.created_by_user:
            invoice.created_by_name = (
                invoice.created_by_user.name or invoice.created_by_user.email
            )
        for item in invoice.items:
            if item.product:
                item.product_code = item.product.code
                item.product_description = item.product.description
        return invoice

    # ------------------------------------------------------------------
    # Duplicados (no bloqueante)
    # ------------------------------------------------------------------

    async def check_duplicate(
        self,
        business_id: UUID,
        supplier_id: UUID | None,
        invoice_number: str,
        exclude_id: UUID | None = None,
    ) -> PurchaseInvoice | None:
        """
        Busca una factura existente con el mismo supplier_id + invoice_number.
        Sin supplier_id el chequeo no aplica (no hay suficiente certeza).
        Nunca bloquea — solo informa al llamador para mostrar una advertencia.
        """
        if not supplier_id:
            return None

        query = select(PurchaseInvoice).where(
            PurchaseInvoice.business_id == business_id,
            PurchaseInvoice.supplier_id == supplier_id,
            PurchaseInvoice.invoice_number == invoice_number,
            PurchaseInvoice.deleted_at.is_(None),
        )
        if exclude_id:
            query = query.where(PurchaseInvoice.id != exclude_id)

        result = await self.db.execute(query)
        return result.scalars().first()

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create_draft(
        self,
        business_id: UUID,
        user_id: UUID,
        data: PurchaseInvoiceCreate,
        source: PurchaseInvoiceSource = PurchaseInvoiceSource.MANUAL,
        source_document_key: str | None = None,
    ) -> tuple[PurchaseInvoice, bool]:
        """
        Crea una factura de compra en estado `draft` (no impacta stock/precios).
        Retorna (invoice, is_duplicate) — is_duplicate es solo informativo,
        nunca bloquea la creación.
        """
        duplicate = await self.check_duplicate(
            business_id, data.supplier_id, data.invoice_number
        )

        items_db, subtotal, iva_amount, total = self._build_items(data.items)

        invoice = PurchaseInvoice(
            business_id=business_id,
            supplier_id=data.supplier_id,
            purchase_order_id=data.purchase_order_id,
            created_by=user_id,
            status=PurchaseInvoiceStatus.DRAFT,
            source=source,
            invoice_number=data.invoice_number,
            invoice_date=data.invoice_date,
            subtotal=subtotal,
            iva_amount=iva_amount,
            total=total,
            source_document_key=source_document_key,
            is_duplicate_ack=False,
        )
        self.db.add(invoice)
        await self.db.flush()

        for item in items_db:
            item.purchase_invoice_id = invoice.id
            self.db.add(item)

        await self.db.commit()

        created = await self.get_by_id(invoice.id, business_id)
        return created, duplicate is not None

    async def get_by_id(
        self,
        invoice_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> PurchaseInvoice | None:
        """Obtiene una factura de compra con sus ítems y relaciones."""
        query = (
            select(PurchaseInvoice)
            .options(
                selectinload(PurchaseInvoice.items).selectinload(
                    PurchaseInvoiceItem.product
                ),
                selectinload(PurchaseInvoice.supplier),
                selectinload(PurchaseInvoice.created_by_user),
            )
            .where(
                PurchaseInvoice.id == invoice_id,
                PurchaseInvoice.business_id == business_id,
            )
            # populate_existing: fuerza refrescar objetos/relaciones ya en el
            # identity map (ej. tras update_draft()/confirm(), donde
            # expire_on_commit=False deja colecciones desactualizadas en memoria).
            .execution_options(populate_existing=True)
        )
        if not include_deleted:
            query = query.where(PurchaseInvoice.deleted_at.is_(None))

        result = await self.db.execute(query)
        invoice = result.scalar_one_or_none()
        if invoice:
            await self._enrich(invoice)
        return invoice

    async def list(
        self,
        business_id: UUID,
        status: PurchaseInvoiceStatus | None = None,
        source: PurchaseInvoiceSource | None = None,
        supplier_id: UUID | None = None,
        search: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """Lista/historial de facturas de compra, excluye soft-deleted, más recientes primero."""
        base_conditions = [
            PurchaseInvoice.business_id == business_id,
            PurchaseInvoice.deleted_at.is_(None),
        ]
        if status:
            base_conditions.append(PurchaseInvoice.status == status)
        if source:
            base_conditions.append(PurchaseInvoice.source == source)
        if supplier_id:
            base_conditions.append(PurchaseInvoice.supplier_id == supplier_id)
        if search:
            base_conditions.append(
                PurchaseInvoice.invoice_number.ilike(f"%{search}%")
            )

        count_result = await self.db.execute(
            select(func.count(PurchaseInvoice.id)).where(*base_conditions)
        )
        total = count_result.scalar() or 0

        offset = (page - 1) * per_page
        result = await self.db.execute(
            select(PurchaseInvoice)
            .options(
                selectinload(PurchaseInvoice.items),
                selectinload(PurchaseInvoice.supplier),
            )
            .where(*base_conditions)
            .order_by(PurchaseInvoice.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
        invoices = list(result.scalars().all())
        for invoice in invoices:
            if invoice.supplier:
                invoice.supplier_name = invoice.supplier.name
            invoice.items_count = len(invoice.items)

        return {
            "items": invoices,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": max(1, (total + per_page - 1) // per_page),
        }

    async def update_draft(
        self,
        invoice_id: UUID,
        business_id: UUID,
        data: PurchaseInvoiceUpdate,
    ) -> PurchaseInvoice | None:
        """
        Edita una factura en estado `draft` (carga manual o revisión de un
        borrador generado por IA). Si se envían `items`, reemplaza la lista
        completa (misma convención que `PurchaseOrderService.update`).
        """
        invoice = await self.get_by_id(invoice_id, business_id)
        if not invoice:
            return None
        if invoice.status != PurchaseInvoiceStatus.DRAFT:
            raise ValueError("Solo se pueden editar facturas en estado borrador")

        if data.supplier_id is not None:
            invoice.supplier_id = data.supplier_id
        if data.purchase_order_id is not None:
            invoice.purchase_order_id = data.purchase_order_id
        if data.invoice_number is not None:
            invoice.invoice_number = data.invoice_number
        if data.invoice_date is not None:
            invoice.invoice_date = data.invoice_date
        if data.is_duplicate_ack is not None:
            invoice.is_duplicate_ack = data.is_duplicate_ack

        if data.items is not None:
            for item in list(invoice.items):
                await self.db.delete(item)
            await self.db.flush()

            items_db, subtotal, iva_amount, total = self._build_items(data.items)
            for item in items_db:
                item.purchase_invoice_id = invoice.id
                self.db.add(item)

            invoice.subtotal = subtotal
            invoice.iva_amount = iva_amount
            invoice.total = total

        await self.db.commit()
        return await self.get_by_id(invoice_id, business_id)

    # ------------------------------------------------------------------
    # Confirmación (atómica)
    # ------------------------------------------------------------------

    async def confirm(
        self,
        invoice_id: UUID,
        business_id: UUID,
        user_id: UUID,
        data: PurchaseInvoiceConfirmRequest,
    ) -> PurchaseInvoice:
        """
        Confirma una factura de compra (draft → confirmed) en una única
        transacción atómica: si `update_stock` crea un `ProductLot` por ítem
        matcheado (nunca escribe stock directamente); si `update_prices`
        recalcula precios y agrega `PriceHistory` para toda la factura. Si
        cualquier paso falla, se hace rollback completo y la factura queda
        en `draft` (ningún lote ni price_history persiste).

        Si hay remitos vinculados (`data.receipt_ids` o ya pre-vinculados
        vía `PurchaseReceiptService.link_to_invoice`) y están CONFIRMADOS,
        los ítems que cubren NO generan un lote nuevo — se corrige el costo
        del lote que el remito ya creó (ver `_correct_lots_from_receipts`).
        Sin remitos vinculados, el comportamiento es idéntico al de antes.
        """
        invoice = await self.get_by_id(invoice_id, business_id)
        if not invoice:
            raise ValueError("Factura de compra no encontrada")
        if invoice.status != PurchaseInvoiceStatus.DRAFT:
            raise ValueError("Solo se pueden confirmar facturas en estado borrador")
        if not invoice.items:
            raise ValueError("La factura no tiene ítems")

        stock_warnings: list[str] = []

        try:
            linked_receipts = await self._resolve_linked_receipts(
                invoice, business_id, data.receipt_ids
            )

            covered_product_ids: set[UUID] = set()
            if linked_receipts:
                covered_product_ids, stock_warnings = await self._correct_lots_from_receipts(
                    invoice, linked_receipts, user_id
                )

            if data.update_stock:
                await self._create_lots_for_items(
                    invoice, business_id, user_id, skip_product_ids=covered_product_ids
                )

            if data.update_prices:
                await self._apply_price_updates(invoice, user_id)

            invoice.status = PurchaseInvoiceStatus.CONFIRMED
            invoice.update_stock = data.update_stock
            invoice.update_prices = data.update_prices
            invoice.confirmed_by = user_id
            invoice.confirmed_at = datetime.utcnow()

            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        result = await self.get_by_id(invoice_id, business_id)
        result.stock_warnings = stock_warnings
        return result

    async def _resolve_linked_receipts(
        self,
        invoice: PurchaseInvoice,
        business_id: UUID,
        receipt_ids: list[UUID] | None,
    ) -> list[PurchaseReceipt]:
        """
        Resuelve los remitos vinculados a esta factura: los pasados
        explícitamente por `receipt_ids` + los ya pre-vinculados
        (`receipt.purchase_invoice_id == invoice.id`). Valida proveedor
        coincidente y ausencia de vínculo a otra factura, y vincula
        (idempotente) dentro de esta misma transacción.
        """
        conditions = [PurchaseReceipt.purchase_invoice_id == invoice.id]
        if receipt_ids:
            conditions.append(PurchaseReceipt.id.in_(receipt_ids))

        result = await self.db.execute(
            select(PurchaseReceipt)
            .options(selectinload(PurchaseReceipt.items))
            .where(
                PurchaseReceipt.business_id == business_id,
                PurchaseReceipt.deleted_at.is_(None),
                or_(*conditions),
            )
        )
        receipts = list(result.scalars().all())

        if receipt_ids:
            missing = set(receipt_ids) - {r.id for r in receipts}
            if missing:
                raise ValueError(
                    "Remito(s) no encontrado(s): "
                    + ", ".join(str(m) for m in missing)
                )

        for receipt in receipts:
            if receipt.purchase_invoice_id and receipt.purchase_invoice_id != invoice.id:
                raise ValueError(
                    f"El remito {receipt.receipt_number} ya está vinculado a otra factura"
                )
            if (
                receipt.supplier_id
                and invoice.supplier_id
                and receipt.supplier_id != invoice.supplier_id
            ):
                raise ValueError(
                    f"El remito {receipt.receipt_number} pertenece a otro proveedor"
                )
            receipt.purchase_invoice_id = invoice.id

        return receipts

    async def _correct_lots_from_receipts(
        self,
        invoice: PurchaseInvoice,
        linked_receipts: list[PurchaseReceipt],
        user_id: UUID,
    ) -> tuple[set[UUID], list[str]]:
        """
        Para ítems de factura cuyo `product_id` está cubierto por un remito
        ya CONFIRMADO y vinculado, no crea lote nuevo: corrige el
        `cost_price` del lote existente (costo neto real facturado, mismo
        criterio que `_net_cost`) y registra un `AuditLog`. Retorna
        (product_ids cubiertos, warnings de mismatch de cantidad — no
        bloqueantes).
        """
        receipt_items_by_product: dict[UUID, list[PurchaseReceiptItem]] = {}
        for receipt in linked_receipts:
            if receipt.status != PurchaseReceiptStatus.CONFIRMED:
                continue
            for r_item in receipt.items:
                if r_item.lot_id is None:
                    continue
                receipt_items_by_product.setdefault(r_item.product_id, []).append(r_item)

        covered_product_ids: set[UUID] = set()
        warnings: list[str] = []

        for item in invoice.items:
            if not item.product_id or item.product_id not in receipt_items_by_product:
                continue

            r_items = receipt_items_by_product[item.product_id]
            covered_product_ids.add(item.product_id)

            product = await self.db.get(Product, item.product_id)
            net_cost = self._net_cost(product, Decimal(str(item.unit_cost)))

            receipt_qty_total = sum((Decimal(str(r.quantity)) for r in r_items), Decimal("0"))
            if receipt_qty_total != Decimal(str(item.quantity)):
                warnings.append(
                    f"Cantidad recibida ({receipt_qty_total}) no coincide con la "
                    f"cantidad facturada ({item.quantity}) para "
                    f"{product.code if product else item.product_id}"
                )

            for r_item in r_items:
                lot = await self.db.get(ProductLot, r_item.lot_id)
                if not lot:
                    continue
                old_cost_price = lot.cost_price
                lot.cost_price = net_cost

                self.db.add(
                    AuditLog(
                        user_id=user_id,
                        business_id=invoice.business_id,
                        action="update",
                        resource_type="lot_operation",
                        resource_id=lot.id,
                        details={
                            "product_id": str(item.product_id),
                            "old_cost_price": (
                                str(old_cost_price) if old_cost_price is not None else None
                            ),
                            "new_cost_price": str(net_cost),
                            "reason": "Corrección de costo por vinculación remito-factura",
                            "purchase_invoice_id": str(invoice.id),
                        },
                    )
                )

        await self.db.flush()
        return covered_product_ids, warnings

    async def _create_lots_for_items(
        self,
        invoice: PurchaseInvoice,
        business_id: UUID,
        user_id: UUID,
        skip_product_ids: set[UUID] | None = None,
    ) -> None:
        """Crea un ProductLot por ítem matcheado (product_id != None).
        Ítems cuyo `product_id` está en `skip_product_ids` se omiten: ya
        tienen lote creado por un remito vinculado (ver
        `_correct_lots_from_receipts`)."""
        lot_service = ProductLotService(self.db)
        skip_product_ids = skip_product_ids or set()

        for item in invoice.items:
            if not item.product_id:
                continue  # IA no matcheó producto — no puede impactar stock
            if item.product_id in skip_product_ids:
                continue

            product = await self.db.get(Product, item.product_id)
            cost_price = self._net_cost(product, Decimal(str(item.unit_cost)))

            lot = await lot_service.create_uncommitted(
                product_id=item.product_id,
                business_id=business_id,
                data=ProductLotCreate(
                    quantity=int(item.quantity),
                    initial_quantity=int(item.quantity),
                    expiration_date=item.expiration_date,
                    cost_price=cost_price,
                    code=f"FC-{invoice.invoice_number}",
                ),
                user_id=user_id,
            )
            item.lot_id = lot.id

    async def _apply_price_updates(
        self,
        invoice: PurchaseInvoice,
        user_id: UUID,
    ) -> None:
        """
        Aplica el impacto de precios (whole-invoice) para cada ítem con
        producto matcheado: usa `unit_cost` como nuevo `list_price` base,
        recalcula con `Product.calculate_prices()` y registra `PriceHistory`.
        """
        for item in invoice.items:
            if not item.product_id:
                continue

            product = await self.db.get(Product, item.product_id)
            if not product:
                continue

            old_list_price = product.list_price
            old_net_price = product.net_price
            old_sale_price = product.sale_price

            product.list_price = item.unit_cost
            product.cost_price = self._net_cost(product, Decimal(str(item.unit_cost)))
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
                    change_reason="Compras: factura de proveedor",
                )
            )
