"""
Router de Clientes.
Endpoints para gestión de clientes.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.client import ClientCreate, ClientListParams, ClientResponse, ClientUpdate
from app.services.client_service import ClientService
from app.utils.security import get_current_business

router = APIRouter(prefix="/clients", tags=["Clientes"])


@router.get("", response_model=PaginatedResponse[ClientResponse])
async def list_clients(
    search: Optional[str] = Query(None, description="Buscar por nombre o documento"),
    tax_condition: Optional[str] = Query(None, description="Filtrar por condición fiscal"),
    has_balance: Optional[bool] = Query(None, description="Filtrar por saldo pendiente"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Lista clientes con paginación, búsqueda y filtros.
    Busca en: nombre/razón social y número de documento.
    """
    service = ClientService(db)
    params = ClientListParams(
        search=search,
        tax_condition=tax_condition,
        has_balance=has_balance,
        page=page,
        per_page=per_page,
    )

    clients, total = await service.list(business_id, params)
    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[ClientResponse.model_validate(c) for c in clients],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Crea un nuevo cliente."""
    service = ClientService(db)

    # Verificar si el documento ya existe
    existing = await service.get_by_document(data.document_number, business_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un cliente con el documento '{data.document_number}'",
        )

    client = await service.create(business_id, data)
    return ClientResponse.model_validate(client)


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene un cliente por ID."""
    service = ClientService(db)
    client = await service.get_by_id(client_id, business_id)

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado",
        )

    return ClientResponse.model_validate(client)


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: UUID,
    data: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza un cliente existente."""
    service = ClientService(db)
    client = await service.update(client_id, business_id, data)

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado",
        )

    return ClientResponse.model_validate(client)


@router.delete("/{client_id}", response_model=MessageResponse)
async def delete_client(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Elimina un cliente (soft delete)."""
    service = ClientService(db)
    deleted = await service.soft_delete(client_id, business_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado",
        )

    return MessageResponse(message="Cliente eliminado correctamente")
