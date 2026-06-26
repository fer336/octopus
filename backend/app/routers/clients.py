"""
Router de Clientes.
Endpoints para gestión de clientes.
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business import Business
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.client import (
    ClientCreate,
    ClientListParams,
    ClientResponse,
    ClientUpdate,
)
from app.schemas.profitability import AccountSummary
from app.services.afip_sdk_service import AfipSdkService
from app.services.client_service import ClientService
from app.services.profitability_service import ProfitabilityService
from app.utils.security import get_current_business, require_module_access

router = APIRouter(
    prefix="/clients",
    tags=["Clientes"],
    dependencies=[Depends(require_module_access("clients"))],
)


@router.get("/lookup-cuit/{cuit}")
async def lookup_cuit(
    cuit: str,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Busca los datos de un contribuyente en el padrón de AFIP por CUIT.
    Requiere que el negocio tenga configurado el Afip SDK.
    """
    business = await db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    afip_service = AfipSdkService(business)
    result = await afip_service.get_taxpayer_details(cuit)

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=result["error"]
        )

    return result["data"]


@router.get("", response_model=PaginatedResponse[ClientResponse])
async def list_clients(
    search: str | None = Query(None, description="Buscar por nombre o documento"),
    tax_condition: str | None = Query(
        None, description="Filtrar por condición fiscal"
    ),
    client_type_id: UUID | None = Query(
        None, description="Filtrar por tipo de cliente"
    ),
    current_account_mode: Literal["disabled", "limited", "unlimited"] | None = Query(
        None,
        description="Filtrar por modo de cuenta corriente del cliente",
    ),
    has_balance: bool | None = Query(
        None, description="Filtrar por saldo pendiente"
    ),
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
        client_type_id=client_type_id,
        current_account_mode=current_account_mode,
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

    try:
        client = await service.create(business_id, data)
        return ClientResponse.model_validate(client)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


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


@router.get(
    "/{client_id}/account-summary",
    response_model=AccountSummary,
    dependencies=[Depends(require_module_access("profitability"))],
)
async def get_client_account_summary(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Resumen de cuenta corriente de un cliente.
    Incluye deuda total, vencido, pagado este mes, saldo y antigüedad.
    """
    service = ProfitabilityService(db)
    try:
        summary = await service.get_account_summary(client_id, business_id)
        return summary
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e


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
