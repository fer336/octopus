"""
Router de Tipos de Cliente.
Endpoints para catálogo de tipos por tenant.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.client_type import (
    ClientTypeCreate,
    ClientTypeListParams,
    ClientTypeResponse,
    ClientTypeUpdate,
)
from app.services.client_type_service import ClientTypeService
from app.utils.security import get_current_business, require_module_access

router = APIRouter(
    prefix="/client-types",
    tags=["Tipos de Cliente"],
    dependencies=[Depends(require_module_access("clients"))],
)


@router.get("", response_model=PaginatedResponse[ClientTypeResponse])
async def list_client_types(
    search: str | None = Query(None, description="Buscar por nombre"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista tipos de cliente del tenant."""
    service = ClientTypeService(db)
    params = ClientTypeListParams(search=search, page=page, per_page=per_page)
    items, total = await service.list(business_id, params)
    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[ClientTypeResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("", response_model=ClientTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_client_type(
    data: ClientTypeCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Crea un tipo de cliente."""
    service = ClientTypeService(db)
    try:
        item = await service.create(business_id, data)
        return ClientTypeResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e


@router.put("/{client_type_id}", response_model=ClientTypeResponse)
async def update_client_type(
    client_type_id: UUID,
    data: ClientTypeUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza un tipo de cliente existente."""
    service = ClientTypeService(db)
    try:
        item = await service.update(client_type_id, business_id, data)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tipo de cliente no encontrado",
            )
        return ClientTypeResponse.model_validate(item)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e


@router.delete("/{client_type_id}", response_model=MessageResponse)
async def delete_client_type(
    client_type_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Elimina (soft delete) un tipo de cliente."""
    service = ClientTypeService(db)
    try:
        deleted = await service.soft_delete(client_type_id, business_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tipo de cliente no encontrado",
        )

    return MessageResponse(message="Tipo de cliente eliminado correctamente")
