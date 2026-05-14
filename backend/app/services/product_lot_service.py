"""
Servicio de Lotes de Producto (Product Lot).
Contiene la lógica CRUD básica para la gestión de lotes.
La lógica FIFO se implementará en PR 2.
"""

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
    ) -> ProductLot:
        """Crea un nuevo lote de producto (ingreso de stock)."""
        lot = ProductLot(
            product_id=product_id,
            business_id=business_id,
            quantity=data.quantity,
            initial_quantity=data.initial_quantity or data.quantity,
            expiration_date=data.expiration_date,
            cost_price=data.cost_price,
            code=data.code,
            received_date=data.received_date or date.today(),
        )
        self.db.add(lot)
        await self.db.commit()
        await self.db.refresh(lot)
        return lot

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
