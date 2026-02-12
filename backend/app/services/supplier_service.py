"""
Servicio de Proveedores.
Contiene toda la lógica de negocio para proveedores.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.supplier import Supplier
from app.models.category import Category
from app.schemas.supplier import SupplierCreate, SupplierListParams, SupplierUpdate


class SupplierService:
    """Servicio para gestión de proveedores."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, business_id: UUID, data: SupplierCreate) -> Supplier:
        """Crea un nuevo proveedor con descuentos por categoría."""
        # Extraer category_ids y category_discounts del dict
        supplier_data = data.model_dump(exclude={'category_ids', 'category_discounts'})
        category_ids = data.category_ids or []
        category_discounts = data.category_discounts or []
        
        supplier = Supplier(
            business_id=business_id,
            **supplier_data,
        )

        # Asociar categorías si hay
        if category_ids:
            categories = await self.db.execute(
                select(Category).where(
                    Category.id.in_(category_ids),
                    Category.business_id == business_id,
                )
            )
            supplier.categories = list(categories.scalars().all())

        self.db.add(supplier)
        await self.db.flush()  # Para obtener el supplier.id
        
        # Crear descuentos por categoría
        for cat_discount in category_discounts:
            discount = SupplierCategoryDiscount(
                supplier_id=supplier.id,
                category_id=cat_discount.category_id,
                discount_1=cat_discount.discount_1,
                discount_2=cat_discount.discount_2,
                discount_3=cat_discount.discount_3,
            )
            self.db.add(discount)

        await self.db.commit()
        await self.db.refresh(supplier)
        return supplier

    async def get_by_id(
        self,
        supplier_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> Optional[Supplier]:
        """Obtiene un proveedor por ID con sus categorías."""
        query = (
            select(Supplier)
            .options(selectinload(Supplier.categories))
            .where(
                Supplier.id == supplier_id,
                Supplier.business_id == business_id,
            )
        )
        if not include_deleted:
            query = query.where(Supplier.deleted_at.is_(None))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list(
        self,
        business_id: UUID,
        params: SupplierListParams,
    ) -> tuple[list[Supplier], int]:
        """Lista proveedores con paginación y búsqueda."""
        base_conditions = [
            Supplier.business_id == business_id,
            Supplier.deleted_at.is_(None),
        ]

        if params.search:
            search_filter = or_(
                Supplier.name.ilike(f"%{params.search}%"),
                Supplier.cuit.ilike(f"%{params.search}%"),
            )
            base_conditions.append(search_filter)

        # Conteo
        count_query = select(func.count(Supplier.id)).where(*base_conditions)
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Query paginada con categorías cargadas
        offset = (params.page - 1) * params.per_page
        query = (
            select(Supplier)
            .options(selectinload(Supplier.categories))
            .where(*base_conditions)
            .order_by(Supplier.name)
            .offset(offset)
            .limit(params.per_page)
        )

        result = await self.db.execute(query)
        suppliers = list(result.scalars().all())

        return suppliers, total

    async def update(
        self,
        supplier_id: UUID,
        business_id: UUID,
        data: SupplierUpdate,
    ) -> Optional[Supplier]:
        """Actualiza un proveedor."""
        supplier = await self.get_by_id(supplier_id, business_id)
        if not supplier:
            return None

        update_data = data.model_dump(exclude_unset=True, exclude={'category_ids', 'category_discounts'})
        
        # Actualizar categorías si se proporcionan
        if data.category_ids is not None:
            categories = await self.db.execute(
                select(Category).where(
                    Category.id.in_(data.category_ids),
                    Category.business_id == business_id,
                )
            )
            supplier.categories = list(categories.scalars().all())
        
        # Actualizar descuentos por categoría
        if data.category_discounts is not None:
            # Eliminar descuentos existentes
            await self.db.execute(
                delete(SupplierCategoryDiscount).where(
                    SupplierCategoryDiscount.supplier_id == supplier_id
                )
            )
            
            # Crear nuevos descuentos
            for cat_discount in data.category_discounts:
                new_discount = SupplierCategoryDiscount(
                    supplier_id=supplier_id,
                    category_id=cat_discount.category_id,
                    discount_1=cat_discount.discount_1,
                    discount_2=cat_discount.discount_2,
                    discount_3=cat_discount.discount_3,
                )
                self.db.add(new_discount)
        
        # Actualizar otros campos
        for field, value in update_data.items():
            setattr(supplier, field, value)

        await self.db.commit()
        await self.db.refresh(supplier)
        return supplier

    async def soft_delete(self, supplier_id: UUID, business_id: UUID) -> bool:
        """Elimina un proveedor (soft delete)."""
        supplier = await self.get_by_id(supplier_id, business_id)
        if not supplier:
            return False

        supplier.deleted_at = datetime.utcnow()
        await self.db.commit()
        return True
