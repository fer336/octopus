"""Router de Marcas."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.brand import BrandCreate, BrandListParams, BrandResponse, BrandUpdate
from app.services.brand_service import BrandService
from app.utils.security import get_current_business, require_module_access

router = APIRouter(
    prefix="/brands",
    tags=["Marcas"],
    dependencies=[Depends(require_module_access("products"))],
)


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
    brands, total = await service.list(business_id, params)
    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=[BrandResponse.model_validate(brand) for brand in brands],
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
    return BrandResponse.model_validate(brand)


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
    return BrandResponse.model_validate(brand)


@router.delete("/{brand_id}", response_model=MessageResponse)
async def delete_brand(
    brand_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Elimina una marca (soft delete)."""
    service = BrandService(db)
    deleted = await service.soft_delete(brand_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marca no encontrada")
    return MessageResponse(message="Marca eliminada correctamente")
