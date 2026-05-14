"""
Router de Lotes de Producto (Product Lots).
Endpoints REST para gestión de lotes e ingreso de stock.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.product_lot import ProductLotCreate, ProductLotResponse, ProductLotUpdate
from app.services.product_lot_service import ProductLotService
from app.utils.security import get_current_business, require_module_access

router = APIRouter(
    prefix="/products/{product_id}/lots",
    tags=["Lotes de Producto"],
    dependencies=[Depends(require_module_access("products"))],
)


@router.get("", response_model=list[ProductLotResponse])
async def list_product_lots(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista todos los lotes activos de un producto."""
    service = ProductLotService(db)
    lots = await service.list_by_product(product_id, business_id)
    return [ProductLotResponse.model_validate(lot) for lot in lots]


@router.post("", response_model=ProductLotResponse, status_code=status.HTTP_201_CREATED)
async def create_product_lot(
    product_id: UUID,
    data: ProductLotCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Crea un nuevo lote (ingreso de stock) para un producto."""
    from app.models.product import Product
    from sqlalchemy import select

    # Verificar que el producto existe y pertenece al negocio
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    service = ProductLotService(db)
    lot = await service.create(product_id, business_id, data)
    return ProductLotResponse.model_validate(lot)


# Router separado para operaciones sobre un lote específico
lot_router = APIRouter(
    prefix="/product-lots",
    tags=["Lotes de Producto"],
    dependencies=[Depends(require_module_access("products"))],
)


@lot_router.patch("/{lot_id}", response_model=ProductLotResponse)
async def update_product_lot(
    lot_id: UUID,
    data: ProductLotUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza un lote existente (cantidad, vencimiento, costo)."""
    service = ProductLotService(db)
    lot = await service.update(lot_id, business_id, data)

    if not lot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lote no encontrado",
        )

    return ProductLotResponse.model_validate(lot)
