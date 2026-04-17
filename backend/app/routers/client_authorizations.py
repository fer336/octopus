"""
Router de autorizaciones titular/subcliente para Cuenta Corriente.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.client_authorization import (
    ClientAuthorizationCreate,
    ClientAuthorizationListParams,
    ClientAuthorizationResponse,
    ClientAuthorizationUpdate,
)
from app.services.client_authorization_service import ClientAuthorizationService
from app.utils.security import get_current_business, require_module_access

router = APIRouter(
    prefix="/client-authorizations",
    tags=["Cuenta Corriente - Autorizaciones"],
    dependencies=[Depends(require_module_access("clients"))],
)


@router.get("", response_model=PaginatedResponse[ClientAuthorizationResponse])
async def list_client_authorizations(
    billing_client_id: Optional[UUID] = Query(None),
    operating_client_id: Optional[UUID] = Query(None),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista autorizaciones titular/subcliente con filtros."""
    service = ClientAuthorizationService(db)
    params = ClientAuthorizationListParams(
        billing_client_id=billing_client_id,
        operating_client_id=operating_client_id,
        is_active=is_active,
        page=page,
        per_page=per_page,
    )
    items, total = await service.list(business_id, params)
    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[ClientAuthorizationResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post(
    "",
    response_model=ClientAuthorizationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_client_authorization(
    data: ClientAuthorizationCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Crea autorización entre cliente titular y subcliente retirador."""
    service = ClientAuthorizationService(db)
    try:
        item = await service.create(business_id, data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e

    return ClientAuthorizationResponse.model_validate(item)


@router.put("/{authorization_id}", response_model=ClientAuthorizationResponse)
async def update_client_authorization(
    authorization_id: UUID,
    data: ClientAuthorizationUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza sublímite/estado/notas de una autorización."""
    service = ClientAuthorizationService(db)
    item = await service.update(authorization_id, business_id, data)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Autorización no encontrada",
        )

    return ClientAuthorizationResponse.model_validate(item)


@router.delete("/{authorization_id}", response_model=MessageResponse)
async def delete_client_authorization(
    authorization_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Elimina (soft delete) una autorización titular/subcliente."""
    service = ClientAuthorizationService(db)
    deleted = await service.soft_delete(authorization_id, business_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Autorización no encontrada",
        )

    return MessageResponse(message="Autorización eliminada correctamente")
