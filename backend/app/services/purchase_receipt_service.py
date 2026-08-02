"""
Servicio de Remitos de Proveedor (Compras — recepción de mercadería).

Maneja el ciclo de vida de un remito: creación de borrador, listado/historial,
edición previa a confirmación, y confirmación atómica (creación de lotes vía
`ProductLotService.create_uncommitted`, con `received_date` explícito y sin
costo — el remito nunca escribe precio/costo, eso es responsabilidad
exclusiva de la factura que se vincule después, ver `PurchaseInvoiceService`).
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.purchase_receipt import (
    PurchaseReceipt,
    PurchaseReceiptItem,
    PurchaseReceiptStatus,
)
from app.schemas.product_lot import ProductLotCreate
from app.schemas.purchase_receipt import (
    PurchaseReceiptConfirmRequest,
    PurchaseReceiptCreate,
    PurchaseReceiptItemCreate,
    PurchaseReceiptUpdate,
)
from app.services.product_lot_service import ProductLotService


class PurchaseReceiptService:
    """Servicio para gestión de remitos de proveedor (borrador, listado, confirmación)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Helpers internos
    # ------------------------------------------------------------------

    @staticmethod
    def _build_items(items_data: list[PurchaseReceiptItemCreate]) -> list[PurchaseReceiptItem]:
        """Construye los PurchaseReceiptItem (sin persistir)."""
        return [
            PurchaseReceiptItem(
                product_id=item_data.product_id,
                quantity=item_data.quantity,
                expiration_date=item_data.expiration_date,
                notes=item_data.notes,
            )
            for item_data in items_data
        ]

    async def _enrich(self, receipt: PurchaseReceipt) -> PurchaseReceipt:
        """Agrega nombres relacionados para la respuesta (supplier, created_by)."""
        if receipt.supplier:
            receipt.supplier_name = receipt.supplier.name
        if receipt.created_by_user:
            receipt.created_by_name = (
                receipt.created_by_user.name or receipt.created_by_user.email
            )
        for item in receipt.items:
            if item.product:
                item.product_code = item.product.code
                item.product_description = item.product.description
        return receipt

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create_draft(
        self,
        business_id: UUID,
        user_id: UUID,
        data: PurchaseReceiptCreate,
    ) -> PurchaseReceipt:
        """Crea un remito en estado `draft` (no impacta stock)."""
        items_db = self._build_items(data.items)

        receipt = PurchaseReceipt(
            business_id=business_id,
            supplier_id=data.supplier_id,
            created_by=user_id,
            status=PurchaseReceiptStatus.DRAFT,
            receipt_number=data.receipt_number,
            received_date=data.received_date,
            expected_invoice_number=data.expected_invoice_number,
            notes=data.notes,
        )
        self.db.add(receipt)
        await self.db.flush()

        for item in items_db:
            item.purchase_receipt_id = receipt.id
            self.db.add(item)

        await self.db.commit()

        return await self.get_by_id(receipt.id, business_id)

    async def get_by_id(
        self,
        receipt_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> PurchaseReceipt | None:
        """Obtiene un remito con sus ítems y relaciones."""
        query = (
            select(PurchaseReceipt)
            .options(
                selectinload(PurchaseReceipt.items).selectinload(
                    PurchaseReceiptItem.product
                ),
                selectinload(PurchaseReceipt.supplier),
                selectinload(PurchaseReceipt.created_by_user),
            )
            .where(
                PurchaseReceipt.id == receipt_id,
                PurchaseReceipt.business_id == business_id,
            )
            # populate_existing: fuerza refrescar objetos/relaciones ya en el
            # identity map (ej. tras update_draft()/confirm()).
            .execution_options(populate_existing=True)
        )
        if not include_deleted:
            query = query.where(PurchaseReceipt.deleted_at.is_(None))

        result = await self.db.execute(query)
        receipt = result.scalar_one_or_none()
        if receipt:
            await self._enrich(receipt)
        return receipt

    async def list(
        self,
        business_id: UUID,
        status: PurchaseReceiptStatus | None = None,
        supplier_id: UUID | None = None,
        pending_link: bool | None = None,
        search: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """Lista/historial de remitos, excluye soft-deleted, más recientes primero.

        `pending_link=True` filtra remitos CONFIRMED sin factura vinculada
        todavía — es el filtro que usa el selector de "remitos pendientes"
        al confirmar una factura.
        """
        base_conditions = [
            PurchaseReceipt.business_id == business_id,
            PurchaseReceipt.deleted_at.is_(None),
        ]
        if status:
            base_conditions.append(PurchaseReceipt.status == status)
        if supplier_id:
            base_conditions.append(PurchaseReceipt.supplier_id == supplier_id)
        if pending_link:
            base_conditions.append(PurchaseReceipt.status == PurchaseReceiptStatus.CONFIRMED)
            base_conditions.append(PurchaseReceipt.purchase_invoice_id.is_(None))
        if search:
            base_conditions.append(PurchaseReceipt.receipt_number.ilike(f"%{search}%"))

        count_result = await self.db.execute(
            select(func.count(PurchaseReceipt.id)).where(*base_conditions)
        )
        total = count_result.scalar() or 0

        offset = (page - 1) * per_page
        result = await self.db.execute(
            select(PurchaseReceipt)
            .options(
                selectinload(PurchaseReceipt.items),
                selectinload(PurchaseReceipt.supplier),
            )
            .where(*base_conditions)
            .order_by(PurchaseReceipt.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
        receipts = list(result.scalars().all())
        for receipt in receipts:
            if receipt.supplier:
                receipt.supplier_name = receipt.supplier.name
            receipt.items_count = len(receipt.items)

        return {
            "items": receipts,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": max(1, (total + per_page - 1) // per_page),
        }

    async def update_draft(
        self,
        receipt_id: UUID,
        business_id: UUID,
        data: PurchaseReceiptUpdate,
    ) -> PurchaseReceipt | None:
        """Edita un remito en estado `draft`. Si se envían `items`, reemplaza
        la lista completa (misma convención que `PurchaseInvoiceService.update_draft`)."""
        receipt = await self.get_by_id(receipt_id, business_id)
        if not receipt:
            return None
        if receipt.status != PurchaseReceiptStatus.DRAFT:
            raise ValueError("Solo se pueden editar remitos en estado borrador")

        if data.supplier_id is not None:
            receipt.supplier_id = data.supplier_id
        if data.receipt_number is not None:
            receipt.receipt_number = data.receipt_number
        if data.received_date is not None:
            receipt.received_date = data.received_date
        if data.expected_invoice_number is not None:
            receipt.expected_invoice_number = data.expected_invoice_number
        if data.notes is not None:
            receipt.notes = data.notes

        if data.items is not None:
            for item in list(receipt.items):
                await self.db.delete(item)
            await self.db.flush()

            items_db = self._build_items(data.items)
            for item in items_db:
                item.purchase_receipt_id = receipt.id
                self.db.add(item)

        await self.db.commit()
        return await self.get_by_id(receipt_id, business_id)

    # ------------------------------------------------------------------
    # Confirmación (atómica)
    # ------------------------------------------------------------------

    async def confirm(
        self,
        receipt_id: UUID,
        business_id: UUID,
        user_id: UUID,
        data: PurchaseReceiptConfirmRequest,
    ) -> PurchaseReceipt:
        """
        Confirma un remito (draft → confirmed) en una única transacción
        atómica: si `update_stock` crea un `ProductLot` por ítem (nunca
        escribe stock directamente, y nunca escribe costo — `cost_price`
        queda `None` hasta que una factura vinculada lo corrija). Si
        cualquier paso falla, rollback completo y el remito queda en
        `draft` (ningún lote persiste).
        """
        receipt = await self.get_by_id(receipt_id, business_id)
        if not receipt:
            raise ValueError("Remito no encontrado")
        if receipt.status != PurchaseReceiptStatus.DRAFT:
            raise ValueError("Solo se pueden confirmar remitos en estado borrador")
        if not receipt.items:
            raise ValueError("El remito no tiene ítems")

        try:
            if data.update_stock:
                await self._create_lots_for_items(receipt, business_id, user_id)

            receipt.status = PurchaseReceiptStatus.CONFIRMED
            receipt.update_stock = data.update_stock
            receipt.confirmed_by = user_id
            receipt.confirmed_at = datetime.utcnow()

            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

        return await self.get_by_id(receipt_id, business_id)

    async def _create_lots_for_items(
        self,
        receipt: PurchaseReceipt,
        business_id: UUID,
        user_id: UUID,
    ) -> None:
        """Crea un ProductLot por ítem, con `received_date` real del remito
        (no `date.today()`) y `cost_price=None` (el remito no maneja costo)."""
        lot_service = ProductLotService(self.db)

        for item in receipt.items:
            lot = await lot_service.create_uncommitted(
                product_id=item.product_id,
                business_id=business_id,
                data=ProductLotCreate(
                    quantity=int(item.quantity),
                    initial_quantity=int(item.quantity),
                    expiration_date=item.expiration_date,
                    cost_price=None,
                    code=f"RM-{receipt.receipt_number}",
                    received_date=receipt.received_date,
                ),
                user_id=user_id,
            )
            item.lot_id = lot.id
