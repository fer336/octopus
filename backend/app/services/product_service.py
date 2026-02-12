"""
Servicio de Productos.
Contiene toda la lógica de negocio para productos.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.price_history import PriceHistory
from app.schemas.product import ProductCreate, ProductListParams, ProductUpdate


class ProductService:
    """Servicio para gestión de productos."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, business_id: UUID, data: ProductCreate) -> Product:
        """Crea un nuevo producto con cálculo automático de precios."""
        product = Product(
            business_id=business_id,
            **data.model_dump(),
        )
        product.calculate_prices()

        self.db.add(product)
        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def get_by_id(
        self,
        product_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> Optional[Product]:
        """Obtiene un producto por ID."""
        query = select(Product).where(
            Product.id == product_id,
            Product.business_id == business_id,
        )
        if not include_deleted:
            query = query.where(Product.deleted_at.is_(None))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_code(
        self,
        code: str,
        business_id: UUID,
    ) -> Optional[Product]:
        """Obtiene un producto por código interno."""
        query = select(Product).where(
            Product.code == code,
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list(
        self,
        business_id: UUID,
        params: ProductListParams,
    ) -> tuple[list[Product], int]:
        """Lista productos con paginación, búsqueda y filtros."""
        # Query base
        base_conditions = [
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
        ]

        # Aplicar filtros
        if params.search:
            search_filter = or_(
                Product.code.ilike(f"%{params.search}%"),
                Product.supplier_code.ilike(f"%{params.search}%"),
                Product.description.ilike(f"%{params.search}%"),
            )
            base_conditions.append(search_filter)

        if params.category_id:
            base_conditions.append(Product.category_id == params.category_id)

        if params.supplier_id:
            base_conditions.append(Product.supplier_id == params.supplier_id)

        if params.is_active is not None:
            base_conditions.append(Product.is_active == params.is_active)

        if params.low_stock:
            base_conditions.append(Product.current_stock <= Product.minimum_stock)

        # Query de conteo
        count_query = select(func.count(Product.id)).where(*base_conditions)
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Query paginada
        offset = (params.page - 1) * params.per_page
        query = (
            select(Product)
            .where(*base_conditions)
            .order_by(Product.description)
            .offset(offset)
            .limit(params.per_page)
        )

        result = await self.db.execute(query)
        products = list(result.scalars().all())

        return products, total

    async def update(
        self,
        product_id: UUID,
        business_id: UUID,
        data: ProductUpdate,
        user_id: Optional[UUID] = None,
    ) -> Optional[Product]:
        """Actualiza un producto y registra cambios de precio."""
        product = await self.get_by_id(product_id, business_id)
        if not product:
            return None

        # Guardar precios anteriores para el historial
        old_list_price = product.list_price
        old_net_price = product.net_price
        old_sale_price = product.sale_price

        # Aplicar actualizaciones
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(product, field, value)

        # Recalcular precios si cambió algo relacionado
        price_fields = {"list_price", "discount_1", "discount_2", "discount_3", "iva_rate", "extra_cost"}
        if price_fields & set(update_data.keys()):
            product.calculate_prices()

            # Registrar en historial si el precio cambió
            if product.sale_price != old_sale_price:
                history = PriceHistory(
                    product_id=product.id,
                    changed_by=user_id,
                    old_list_price=old_list_price,
                    old_net_price=old_net_price,
                    old_sale_price=old_sale_price,
                    new_list_price=product.list_price,
                    new_net_price=product.net_price,
                    new_sale_price=product.sale_price,
                    change_reason="Manual",
                )
                self.db.add(history)

        await self.db.commit()
        await self.db.refresh(product)
        return product

    async def soft_delete(self, product_id: UUID, business_id: UUID) -> bool:
        """Elimina un producto (soft delete)."""
        product = await self.get_by_id(product_id, business_id)
        if not product:
            return False

        product.deleted_at = datetime.utcnow()
        await self.db.commit()
        return True

    async def update_stock(
        self,
        product_id: UUID,
        business_id: UUID,
        quantity_change: int,
    ) -> Optional[Product]:
        """Actualiza el stock de un producto."""
        product = await self.get_by_id(product_id, business_id)
        if not product:
            return None

        product.current_stock += quantity_change
        if product.current_stock < 0:
            product.current_stock = 0

        await self.db.commit()
        await self.db.refresh(product)
        return product
