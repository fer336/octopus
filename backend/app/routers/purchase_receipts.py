"""
Router de Remitos de Proveedor (Compras — recepción de mercadería).

Solo orquesta HTTP: la escritura de stock (ProductLot) vive exclusivamente
en `PurchaseReceiptService`, nunca acá.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.purchase_receipt import PurchaseReceiptStatus
from app.schemas.base import PaginatedResponse
from app.schemas.purchase_receipt import (
    PurchaseReceiptConfirmRequest,
    PurchaseReceiptCreate,
    PurchaseReceiptListItem,
    PurchaseReceiptResponse,
    PurchaseReceiptUpdate,
)
from app.services.purchase_receipt_service import PurchaseReceiptService
from app.utils.security import (
    get_current_business,
    get_current_user,
    require_module_access,
)

router = APIRouter(
    prefix="/purchase-receipts",
    tags=["Remitos de Proveedor"],
    dependencies=[Depends(require_module_access("purchases"))],
)


# ---------------------------------------------------------------------------
# CRUD borrador
# ---------------------------------------------------------------------------


@router.post(
    "", response_model=PurchaseReceiptResponse, status_code=status.HTTP_201_CREATED
)
async def create_purchase_receipt(
    data: PurchaseReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Crea un remito de proveedor en estado borrador."""
    service = PurchaseReceiptService(db)
    receipt = await service.create_draft(
        business_id=current_business,
        user_id=current_user.id,
        data=data,
    )
    return receipt


@router.get("", response_model=PaginatedResponse[PurchaseReceiptListItem])
async def list_purchase_receipts(
    status_filter: PurchaseReceiptStatus | None = Query(None, alias="status"),
    supplier_id: UUID | None = Query(None),
    pending_link: bool | None = Query(
        None, description="Filtra remitos confirmados sin factura vinculada"
    ),
    search: str | None = Query(None, description="Búsqueda por número de remito"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Lista/historial de remitos de proveedor con filtros y paginación."""
    service = PurchaseReceiptService(db)
    result = await service.list(
        business_id=current_business,
        status=status_filter,
        supplier_id=supplier_id,
        pending_link=pending_link,
        search=search,
        page=page,
        per_page=per_page,
    )
    return result


@router.get("/{receipt_id}", response_model=PurchaseReceiptResponse)
async def get_purchase_receipt(
    receipt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Obtiene el detalle completo de un remito de proveedor."""
    service = PurchaseReceiptService(db)
    receipt = await service.get_by_id(receipt_id, current_business)
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remito de proveedor no encontrado",
        )
    return receipt


@router.put("/{receipt_id}", response_model=PurchaseReceiptResponse)
async def update_purchase_receipt(
    receipt_id: UUID,
    data: PurchaseReceiptUpdate,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Edita un remito en estado borrador (no se pueden editar confirmados por acá)."""
    service = PurchaseReceiptService(db)
    try:
        receipt = await service.update_draft(receipt_id, current_business, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remito de proveedor no encontrado",
        )
    return receipt


# ---------------------------------------------------------------------------
# Confirmación (draft → confirmed, atómica)
# ---------------------------------------------------------------------------


@router.post("/{receipt_id}/confirm", response_model=PurchaseReceiptResponse)
async def confirm_purchase_receipt(
    receipt_id: UUID,
    data: PurchaseReceiptConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Confirma un remito: crea lotes (`update_stock`) en una única transacción
    atómica, con `received_date` real del remito y sin costo (el costo lo
    completa la factura del proveedor cuando se vincule).
    """
    service = PurchaseReceiptService(db)

    receipt = await service.get_by_id(receipt_id, current_business)
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Remito de proveedor no encontrado",
        )

    try:
        receipt = await service.confirm(
            receipt_id, current_business, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return receipt
