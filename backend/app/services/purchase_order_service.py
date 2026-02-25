"""
Servicio de Órdenes de Pedido.
Gestiona el ciclo completo: conteo físico → orden → confirmación.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus
from app.models.supplier import Supplier
from app.models.user import User
from app.schemas.purchase_order import PurchaseOrderCreate, PurchaseOrderUpdate


class PurchaseOrderService:
    """Servicio para gestión de órdenes de pedido."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Helpers internos
    # ------------------------------------------------------------------

    def _calculate_unit_cost(self, product: Product) -> Decimal:
        """
        Calcula el precio de costo unitario aplicando las bonificaciones en cadena.
        precio_costo = precio_lista × (1 - bonif1/100) × (1 - bonif2/100) × (1 - bonif3/100)
        No incluye IVA (el IVA se suma globalmente al pie del reporte).
        """
        list_price = Decimal(str(product.list_price or 0))
        d1 = Decimal(str(product.discount_1 or 0))
        d2 = Decimal(str(product.discount_2 or 0))
        d3 = Decimal(str(product.discount_3 or 0))

        cost = list_price * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
        return round(cost, 2)

    async def _enrich_item(self, item: PurchaseOrderItem) -> PurchaseOrderItem:
        """Agrega datos del producto, categoría y proveedor al ítem para respuestas."""
        if item.product:
            item.product_code = item.product.code
            item.product_description = item.product.description
            item.product_supplier_code = item.product.supplier_code
            if item.product.category:
                item.category_name = item.product.category.name
            if item.product.supplier:
                item.supplier_name = item.product.supplier.name
        return item

    async def _enrich_order(self, order: PurchaseOrder) -> PurchaseOrder:
        """Agrega nombres de proveedor, categoría y usuario a la orden."""
        if order.supplier:
            order.supplier_name = order.supplier.name
        if order.category:
            order.category_name = order.category.name
        if order.created_by_user:
            order.created_by_name = order.created_by_user.name or order.created_by_user.email
        for item in order.items:
            await self._enrich_item(item)
        return order

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    async def create(
        self,
        business_id: UUID,
        user_id: UUID,
        data: PurchaseOrderCreate,
    ) -> PurchaseOrder:
        """
        Crea una orden de pedido en estado DRAFT.
        Calcula automáticamente el costo unitario de cada ítem a partir del producto,
        pero lo deja editable (el operador puede sobrescribirlo).
        """
        order = PurchaseOrder(
            business_id=business_id,
            supplier_id=data.supplier_id,
            category_id=data.category_id,
            created_by=user_id,
            notes=data.notes,
            status=PurchaseOrderStatus.DRAFT,
        )
        self.db.add(order)
        await self.db.flush()  # Para obtener el ID antes de agregar ítems

        for item_data in data.items:
            item = PurchaseOrderItem(
                purchase_order_id=order.id,
                product_id=item_data.product_id,
                system_stock=item_data.system_stock,
                counted_stock=item_data.counted_stock,
                quantity_to_order=item_data.quantity_to_order,
                unit_cost=item_data.unit_cost,
                iva_rate=item_data.iva_rate,
            )
            item.recalculate()
            self.db.add(item)

        await self.db.flush()
        await self.db.refresh(order)

        # Recargar con relaciones para recalcular totales
        result = await self.db.execute(
            select(PurchaseOrder)
            .options(selectinload(PurchaseOrder.items))
            .where(PurchaseOrder.id == order.id)
        )
        order = result.scalar_one()
        order.recalculate_totals()

        await self.db.commit()
        await self.db.refresh(order)
        return await self.get_by_id(order.id, business_id)

    async def get_by_id(
        self,
        order_id: UUID,
        business_id: UUID,
    ) -> Optional[PurchaseOrder]:
        """Obtiene una orden de pedido con todos sus ítems y relaciones."""
        result = await self.db.execute(
            select(PurchaseOrder)
            .options(
                selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product)
                .selectinload(Product.category),
                selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.product)
                .selectinload(Product.supplier),
                selectinload(PurchaseOrder.supplier),
                selectinload(PurchaseOrder.category),
                selectinload(PurchaseOrder.created_by_user),
            )
            .where(
                PurchaseOrder.id == order_id,
                PurchaseOrder.business_id == business_id,
                PurchaseOrder.deleted_at.is_(None),
            )
        )
        order = result.scalar_one_or_none()
        if order:
            await self._enrich_order(order)
        return order

    async def list(
        self,
        business_id: UUID,
        supplier_id: Optional[UUID] = None,
        category_id: Optional[UUID] = None,
        status: Optional[PurchaseOrderStatus] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        """Lista órdenes de pedido con filtros y paginación."""
        base_query = (
            select(PurchaseOrder)
            .options(
                selectinload(PurchaseOrder.supplier),
                selectinload(PurchaseOrder.category),
                selectinload(PurchaseOrder.created_by_user),
                selectinload(PurchaseOrder.items),
            )
            .where(
                PurchaseOrder.business_id == business_id,
                PurchaseOrder.deleted_at.is_(None),
            )
        )

        if supplier_id:
            base_query = base_query.where(PurchaseOrder.supplier_id == supplier_id)
        if category_id:
            base_query = base_query.where(PurchaseOrder.category_id == category_id)
        if status:
            base_query = base_query.where(PurchaseOrder.status == status)

        # Total
        count_result = await self.db.execute(
            select(func.count()).select_from(base_query.subquery())
        )
        total = count_result.scalar_one()

        # Paginación
        offset = (page - 1) * per_page
        result = await self.db.execute(
            base_query.order_by(PurchaseOrder.created_at.desc())
            .offset(offset)
            .limit(per_page)
        )
        orders = result.scalars().all()

        # Enriquecer con nombres
        for order in orders:
            if order.supplier:
                order.supplier_name = order.supplier.name
            if order.category:
                order.category_name = order.category.name
            if order.created_by_user:
                order.created_by_name = (
                    order.created_by_user.name or order.created_by_user.email
                )
            order.items_count = len(order.items)

        return {
            "items": orders,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": max(1, (total + per_page - 1) // per_page),
        }

    async def update(
        self,
        order_id: UUID,
        business_id: UUID,
        data: PurchaseOrderUpdate,
    ) -> Optional[PurchaseOrder]:
        """
        Actualiza una orden en estado DRAFT.
        Si se envían ítems nuevos, reemplaza los existentes completos.
        """
        order = await self.get_by_id(order_id, business_id)
        if not order:
            return None
        if order.status != PurchaseOrderStatus.DRAFT:
            raise ValueError("Solo se pueden editar órdenes en estado borrador")

        if data.notes is not None:
            order.notes = data.notes

        if data.items is not None:
            # Eliminar ítems anteriores y crear los nuevos
            for item in order.items:
                await self.db.delete(item)
            await self.db.flush()

            for item_data in data.items:
                item = PurchaseOrderItem(
                    purchase_order_id=order.id,
                    product_id=item_data.product_id,
                    system_stock=item_data.system_stock,
                    counted_stock=item_data.counted_stock,
                    quantity_to_order=item_data.quantity_to_order,
                    unit_cost=item_data.unit_cost,
                    iva_rate=item_data.iva_rate,
                )
                item.recalculate()
                self.db.add(item)

            await self.db.flush()

            # Recargar ítems para recalcular totales
            result = await self.db.execute(
                select(PurchaseOrder)
                .options(selectinload(PurchaseOrder.items))
                .where(PurchaseOrder.id == order.id)
            )
            order = result.scalar_one()
            order.recalculate_totals()

        await self.db.commit()
        return await self.get_by_id(order_id, business_id)

    async def confirm(
        self,
        order_id: UUID,
        business_id: UUID,
    ) -> Optional[PurchaseOrder]:
        """Confirma una orden de pedido (DRAFT → CONFIRMED)."""
        order = await self.get_by_id(order_id, business_id)
        if not order:
            return None
        if order.status != PurchaseOrderStatus.DRAFT:
            raise ValueError("Solo se pueden confirmar órdenes en estado borrador")
        if not order.items:
            raise ValueError("La orden no tiene ítems")

        order.status = PurchaseOrderStatus.CONFIRMED
        order.confirmed_at = datetime.utcnow()
        await self.db.commit()
        return await self.get_by_id(order_id, business_id)

    async def delete(self, order_id: UUID, business_id: UUID) -> bool:
        """Soft delete de una orden (solo si está en DRAFT)."""
        order = await self.get_by_id(order_id, business_id)
        if not order:
            return False
        if order.status == PurchaseOrderStatus.CONFIRMED:
            raise ValueError("No se puede eliminar una orden confirmada")
        order.soft_delete()
        await self.db.commit()
        return True

    # ------------------------------------------------------------------
    # Helpers para PDF
    # ------------------------------------------------------------------

    async def get_products_for_count_sheet(
        self,
        business_id: UUID,
        supplier_id: Optional[UUID] = None,
        category_id: Optional[UUID] = None,
    ) -> list[Product]:
        """
        Retorna los productos activos para generar la planilla de conteo.
        Filtra por proveedor y/o categoría.
        """
        query = (
            select(Product)
            .options(
                selectinload(Product.category),
                selectinload(Product.supplier),
            )
            .where(
                Product.business_id == business_id,
                Product.is_active.is_(True),
                Product.deleted_at.is_(None),
            )
        )

        if supplier_id:
            query = query.where(Product.supplier_id == supplier_id)
        if category_id:
            query = query.where(Product.category_id == category_id)

        query = query.order_by(Product.description)
        result = await self.db.execute(query)
        return result.scalars().all()
