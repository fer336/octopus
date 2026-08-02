"""
Router de Facturas de Compra (Compras — carga manual e IA).

Solo orquesta HTTP: la escritura de stock (ProductLot) y precios
(PriceHistory) vive exclusivamente en los servicios (PurchaseInvoiceService,
InvoiceReversalService, InvoiceAIService), nunca acá.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.purchase_invoice import PurchaseInvoiceSource, PurchaseInvoiceStatus
from app.schemas.base import PaginatedResponse
from app.schemas.purchase_invoice import (
    DuplicateWarning,
    PurchaseInvoiceConfirmRequest,
    PurchaseInvoiceCreate,
    PurchaseInvoiceListItem,
    PurchaseInvoiceResponse,
    PurchaseInvoiceReversalRequest,
    PurchaseInvoiceUpdate,
    ReversalConflictItem,
)
from app.services.invoice_ai_service import InvoiceAIParseError, InvoiceAIService
from app.services.invoice_reversal_service import (
    InvoiceReversalConflictError,
    InvoiceReversalService,
)
from app.services.purchase_invoice_service import PurchaseInvoiceService
from app.utils.security import (
    get_current_business,
    get_current_user,
    require_module_access,
)

router = APIRouter(
    prefix="/purchase-invoices",
    tags=["Facturas de Compra"],
    dependencies=[Depends(require_module_access("purchases"))],
)


async def _attach_duplicate_warning(
    db: AsyncSession, invoice, is_duplicate: bool, business_id: UUID
) -> None:
    """`create_draft`/`create_draft_from_pdf` solo informan un bool — acá se
    resuelve la factura original para que el frontend pueda linkearla."""
    if not is_duplicate:
        return
    existing = await PurchaseInvoiceService(db).check_duplicate(
        business_id, invoice.supplier_id, invoice.invoice_number, exclude_id=invoice.id
    )
    invoice.duplicate_warning = DuplicateWarning(
        is_duplicate=True,
        existing_invoice_id=existing.id if existing else None,
        existing_invoice_status=existing.status if existing else None,
    )


# ---------------------------------------------------------------------------
# Extracción IA (PDF → borrador) — declarada antes de "/{invoice_id}" para
# que FastAPI no intente parsear "ai-extract" como UUID.
# ---------------------------------------------------------------------------


@router.post(
    "/ai-extract",
    response_model=PurchaseInvoiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ai_extract_purchase_invoice(
    file: UploadFile = File(..., description="Factura de proveedor en PDF"),
    source_document_key: str | None = Form(None, description="Clave del PDF en MinIO"),
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Extrae una factura de un PDF vía IA y crea un borrador editable
    (`source=ai`). Nunca impacta stock/precios — eso ocurre recién al
    confirmar, con revisión humana previa.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un PDF",
        )

    file_bytes = await file.read()
    service = InvoiceAIService(db)

    try:
        invoice, is_duplicate = await service.create_draft_from_pdf(
            business_id=current_business,
            user_id=current_user.id,
            pdf_bytes=file_bytes,
            source_document_key=source_document_key,
        )
    except InvoiceAIParseError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    await _attach_duplicate_warning(db, invoice, is_duplicate, current_business)
    return invoice


# ---------------------------------------------------------------------------
# CRUD borrador
# ---------------------------------------------------------------------------


@router.post(
    "", response_model=PurchaseInvoiceResponse, status_code=status.HTTP_201_CREATED
)
async def create_purchase_invoice(
    data: PurchaseInvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Crea una factura de compra en estado borrador (carga manual)."""
    service = PurchaseInvoiceService(db)
    invoice, is_duplicate = await service.create_draft(
        business_id=current_business,
        user_id=current_user.id,
        data=data,
        source=PurchaseInvoiceSource.MANUAL,
    )
    await _attach_duplicate_warning(db, invoice, is_duplicate, current_business)
    return invoice


@router.get("", response_model=PaginatedResponse[PurchaseInvoiceListItem])
async def list_purchase_invoices(
    status_filter: PurchaseInvoiceStatus | None = Query(None, alias="status"),
    source: PurchaseInvoiceSource | None = Query(None),
    supplier_id: UUID | None = Query(None),
    search: str | None = Query(None, description="Búsqueda por número de factura"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Lista/historial de facturas de compra con filtros y paginación."""
    service = PurchaseInvoiceService(db)
    result = await service.list(
        business_id=current_business,
        status=status_filter,
        source=source,
        supplier_id=supplier_id,
        search=search,
        page=page,
        per_page=per_page,
    )
    return result


@router.get("/{invoice_id}", response_model=PurchaseInvoiceResponse)
async def get_purchase_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Obtiene el detalle completo de una factura de compra."""
    service = PurchaseInvoiceService(db)
    invoice = await service.get_by_id(invoice_id, current_business)
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Factura de compra no encontrada",
        )
    return invoice


@router.put("/{invoice_id}", response_model=PurchaseInvoiceResponse)
async def update_purchase_invoice(
    invoice_id: UUID,
    data: PurchaseInvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Edita una factura en estado borrador (no se pueden editar confirmadas por acá)."""
    service = PurchaseInvoiceService(db)
    try:
        invoice = await service.update_draft(invoice_id, current_business, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Factura de compra no encontrada",
        )
    return invoice


# ---------------------------------------------------------------------------
# Confirmación (draft → confirmed, atómica)
# ---------------------------------------------------------------------------


@router.post("/{invoice_id}/confirm", response_model=PurchaseInvoiceResponse)
async def confirm_purchase_invoice(
    invoice_id: UUID,
    data: PurchaseInvoiceConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Confirma una factura de compra: crea lotes (`update_stock`) y/o
    actualiza precios (`update_prices`) en una única transacción atómica.
    """
    service = PurchaseInvoiceService(db)

    invoice = await service.get_by_id(invoice_id, current_business)
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Factura de compra no encontrada",
        )

    try:
        invoice = await service.confirm(
            invoice_id, current_business, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return invoice


# ---------------------------------------------------------------------------
# Edición post-confirmación (reversión + recálculo)
# ---------------------------------------------------------------------------


@router.post("/{invoice_id}/edit-confirmed", response_model=PurchaseInvoiceResponse)
async def edit_confirmed_purchase_invoice(
    invoice_id: UUID,
    data: PurchaseInvoiceReversalRequest,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Edita una factura YA CONFIRMADA, revirtiendo/recalculando lotes y
    precios. Si algún lote generado ya fue consumido (parcial o
    totalmente) y `force_adjustment` no vino en True, devuelve 409 con el
    detalle del conflicto para que el frontend pida confirmación explícita.
    """
    invoice_service = PurchaseInvoiceService(db)
    invoice = await invoice_service.get_by_id(invoice_id, current_business)
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Factura de compra no encontrada",
        )

    reversal_service = InvoiceReversalService(db)
    try:
        invoice = await reversal_service.edit_confirmed(
            invoice_id, current_business, current_user.id, data
        )
    except InvoiceReversalConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": str(e),
                "conflicts": [
                    ReversalConflictItem(
                        lot_id=c.lot_id,
                        product_id=c.product_id,
                        initial_quantity=c.initial_quantity,
                        remaining_quantity=c.remaining_quantity,
                        consumed_quantity=c.consumed_quantity,
                    ).model_dump(mode="json")
                    for c in e.conflicts
                ],
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return invoice
