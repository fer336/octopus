"""
Servicio de Lotes de Producto (Product Lot).
Contiene la lógica CRUD básica para la gestión de lotes,
el consumo FIFO por fecha de vencimiento,
y la trazabilidad auditada (LotConsumption + AuditLog).
"""

import json
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.lot_consumption import LotConsumption
from app.models.product_lot import ProductLot
from app.schemas.product_lot import ProductLotCreate, ProductLotUpdate


class ProductLotService:
    """Servicio para gestión de lotes de producto."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        product_id: UUID,
        business_id: UUID,
        data: ProductLotCreate,
        user_id: UUID | None = None,
    ) -> ProductLot:
        """Crea un nuevo lote de producto (ingreso de stock).

        Si se provee user_id, asigna created_by y registra AuditLog.
        """
        lot = ProductLot(
            product_id=product_id,
            business_id=business_id,
            quantity=data.quantity,
            initial_quantity=data.initial_quantity or data.quantity,
            expiration_date=data.expiration_date,
            cost_price=data.cost_price,
            code=data.code,
            received_date=data.received_date or date.today(),
            created_by=user_id,
        )
        self.db.add(lot)

        # Flushear para obtener lot.id antes de crear AuditLog
        await self.db.flush()

        # Registrar auditoría si hay user_id
        if user_id:
            audit = AuditLog(
                user_id=user_id,
                business_id=business_id,
                action="create",
                resource_type="lot_operation",
                resource_id=lot.id,
                details={
                    "product_id": str(product_id),
                    "quantity": data.quantity,
                    "code": data.code,
                    "delta": data.quantity,
                },
            )
            self.db.add(audit)

        await self.db.commit()
        await self.db.refresh(lot)
        return lot

    async def create_uncommitted(
        self,
        product_id: UUID,
        business_id: UUID,
        data: ProductLotCreate,
        user_id: UUID | None = None,
    ) -> ProductLot:
        """Crea un lote de producto SIN comitear (flush-only).

        Variante de `create()` pensada para llamadores que necesitan
        atomicidad con otras escrituras dentro de su propia transacción
        (ej. `PurchaseInvoiceService.confirm()`,
        `InvoiceReversalService.edit_confirmed()`). El llamador es
        responsable de `await self.db.commit()` (éxito) o
        `await self.db.rollback()` (falla) al final de su operación.

        No toca `create()` ni ningún otro método existente: éste sigue
        comiteando inmediatamente para no romper a los callers actuales
        (voucher/lot router).
        """
        lot = ProductLot(
            product_id=product_id,
            business_id=business_id,
            quantity=data.quantity,
            initial_quantity=data.initial_quantity or data.quantity,
            expiration_date=data.expiration_date,
            cost_price=data.cost_price,
            code=data.code,
            received_date=data.received_date or date.today(),
            created_by=user_id,
        )
        self.db.add(lot)

        # Flushear para obtener lot.id sin comitear la transacción
        await self.db.flush()

        if user_id:
            audit = AuditLog(
                user_id=user_id,
                business_id=business_id,
                action="create",
                resource_type="lot_operation",
                resource_id=lot.id,
                details={
                    "product_id": str(product_id),
                    "quantity": data.quantity,
                    "code": data.code,
                    "delta": data.quantity,
                },
            )
            self.db.add(audit)
            await self.db.flush()

        return lot

    async def fifo_consume(
        self,
        product_id: UUID,
        business_id: UUID,
        quantity: int,
        voucher_item_id: UUID | None = None,
        user_id: UUID | None = None,
        reason: str | None = None,
    ) -> tuple[UUID | None, list[dict]]:
        """
        Consume stock usando FIFO por expiration_date.

        Si se provee voucher_item_id, persiste LotConsumption rows.
        Si se provee user_id, registra AuditLog entries.

        Retorna (last_lot_id, lista_de_consumos_por_lote).
        Usa SELECT ... FOR UPDATE para row-level locking.
        Lanza ValueError si stock insuficiente.
        """
        if quantity <= 0:
            raise ValueError("La cantidad a consumir debe ser positiva")

        # Buscar lotes activos del producto, ordenados por expiration_date ASC NULLS LAST
        query = (
            select(ProductLot)
            .where(
                ProductLot.product_id == product_id,
                ProductLot.business_id == business_id,
                ProductLot.deleted_at.is_(None),
                ProductLot.quantity > 0,
            )
            .order_by(
                ProductLot.expiration_date.asc().nulls_last(),
                ProductLot.received_date.asc(),
            )
            .with_for_update()
        )
        result = await self.db.execute(query)
        lots = list(result.scalars().all())

        total_available = sum(lot.quantity for lot in lots)
        if total_available < quantity:
            raise ValueError(
                f"Stock insuficiente. Disponible: {total_available}, "
                f"requerido: {quantity}"
            )

        remaining = quantity
        consumptions: list[dict] = []
        last_lot_id: UUID | None = None

        for lot in lots:
            if remaining <= 0:
                break

            taken = min(lot.quantity, remaining)
            lot.quantity -= taken
            remaining -= taken

            # Persistir LotConsumption si hay voucher_item_id
            if voucher_item_id is not None:
                lc = LotConsumption(
                    voucher_item_id=voucher_item_id,
                    lot_id=lot.id,
                    quantity_taken=taken,
                )
                self.db.add(lc)

            # Registrar AuditLog si hay user_id
            if user_id is not None:
                audit = AuditLog(
                    user_id=user_id,
                    business_id=business_id,
                    action="consume",
                    resource_type="lot_operation",
                    resource_id=lot.id,
                    details={
                        "product_id": str(product_id),
                        "lot_id": str(lot.id),
                        "quantity_taken": taken,
                        "delta": -taken,
                        "reason": reason or "consumo FIFO",
                        "voucher_item_id": str(voucher_item_id) if voucher_item_id else None,
                    },
                )
                self.db.add(audit)

            consumptions.append({"lot_id": lot.id, "taken": taken})
            last_lot_id = lot.id

        await self.db.flush()
        return (last_lot_id, consumptions)

    async def list_by_product(
        self,
        product_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> list[ProductLot]:
        """Lista todos los lotes de un producto ordenados por fecha de recepción."""
        query = (
            select(ProductLot)
            .where(
                ProductLot.product_id == product_id,
                ProductLot.business_id == business_id,
            )
            .order_by(ProductLot.received_date.desc())
        )
        if not include_deleted:
            query = query.where(ProductLot.deleted_at.is_(None))

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_id(
        self,
        lot_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> ProductLot | None:
        """Obtiene un lote por ID."""
        query = select(ProductLot).where(
            ProductLot.id == lot_id,
            ProductLot.business_id == business_id,
        )
        if not include_deleted:
            query = query.where(ProductLot.deleted_at.is_(None))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update(
        self,
        lot_id: UUID,
        business_id: UUID,
        data: ProductLotUpdate,
    ) -> ProductLot | None:
        """Actualiza un lote existente."""
        lot = await self.get_by_id(lot_id, business_id)
        if not lot:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(lot, field, value)

        await self.db.commit()
        await self.db.refresh(lot)
        return lot

    async def get_total_stock(
        self,
        product_id: UUID,
        business_id: UUID,
    ) -> int:
        """Retorna la suma de cantidades de todos los lotes activos de un producto."""
        query = select(func.coalesce(func.sum(ProductLot.quantity), 0)).where(
            ProductLot.product_id == product_id,
            ProductLot.business_id == business_id,
            ProductLot.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return result.scalar() or 0
