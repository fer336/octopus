"""
Router de Proveedores.
Endpoints para gestión de proveedores.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.supplier import SupplierCreate, SupplierListParams, SupplierResponse, SupplierUpdate
from app.services.supplier_service import SupplierService
from app.utils.security import get_current_business

router = APIRouter(prefix="/suppliers", tags=["Proveedores"])


@router.get("", response_model=PaginatedResponse[SupplierResponse])
async def list_suppliers(
    search: Optional[str] = Query(None, description="Buscar por nombre o CUIT"),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """
    Lista proveedores con paginación y búsqueda.
    Busca en: nombre y CUIT.
    """
    service = SupplierService(db)
    params = SupplierListParams(
        search=search,
        page=page,
        per_page=per_page,
    )

    suppliers, total = await service.list(business_id, params)
    pages = (total + per_page - 1) // per_page if per_page else 0

    # Construir respuesta con category_ids
    items = []
    for s in suppliers:
        response = SupplierResponse.model_validate(s)
        response.category_ids = [cat.id for cat in s.categories]
        items.append(response)

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    data: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """Crea un nuevo proveedor."""
    service = SupplierService(db)
    supplier = await service.create(business_id, data)
    # No acceder a supplier.categories - es lazy loaded y causa error
    return SupplierResponse.model_validate(supplier)


@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """Obtiene un proveedor por ID."""
    service = SupplierService(db)
    supplier = await service.get_by_id(supplier_id, business_id)

    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proveedor no encontrado",
        )

    return SupplierResponse.model_validate(supplier)


@router.put("/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: UUID,
    data: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """Actualiza un proveedor existente."""
    service = SupplierService(db)
    supplier = await service.update(supplier_id, business_id, data)

    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proveedor no encontrado",
        )

    return SupplierResponse.model_validate(supplier)


@router.delete("/{supplier_id}", response_model=MessageResponse)
async def delete_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """Elimina un proveedor (soft delete)."""
    service = SupplierService(db)
    deleted = await service.soft_delete(supplier_id, business_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proveedor no encontrado",
        )

    return MessageResponse(message="Proveedor eliminado correctamente")
