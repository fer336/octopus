from __future__ import annotations

"""Servicio de Marcas."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.brand import Brand
from app.models.product import Product
from app.schemas.brand import BrandCreate, BrandListParams, BrandUpdate
from app.utils.brand_normalization import normalize_brand_name


class BrandService:
    """Servicio para gestión de marcas normalizadas."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _product_count_subquery():
        """Subquery que cuenta productos activos por brand_id."""
        return (
            select(func.count(Product.id))
            .where(
                Product.brand_id == Brand.id,
                Product.deleted_at.is_(None),
            )
            .correlate(Brand)
            .scalar_subquery()
        )

    async def get_product_count(self, brand_id: UUID) -> int:
        """Cuenta productos activos vinculados a una marca."""
        result = await self.db.execute(
            select(func.count(Product.id)).where(
                Product.brand_id == brand_id,
                Product.deleted_at.is_(None),
            )
        )
        return result.scalar() or 0

    # ── CRUD ─────────────────────────────────────────────────────────────

    async def create(self, business_id: UUID, data: BrandCreate) -> Brand:
        """Crea una marca validando unicidad normalizada por negocio."""
        return await self.resolve_or_create(business_id, data.name)

    async def resolve_or_create(self, business_id: UUID, name: str) -> Brand:
        """Obtiene o crea una marca usando su nombre normalizado."""
        clean_name = name.strip()
        normalized_name = normalize_brand_name(clean_name)
        if not normalized_name:
            raise ValueError("El nombre de la marca es obligatorio")

        existing = await self.get_by_normalized_name(business_id, normalized_name)
        if existing:
            return existing

        brand = Brand(
            business_id=business_id,
            name=clean_name,
            normalized_name=normalized_name,
        )
        self.db.add(brand)
        await self.db.flush()
        return brand

    async def get_by_id(
        self,
        brand_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> Brand | None:
        """Obtiene una marca por ID."""
        query = select(Brand).where(
            Brand.id == brand_id,
            Brand.business_id == business_id,
        )
        if not include_deleted:
            query = query.where(Brand.deleted_at.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_normalized_name(
        self,
        business_id: UUID,
        normalized_name: str,
    ) -> Brand | None:
        """Obtiene una marca activa por nombre normalizado."""
        result = await self.db.execute(
            select(Brand).where(
                Brand.business_id == business_id,
                Brand.normalized_name == normalized_name,
                Brand.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def list_all(
        self,
        business_id: UUID,
        params: BrandListParams,
    ) -> tuple[list[tuple[Brand, int]], int]:
        """Lista marcas con product_count, paginación y búsqueda.

        Returns:
            Tupla de (lista de pares (Brand, product_count), total).
        """
        conditions = [Brand.business_id == business_id, Brand.deleted_at.is_(None)]
        if params.search:
            conditions.append(Brand.name.ilike(f"%{params.search}%"))

        count_result = await self.db.execute(
            select(func.count(Brand.id)).where(*conditions)
        )
        total = count_result.scalar() or 0

        product_count_subq = self._product_count_subquery()
        result = await self.db.execute(
            select(Brand, product_count_subq.label("product_count"))
            .where(*conditions)
            .order_by(Brand.name)
            .offset((params.page - 1) * params.per_page)
            .limit(params.per_page)
        )
        return [(row.Brand, row.product_count) for row in result.all()], total

    async def get_products(
        self,
        brand_id: UUID,
        business_id: UUID,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[Product], int]:
        """Obtiene productos activos vinculados a una marca."""
        brand = await self.get_by_id(brand_id, business_id)
        if not brand:
            return [], 0

        conditions = [
            Product.brand_id == brand_id,
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
        ]
        total_result = await self.db.execute(
            select(func.count(Product.id)).where(*conditions)
        )
        total = total_result.scalar() or 0

        result = await self.db.execute(
            select(Product)
            .where(*conditions)
            .order_by(Product.code)
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        return list(result.scalars().all()), total

    async def update(
        self,
        brand_id: UUID,
        business_id: UUID,
        data: BrandUpdate,
    ) -> Brand | None:
        """Actualiza una marca y mantiene el nombre normalizado."""
        brand = await self.get_by_id(brand_id, business_id)
        if not brand:
            return None

        if data.name is not None:
            clean_name = data.name.strip()
            normalized_name = normalize_brand_name(clean_name)
            if not normalized_name:
                raise ValueError("El nombre de la marca es obligatorio")
            existing = await self.get_by_normalized_name(business_id, normalized_name)
            if existing and existing.id != brand_id:
                raise ValueError("Ya existe una marca equivalente")
            brand.name = clean_name
            brand.normalized_name = normalized_name

        await self.db.commit()
        await self.db.refresh(brand)
        return brand

    async def soft_delete(self, brand_id: UUID, business_id: UUID) -> bool:
        """Elimina una marca (soft delete). Previene si tiene productos."""
        brand = await self.get_by_id(brand_id, business_id)
        if not brand:
            return False

        product_count = await self.get_product_count(brand_id)
        if product_count > 0:
            raise ValueError(
                f"No se puede eliminar la marca \"{brand.name}\": "
                f"tiene {product_count} producto{'s' if product_count != 1 else ''} asociado{'s' if product_count != 1 else ''}. "
                "Reasigná los productos a otra marca primero."
            )

        brand.deleted_at = datetime.utcnow()
        await self.db.commit()
        return True
