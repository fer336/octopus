"""
Servicio de Categorías.
Contiene toda la lógica de negocio para categorías jerárquicas.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryListParams, CategoryUpdate


class CategoryService:
    """Servicio para gestión de categorías."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, business_id: UUID, data: CategoryCreate) -> Category:
        """Crea una nueva categoría."""
        # Validar que la categoría padre existe si se especifica
        if data.parent_id:
            parent = await self.get_by_id(data.parent_id, business_id)
            if not parent:
                raise ValueError("Categoría padre no encontrada")

        category = Category(
            business_id=business_id,
            **data.model_dump(),
        )

        self.db.add(category)
        await self.db.commit()
        await self.db.refresh(category)
        return category

    async def get_by_id(
        self,
        category_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> Optional[Category]:
        """Obtiene una categoría por ID."""
        query = select(Category).where(
            Category.id == category_id,
            Category.business_id == business_id,
        )
        if not include_deleted:
            query = query.where(Category.deleted_at.is_(None))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list(
        self,
        business_id: UUID,
        params: CategoryListParams,
    ) -> tuple[list[Category], int]:
        """Lista categorías con paginación y filtros."""
        base_conditions = [
            Category.business_id == business_id,
            Category.deleted_at.is_(None),
        ]

        if params.search:
            base_conditions.append(Category.name.ilike(f"%{params.search}%"))

        if params.parent_id:
            base_conditions.append(Category.parent_id == params.parent_id)
        elif params.root_only:
            base_conditions.append(Category.parent_id.is_(None))

        # Conteo
        count_query = select(func.count(Category.id)).where(*base_conditions)
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Query paginada
        offset = (params.page - 1) * params.per_page
        query = (
            select(Category)
            .where(*base_conditions)
            .order_by(Category.name)
            .offset(offset)
            .limit(params.per_page)
        )

        result = await self.db.execute(query)
        categories = list(result.scalars().all())

        return categories, total

    async def get_tree(self, business_id: UUID) -> list[Category]:
        """Obtiene el árbol completo de categorías."""
        query = (
            select(Category)
            .options(selectinload(Category.subcategories))
            .where(
                Category.business_id == business_id,
                Category.deleted_at.is_(None),
                Category.parent_id.is_(None),  # Solo categorías raíz
            )
            .order_by(Category.name)
        )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update(
        self,
        category_id: UUID,
        business_id: UUID,
        data: CategoryUpdate,
    ) -> Optional[Category]:
        """Actualiza una categoría."""
        category = await self.get_by_id(category_id, business_id)
        if not category:
            return None

        # Validar que no se cree un ciclo
        if data.parent_id:
            if data.parent_id == category_id:
                raise ValueError("Una categoría no puede ser su propio padre")
            parent = await self.get_by_id(data.parent_id, business_id)
            if not parent:
                raise ValueError("Categoría padre no encontrada")

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(category, field, value)

        await self.db.commit()
        await self.db.refresh(category)
        return category

    async def soft_delete(self, category_id: UUID, business_id: UUID) -> bool:
        """
        Elimina una categoría (soft delete).
        También elimina las subcategorías.
        """
        category = await self.get_by_id(category_id, business_id)
        if not category:
            return False

        # Eliminar subcategorías recursivamente
        await self._delete_subcategories(category_id, business_id)

        category.deleted_at = datetime.utcnow()
        await self.db.commit()
        return True

    async def _delete_subcategories(self, parent_id: UUID, business_id: UUID) -> None:
        """Elimina subcategorías recursivamente."""
        query = select(Category).where(
            Category.parent_id == parent_id,
            Category.business_id == business_id,
            Category.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        subcategories = result.scalars().all()

        for subcategory in subcategories:
            await self._delete_subcategories(subcategory.id, business_id)
            subcategory.deleted_at = datetime.utcnow()
