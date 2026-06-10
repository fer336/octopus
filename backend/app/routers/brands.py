"""Router de Marcas."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.brand import (
    BrandCreate,
    BrandListParams,
    BrandProductItem,
    BrandResponse,
    BrandUpdate,
)
from app.services.brand_service import BrandService
from app.utils.security import get_current_business, require_module_access

router = APIRouter(
    prefix="/brands",
    tags=["Marcas"],
    dependencies=[Depends(require_module_access("products"))],
)


def _build_brand_response(brand, product_count: int = 0) -> BrandResponse:
    """Construye un BrandResponse desde un modelo Brand y su product_count."""
    resp = BrandResponse.model_validate(brand)
    resp.product_count = product_count
    return resp


@router.get("", response_model=PaginatedResponse[BrandResponse])
async def list_brands(
    search: str | None = Query(None, description="Buscar por nombre"),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Lista marcas con paginación y búsqueda."""
    service = BrandService(db)
    params = BrandListParams(search=search, page=page, per_page=per_page)
    brands_with_count, total = await service.list_all(business_id, params)
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=[
            _build_brand_response(brand, count) for brand, count in brands_with_count
        ],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("", response_model=BrandResponse, status_code=status.HTTP_201_CREATED)
async def create_brand(
    data: BrandCreate,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Crea una nueva marca o devuelve la equivalente existente."""
    service = BrandService(db)
    try:
        brand = await service.create(business_id, data)
        await db.commit()
        await db.refresh(brand)
        return BrandResponse.model_validate(brand)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.get("/{brand_id}", response_model=BrandResponse)
async def get_brand(
    brand_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Obtiene una marca por ID."""
    service = BrandService(db)
    brand = await service.get_by_id(brand_id, business_id)
    if not brand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marca no encontrada")
    count = await service.get_product_count(brand_id)
    return _build_brand_response(brand, count)


@router.get("/{brand_id}/products", response_model=PaginatedResponse[BrandProductItem])
async def get_brand_products(
    brand_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Obtiene productos activos de una marca."""
    service = BrandService(db)
    products, total = await service.get_products(brand_id, business_id, page, per_page)
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=[BrandProductItem.model_validate(p) for p in products],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.put("/{brand_id}", response_model=BrandResponse)
async def update_brand(
    brand_id: UUID,
    data: BrandUpdate,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Actualiza una marca existente."""
    service = BrandService(db)
    try:
        brand = await service.update(brand_id, business_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    if not brand:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marca no encontrada")
    count = await service.get_product_count(brand_id)
    return _build_brand_response(brand, count)


@router.delete("/{brand_id}", response_model=MessageResponse)
async def delete_brand(
    brand_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Elimina una marca (soft delete). Bloquea si tiene productos asociados."""
    service = BrandService(db)
    try:
        deleted = await service.soft_delete(brand_id, business_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marca no encontrada")
    return MessageResponse(message="Marca eliminada correctamente")
