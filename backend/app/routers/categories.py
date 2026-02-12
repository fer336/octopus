"""
Router de Categorías.
Endpoints para gestión de categorías jerárquicas.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.category import (
    CategoryCreate,
    CategoryListParams,
    CategoryResponse,
    CategoryUpdate,
    CategoryWithChildren,
)
from app.services.category_service import CategoryService
from app.utils.security import get_current_business

router = APIRouter(prefix="/categories", tags=["Categorías"])


@router.get("", response_model=PaginatedResponse[CategoryResponse])
async def list_categories(
    search: Optional[str] = Query(None, description="Buscar por nombre"),
    parent_id: Optional[UUID] = Query(None, description="Filtrar por categoría padre"),
    root_only: bool = Query(False, description="Solo categorías raíz"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """
    Lista categorías con paginación y filtros.
    Use root_only=true para obtener solo categorías principales.
    """
    service = CategoryService(db)
    params = CategoryListParams(
        search=search,
        parent_id=parent_id,
        root_only=root_only,
        page=page,
        per_page=per_page,
    )

    categories, total = await service.list(business_id, params)
    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[CategoryResponse.model_validate(c) for c in categories],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get("/tree", response_model=list[CategoryWithChildren])
async def get_category_tree(
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """
    Obtiene el árbol completo de categorías.
    Útil para selectores y navegación jerárquica.
    """
    service = CategoryService(db)
    categories = await service.get_tree(business_id)

    def build_tree(category) -> CategoryWithChildren:
        return CategoryWithChildren(
            id=category.id,
            created_at=category.created_at,
            updated_at=category.updated_at,
            name=category.name,
            description=category.description,
            parent_id=category.parent_id,
            subcategories=[build_tree(sub) for sub in category.subcategories if not sub.deleted_at],
        )

    return [build_tree(c) for c in categories]


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """Crea una nueva categoría."""
    service = CategoryService(db)

    try:
        category = await service.create(business_id, data)
        return CategoryResponse.model_validate(category)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """Obtiene una categoría por ID."""
    service = CategoryService(db)
    category = await service.get_by_id(category_id, business_id)

    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Categoría no encontrada",
        )

    return CategoryResponse.model_validate(category)


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: UUID,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """Actualiza una categoría existente."""
    service = CategoryService(db)

    try:
        category = await service.update(category_id, business_id, data)
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Categoría no encontrada",
            )
        return CategoryResponse.model_validate(category)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.delete("/{category_id}", response_model=MessageResponse)
async def delete_category(
    category_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """
    Elimina una categoría (soft delete).
    También elimina las subcategorías asociadas.
    """
    service = CategoryService(db)
    deleted = await service.soft_delete(category_id, business_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Categoría no encontrada",
        )

    return MessageResponse(message="Categoría eliminada correctamente")
