"""
Router de Comprobantes.
"""

from typing import Optional
from uuid import UUID
import io
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.voucher import Voucher, VoucherType, VoucherStatus
from app.models.business import Business
from app.models.client import Client
from app.models.audit_log import AuditLog
from app.schemas.base import PaginatedResponse
from app.schemas.voucher import (
    CurrentAccountCloseRequest,
    CurrentAccountClosePreviewRequest,
    CurrentAccountClosePreviewResponse,
    CurrentAccountCloseHistoryResponse,
    VoucherCreate,
    VoucherUpdate,
    VoucherResponse,
    ConvertQuotationToInvoice,
    CompileToInvoiceRequest,
    CompilePreviewRequest,
    CompilePreviewResponse,
    VoucherAuditLogResponse,
    SourceQuotationResponse,
)
from app.schemas.credit_note import CreditNoteCreate
from app.schemas.voucher import CurrentAccountCloseHistoryResponse
from app.services.voucher_service import VoucherService
from app.services.afip_sdk_service import AfipSdkService
from app.services.cash_register_service import get_open_cash_register
from app.utils.security import (
    get_current_business,
    get_current_user,
    require_module_access,
)
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

# Tipos de comprobante que requieren caja abierta para emitirse
INVOICE_TYPES = {VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C}
RECEIPT_TYPES = {VoucherType.RECEIPT}

router = APIRouter(
    prefix="/vouchers",
    tags=["Ventas"],
    dependencies=[Depends(require_module_access("vouchers"))],
)


async def _log_audit(
    db: AsyncSession,
    user_id,
    business_id,
    action: str,
    resource_type: str,
    resource_id=None,
    details: dict | None = None,
):
    """Log audit entry — separate commit so it never breaks the main operation."""
    try:
        audit_log = AuditLog(
            user_id=user_id,
            business_id=business_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        )
        db.add(audit_log)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


async def _get_business_or_404(db: AsyncSession, business_id: UUID) -> Business:
    """Obtiene negocio por id o lanza 404."""
    result = await db.execute(
        select(Business).where(
            Business.id == business_id,
            Business.deleted_at.is_(None),
        )
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Negocio no encontrado",
        )
    return business


async def _ensure_voucher_type_feature_enabled(
    db: AsyncSession,
    business_id: UUID,
    voucher_type: VoucherType,
) -> None:
    """Valida feature flags de Facturación/Remitos por tipo de comprobante."""
    business = await _get_business_or_404(db, business_id)

    if voucher_type in INVOICE_TYPES and not bool(business.invoicing_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Facturación deshabilitada para este tenant desde CMS.",
        )

    if voucher_type in RECEIPT_TYPES and not bool(business.receipts_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Remitos deshabilitados para este tenant desde CMS.",
        )


async def _ensure_invoicing_enabled(db: AsyncSession, business_id: UUID) -> None:
    """Valida que la funcionalidad de facturación esté activa para el tenant."""
    business = await _get_business_or_404(db, business_id)
    if not bool(business.invoicing_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Facturación deshabilitada para este tenant desde CMS.",
        )


def _voucher_snapshot(voucher: Voucher) -> dict:
    """Construye snapshot compacto para auditoría before/after."""
    return {
        "id": str(voucher.id),
        "voucher_type": voucher.voucher_type.value if voucher.voucher_type else None,
        "number": f"{voucher.sale_point}-{voucher.number}",
        "client_id": str(voucher.client_id) if voucher.client_id else None,
        "billing_client_id": (
            str(voucher.billing_client_id)
            if getattr(voucher, "billing_client_id", None)
            else None
        ),
        "operating_client_id": (
            str(voucher.operating_client_id)
            if getattr(voucher, "operating_client_id", None)
            else None
        ),
        "is_current_account": bool(getattr(voucher, "is_current_account", False)),
        "is_current_account_closure": bool(
            getattr(voucher, "is_current_account_closure", False)
        ),
        "date": str(voucher.date) if voucher.date else None,
        "notes": voucher.notes,
        "subtotal": str(voucher.subtotal),
        "iva_amount": str(voucher.iva_amount),
        "total": str(voucher.total),
        "items": [
            {
                "product_id": str(item.product_id),
                "code": item.code,
                "description": item.description,
                "quantity": str(item.quantity),
                "unit_price": str(item.unit_price),
                "discount_percent": str(item.discount_percent),
                "subtotal": str(item.subtotal),
                "total": str(item.total),
            }
            for item in (voucher.items or [])
        ],
    }


@router.get("", response_model=PaginatedResponse[VoucherResponse])
async def list_vouchers(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    voucher_type: Optional[VoucherType] = Query(default=None),
    status: Optional[VoucherStatus] = Query(default=None),
    payment_method_id: Optional[UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista comprobantes con filtros y paginación."""
    service = VoucherService(db)
    vouchers, total = await service.list(
        business_id=business_id,
        page=page,
        per_page=per_page,
        search=search,
        voucher_type=voucher_type,
        status=status,
        payment_method_id=payment_method_id,
    )

    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[VoucherResponse.model_validate(v) for v in vouchers],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("", response_model=VoucherResponse, status_code=status.HTTP_201_CREATED)
async def create_voucher(
    data: VoucherCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Crea un nuevo comprobante (Cotización, Remito, Factura).
    Calcula totales y descuenta stock si corresponde.
    Las facturas (A, B, C) requieren que haya una caja abierta.
    """
    await _ensure_voucher_type_feature_enabled(db, business_id, data.voucher_type)

    # Validar caja abierta para facturas
    if data.voucher_type in INVOICE_TYPES:
        open_register = await get_open_cash_register(db, business_id)
        if not open_register:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay una caja abierta. Debe abrir la caja antes de emitir facturas.",
            )

    service = VoucherService(db)
    try:
        voucher = await service.create(business_id, data, current_user.id)

        await _log_audit(
            db=db,
            user_id=current_user.id,
            business_id=business_id,
            action="create",
            resource_type="voucher",
            resource_id=voucher.id,
            details={
                "description": f"Comprobante creado: {voucher.voucher_type.value}",
                "client_id": str(voucher.client_id) if voucher.client_id else None,
            },
        )

        return VoucherResponse.model_validate(voucher)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/audit/recent", response_model=PaginatedResponse[VoucherAuditLogResponse])
async def list_recent_voucher_audit_logs(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    action: Optional[str] = Query(
        default=None,
        description="Filtrar por acción específica (ej: update, delete)",
    ),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista auditoría reciente de comprobantes (cambios y eliminaciones)."""
    allowed_actions = ["update", "delete"]
    if action:
        normalized_action = action.strip().lower()
        if normalized_action not in allowed_actions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Acción inválida. Valores permitidos: update, delete",
            )
        allowed_actions = [normalized_action]

    base_conditions = [
        AuditLog.business_id == business_id,
        AuditLog.resource_type == "voucher",
        AuditLog.action.in_(allowed_actions),
    ]

    count_query = select(func.count(AuditLog.id)).where(*base_conditions)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    query = (
        select(AuditLog)
        .where(*base_conditions)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(query)
    rows = list(result.scalars().all())

    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[VoucherAuditLogResponse.model_validate(row) for row in rows],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.put("/{voucher_id}", response_model=VoucherResponse)
async def update_voucher(
    voucher_id: UUID,
    data: VoucherUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Actualiza una cotización existente."""
    service = VoucherService(db)
    try:
        before_voucher = await service.get_by_id(voucher_id, business_id)
        if not before_voucher:
            raise ValueError("Comprobante no encontrado")

        voucher = await service.update_quotation(
            voucher_id=voucher_id,
            business_id=business_id,
            data=data,
        )

        await _log_audit(
            db=db,
            user_id=current_user.id,
            business_id=business_id,
            action="update",
            resource_type="voucher",
            resource_id=voucher.id,
            details={
                "description": "Cotización actualizada",
                "client_id": str(voucher.client_id) if voucher.client_id else None,
                "before": _voucher_snapshot(before_voucher),
                "after": _voucher_snapshot(voucher),
            },
        )

        return VoucherResponse.model_validate(voucher)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/by-code/{code}")
async def get_voucher_by_code(
    code: str,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Obtiene un comprobante por código (formato: sale_point-number, ej: "0001-00000001").
    Solo retorna cotizaciones (presupuestos) que no hayan sido facturadas.
    Útil para autocompletar la tabla de productos al crear una nueva venta.
    """
    service = VoucherService(db)
    voucher = await service.get_by_code(code, business_id)

    if not voucher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cotización no encontrada",
        )

    # Verificar si ya fue facturada
    if voucher.invoiced_voucher_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La cotización ya fue convertida a factura",
        )

    return VoucherResponse.model_validate(voucher)


@router.get("/by-code/{code}/check-prices")
async def check_voucher_prices(
    code: str,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Compara precios de una cotización con el catálogo actual.
    Devuelve diferencias para que el frontend pueda preguntar al usuario
    si quiere actualizar precios al cargar la cotización.
    """
    from decimal import Decimal as D

    from app.models.product import Product
    from app.models.voucher import VoucherType
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    service = VoucherService(db)
    voucher = await service.get_by_code(code, business_id)

    if not voucher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cotización no encontrada",
        )

    if voucher.voucher_type != VoucherType.QUOTATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El código no corresponde a una cotización/presupuesto",
        )

    if voucher.invoiced_voucher_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta cotización ya fue convertida a factura",
        )

    # Compare each item's price with current catalog price
    differences = []
    for item in voucher.items:
        product = await db.get(Product, item.product_id)
        if not product or product.business_id != business_id:
            continue

        old_price = D(str(item.unit_price))
        current_price = D(str(product.sale_price))

        if old_price != current_price:
            diff_pct = D("0")
            if old_price > 0:
                diff_pct = ((current_price - old_price) / old_price * D("100")).quantize(D("0.01"))

            differences.append({
                "product_id": str(item.product_id),
                "product_name": product.description,
                "code": item.code,
                "old_price": old_price,
                "current_price": current_price,
                "difference_percent": diff_pct,
            })

    return {
        "has_differences": len(differences) > 0,
        "differences": differences,
        "affected_items": len(differences),
        "total_items": len(voucher.items),
    }


@router.get("/{voucher_id}/pdf")
async def get_voucher_pdf(
    voucher_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Genera y devuelve el PDF inline de un comprobante."""
    service = VoucherService(db)
    try:
        pdf_bytes = await service.generate_pdf(voucher_id, business_id)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=voucher_{voucher_id}.pdf"
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.exception("Error al generar PDF para voucher %s", voucher_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar PDF: {str(e)}",
        )


@router.delete("/{voucher_id}/delete")
async def delete_voucher(
    voucher_id: UUID,
    reason: Optional[str] = Query(default=None, description="Motivo de eliminación"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Elimina un comprobante (soft delete con auditoría).
    El registro queda marcado como eliminado pero visible en el historial.
    """
    service = VoucherService(db)
    before_voucher = await service.get_by_id(voucher_id, business_id)
    if not before_voucher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comprobante no encontrado"
        )

    try:
        success = await service.soft_delete(
            voucher_id, business_id, current_user.id, reason
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comprobante no encontrado"
        )

    await _log_audit(
        db=db,
        user_id=current_user.id,
        business_id=business_id,
        action="delete",
        resource_type="voucher",
        resource_id=voucher_id,
        details={
            "description": "Comprobante eliminado",
            "reason": reason,
            "before": _voucher_snapshot(before_voucher),
        },
    )

    return {"message": "Comprobante eliminado correctamente"}


@router.get("/pending-quotations", response_model=PaginatedResponse[VoucherResponse])
async def list_pending_quotations(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=100, ge=1, le=200),
    search: Optional[str] = Query(default=None),
    voucher_type: Optional[VoucherType] = Query(
        default=None, description="Filtrar por tipo: quotation o receipt"
    ),
    date_from: Optional[str] = Query(
        default=None, description="Fecha desde (YYYY-MM-DD)"
    ),
    date_to: Optional[str] = Query(
        default=None, description="Fecha hasta (YYYY-MM-DD)"
    ),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Lista las cotizaciones y remitos pendientes de facturar.

    Retorna comprobantes (cotización o remito) que:
    - No tienen factura asociada (invoiced_voucher_id es NULL)
    - No están eliminados

    Filtros disponibles: tipo (quotation/receipt), fecha desde/hasta, texto de búsqueda.
    """
    service = VoucherService(db)
    vouchers, total = await service.list_pending_quotations(
        business_id=business_id,
        page=page,
        per_page=per_page,
        search=search,
        voucher_type=voucher_type,
        date_from=date_from,
        date_to=date_to,
    )

    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[VoucherResponse.model_validate(v) for v in vouchers],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post(
    "/current-account/close",
    response_model=VoucherResponse,
    status_code=status.HTTP_201_CREATED,
)
async def close_current_account(
    data: CurrentAccountCloseRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Cierra cuenta corriente creando comprobante pendiente de facturación."""
    service = VoucherService(db)
    try:
        closure_voucher = await service.close_current_account(
            business_id=business_id,
            billing_client_id=data.billing_client_id,
            receipt_ids=data.receipt_ids,
            close_all=data.close_all,
            notes=data.notes,
            user_id=current_user.id,
        )

        await _log_audit(
            db=db,
            user_id=current_user.id,
            business_id=business_id,
            action="create",
            resource_type="voucher",
            resource_id=closure_voucher.id,
            details={
                "description": "Cierre de cuenta corriente generado",
                "billing_client_id": str(data.billing_client_id),
                "close_all": data.close_all,
                "receipt_ids": [str(rid) for rid in (data.receipt_ids or [])],
            },
        )

        return VoucherResponse.model_validate(closure_voucher)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/current-account/preview",
    response_model=CurrentAccountClosePreviewResponse,
)
async def preview_current_account_close(
    data: CurrentAccountClosePreviewRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Previsualiza un cierre de cuenta corriente sin persistir nada."""
    service = VoucherService(db)
    try:
        preview = await service.preview_current_account_close(
            business_id=business_id,
            billing_client_id=data.billing_client_id,
            receipt_ids=data.receipt_ids,
            close_all=data.close_all,
            notes=data.notes,
        )
        return preview
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/current-account/preview-pdf",
)
async def preview_current_account_close_pdf(
    data: CurrentAccountClosePreviewRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Genera PDF de preview de cierre sin persistir nada."""
    from fastapi.responses import Response

    service = VoucherService(db)
    try:
        preview = await service.preview_current_account_close(
            business_id=business_id,
            billing_client_id=data.billing_client_id,
            receipt_ids=data.receipt_ids,
            close_all=data.close_all,
            notes=data.notes,
        )
        # Generar PDF del preview
        business = await service.db.get(Business, business_id)

        # Obtener client
        from app.models.client import Client

        client_result = await db.execute(
            select(Client).where(Client.id == data.billing_client_id)
        )
        client = client_result.scalar_one_or_none()

        # Formatear items como en el cierre
        flat_items = []
        for item in preview.items:
            flat_items.append(
                {
                    "receipt_number": item.receipt_number,
                    "description": item.description,
                    "quantity": item.quantity,
                    "discount_percent": float(item.discount_percent),
                    "general_discount": float(item.general_discount)
                    if item.general_discount
                    else 0,
                    "unit_price": float(item.unit_price),
                    "subtotal": float(item.subtotal),
                }
            )

        from app.services.pdf_service import pdf_service

        from datetime import datetime

        # Contar remitos únicos
        unique_receipts = len(set(item.receipt_number for item in preview.items))

        context = {
            "business": {
                "name": business.name if business else "",
                "address": business.address if business else "",
                "city": business.city if business else "",
                "province": business.province if business else "",
                "phone": business.phone if business else "",
                "email": business.email if business else "",
                "cuit": business.cuit if business else "",
                "tax_condition": business.tax_condition if business else "",
            },
            "client": {
                "name": client.name if client else preview.billing_client_name,
                "document_number": client.document_number if client else "",
            },
            "voucher": {
                "number": "PREVIEW",
                "date": datetime.now().strftime("%d/%m/%Y"),
                "notes": data.notes or "",
            },
            "total_receipts": unique_receipts,
            "items": flat_items,
            "totals": {
                "subtotal": f"{float(preview.subtotal):,.2f}",
                "iva": f"{float(preview.iva_amount):,.2f}",
                "total": f"{float(preview.total):,.2f}",
            },
            "generated_at": datetime.now().strftime("%d/%m/%Y"),
        }

        pdf_bytes = pdf_service.generate_closure_pdf(context)

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=cierre_preview_{preview.billing_client_name.replace(' ', '_')}.pdf"
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/current-account/receipts",
    response_model=PaginatedResponse[VoucherResponse],
)
async def list_current_account_receipts(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=100, ge=1, le=300),
    billing_client_id: Optional[UUID] = Query(
        default=None,
        description="Filtrar por cliente titular",
    ),
    pending_only: Optional[bool] = Query(
        default=None,
        description="True: solo pendientes, False: solo cerrados, None: todos",
    ),
    search: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista remitos de Cuenta Corriente para control previo al cierre."""
    service = VoucherService(db)
    vouchers, total = await service.list_current_account_receipts(
        business_id=business_id,
        page=page,
        per_page=per_page,
        billing_client_id=billing_client_id,
        pending_only=pending_only,
        search=search,
    )

    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=[VoucherResponse.model_validate(v) for v in vouchers],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.get(
    "/current-account/history/{billing_client_id}",
    response_model=CurrentAccountCloseHistoryResponse,
)
async def get_current_account_history(
    billing_client_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene el historial de cierres de cuenta corriente por cliente titular."""
    service = VoucherService(db)
    return await service.get_current_account_closure_history(
        business_id=business_id,
        billing_client_id=billing_client_id,
    )


@router.post(
    "/{quotation_id}/convert-to-invoice",
    response_model=VoucherResponse,
    status_code=status.HTTP_201_CREATED,
)
async def convert_quotation_to_invoice(
    quotation_id: UUID,
    data: ConvertQuotationToInvoice,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Convierte una cotización en factura electrónica.

    - Crea una nueva factura con los mismos items de la cotización.
    - Marca la cotización como 'facturada' (irreversible sin Nota de Crédito).
    - El tipo de factura (A o B) se determina automáticamente según la condición fiscal del cliente.
    - Para revertir: emitir una Nota de Crédito Fiscal desde la factura generada.
    - Requiere caja abierta.
    """
    await _ensure_invoicing_enabled(db, business_id)

    # Validar caja abierta antes de convertir
    open_register = await get_open_cash_register(db, business_id)
    if not open_register:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay una caja abierta. Debe abrir la caja antes de emitir facturas.",
        )

    service = VoucherService(db)
    try:
        payments_raw = None
        if data.payments:
            payments_raw = [p.model_dump() for p in data.payments]

        invoice = await service.convert_quotation_to_invoice(
            business_id=business_id,
            quotation_id=quotation_id,
            payments=payments_raw,
            fiscal_client_id=data.fiscal_client_id,
            user_id=current_user.id,
            price_strategy=data.price_strategy,
        )

        await _log_audit(
            db=db,
            user_id=current_user.id,
            business_id=business_id,
            action="create",
            resource_type="voucher",
            resource_id=invoice.id,
            details={
                "description": f"Cotización convertida a factura: {quotation_id} -> {invoice.id}",
                "quotation_id": str(quotation_id),
                "fiscal_client_id": (
                    str(data.fiscal_client_id) if data.fiscal_client_id else None
                ),
                "price_strategy": data.price_strategy,
            },
        )

        return VoucherResponse.model_validate(invoice)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al convertir cotización: {str(e)}",
        )


@router.post(
    "/compile-to-invoice/preview",
    response_model=CompilePreviewResponse,
)
async def preview_compile_totals(
    data: CompilePreviewRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Previsualiza los totales de una compilación sin crear la factura.
    Calcula subtotal, IVA y total según la estrategia de precios elegida.
    Útil para que el frontend muestre el total correcto antes de confirmar.
    """
    from decimal import Decimal as D
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.product import Product
    from app.models.voucher import Voucher as VoucherModel, VoucherType

    if not data.quotation_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere al menos un comprobante",
        )

    # Fetch all source vouchers with items
    result = await db.execute(
        select(VoucherModel)
        .options(selectinload(VoucherModel.items))
        .where(
            VoucherModel.id.in_(data.quotation_ids),
            VoucherModel.business_id == business_id,
            VoucherModel.deleted_at.is_(None),
        )
    )
    source_vouchers = result.scalars().all()

    if len(source_vouchers) != len(data.quotation_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uno o más comprobantes no encontrados",
        )

    # Validate all are quotation or receipt
    for v in source_vouchers:
        if v.voucher_type not in (VoucherType.QUOTATION, VoucherType.RECEIPT):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El comprobante {v.full_number} no es una cotización ni remito",
            )
        if v.invoiced_voucher_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El comprobante {v.full_number} ya fue facturado",
            )

    # Check same client
    client_ids = set(v.client_id for v in source_vouchers)
    if len(client_ids) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Todos los comprobantes deben pertenecer al mismo cliente",
        )

    # Calculate totals using the same logic as _build_invoice_items_from_source_vouchers
    total_subtotal = D("0")
    total_iva = D("0")
    total_final = D("0")
    item_count = 0

    invoice_discount_factor = D("1") - (D(str(data.general_discount or D("0"))) / D("100"))

    for source_voucher in source_vouchers:
        source_general_discount = D(str(source_voucher.general_discount or D("0")))
        source_discount_factor = D("1") - (source_general_discount / D("100"))

        for source_item in source_voucher.items:
            product = await db.get(Product, source_item.product_id)
            if not product or product.business_id != business_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Producto {source_item.product_id} no encontrado",
                )

            # Resolve price based on strategy
            if data.price_strategy == "historical":
                unit_price = D(str(source_item.unit_price))
                iva_rate = D(str(source_item.iva_rate))
            else:
                unit_price = D(str(product.sale_price))
                iva_rate = D(str(product.iva_rate))

            item_discount_factor = D("1") - (D(str(source_item.discount_percent)) / D("100"))

            subtotal_line = (
                unit_price
                * D(str(source_item.quantity))
                * item_discount_factor
                * source_discount_factor
                * invoice_discount_factor
            )
            iva_line = subtotal_line * (iva_rate / D("100"))
            total_line = subtotal_line + iva_line

            # Round each line
            subtotal_line = subtotal_line.quantize(D("0.01"))
            iva_line = iva_line.quantize(D("0.01"))
            total_line = total_line.quantize(D("0.01"))

            total_subtotal += subtotal_line
            total_iva += iva_line
            total_final += total_line
            item_count += 1

    # Round totals
    total_subtotal = total_subtotal.quantize(D("0.01"))
    total_iva = total_iva.quantize(D("0.01"))
    total_final = total_final.quantize(D("0.01"))

    discount_amount = (
        sum(D(str(v.total)) for v in source_vouchers) - total_final
        if data.general_discount > 0
        else D("0")
    )

    return CompilePreviewResponse(
        subtotal=total_subtotal,
        iva_amount=total_iva,
        total=total_final,
        discount_amount=discount_amount.quantize(D("0.01")),
        voucher_count=len(source_vouchers),
        item_count=item_count,
    )


@router.post(
    "/compile-to-invoice",
    response_model=VoucherResponse,
    status_code=status.HTTP_201_CREATED,
)
async def compile_quotations_to_invoice(
    data: CompileToInvoiceRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Compila múltiples cotizaciones en una sola factura.

    - Todas las cotizaciones deben pertenecer al mismo cliente.
    - Ninguna debe estar ya facturada.
    - El descuento general usado es el MAYOR entre todas las cotizaciones (decisión documentada).
    - Los pagos son opcionales pero requeridos para registrar el cobro.
    - Requiere caja abierta.

    En caso de error en cualquiera de las cotizaciones, se retorna 400 con detalle.
    Si falla algo, no se persiste ningún cambio (transacción atómica).
    """
    await _ensure_invoicing_enabled(db, business_id)

    open_register = await get_open_cash_register(db, business_id)
    if not open_register:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay una caja abierta. Debe abrir la caja antes de emitir facturas.",
        )

    service = VoucherService(db)
    try:
        payments_raw = None
        if data.payments:
            payments_raw = [p.model_dump() for p in data.payments]

        invoice = await service.compile_quotations_to_invoice(
            business_id=business_id,
            quotation_ids=data.quotation_ids,
            payments=payments_raw,
            fiscal_client_id=data.fiscal_client_id,
            price_strategy=data.price_strategy,
            general_discount=data.general_discount,
            user_id=current_user.id,
        )

        await _log_audit(
            db=db,
            user_id=current_user.id,
            business_id=business_id,
            action="create",
            resource_type="voucher",
            resource_id=invoice.id,
            details={
                "description": f"Factura compilada desde {len(data.quotation_ids)} cotizaciones",
                "quotation_ids": [str(qid) for qid in data.quotation_ids],
                "fiscal_client_id": (
                    str(data.fiscal_client_id) if data.fiscal_client_id else None
                ),
                "price_strategy": data.price_strategy,
            },
        )

        return VoucherResponse.model_validate(invoice)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al compilar cotizaciones: {str(e)}",
        )


@router.get("/{invoice_id}/source-quotations", response_model=list[SourceQuotationResponse])
async def get_source_quotations(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Lista las cotizaciones origen que fueron compiladas en una factura.

    Retorna cotizaciones (quotation) que tienen su `invoiced_voucher_id` apuntando
    a la factura dada, ordenadas por fecha.
    """
    service = VoucherService(db)
    quotations = await service.get_source_quotations(invoice_id, business_id)
    return quotations


@router.post(
    "/{voucher_id}/credit-note",
    response_model=VoucherResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_credit_note(
    voucher_id: UUID,
    data: CreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Crea una Nota de Crédito a partir de una factura.

    - **original_voucher_id**: ID de la factura original (debe tener CAE)
    - **reason**: Motivo de la NC (obligatorio)
    - **items**: Lista de productos a devolver (cantidad no puede superar la original)

    La NC se emite automáticamente en ARCA/AFIP con referencia a la factura original (CbtesAsoc).
    Requiere caja abierta.
    """
    await _ensure_invoicing_enabled(db, business_id)

    # Validar caja abierta antes de emitir NC
    open_register = await get_open_cash_register(db, business_id)
    if not open_register:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay una caja abierta. Debe abrir la caja antes de emitir Notas de Crédito.",
        )

    service = VoucherService(db)

    try:
        # 1. Crear la NC en la base de datos
        items_data = [item.model_dump() for item in data.items]

        credit_note = await service.create_credit_note(
            business_id=business_id,
            original_voucher_id=data.original_voucher_id,
            reason=data.reason,
            items_data=items_data,
            user_id=current_user.id,
        )

        # 2. Obtener business y cliente para emitir en AFIP
        business = await db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        client = await db.get(Client, credit_note.client_id)
        if not client:
            raise ValueError("Cliente no encontrado")

        # 3. Obtener factura original
        result = await db.execute(
            select(Voucher).where(Voucher.id == data.original_voucher_id)
        )
        original_voucher = result.scalar_one_or_none()
        if not original_voucher:
            raise ValueError("Factura original no encontrada")

        # 4. Emitir en ARCA/AFIP
        afip_service = AfipSdkService(business)
        afip_result = await afip_service.emit_credit_note(
            credit_note=credit_note,
            client=client,
            original_voucher=original_voucher,
        )

        if not afip_result["success"]:
            # Si falla la emisión, eliminar la NC creada
            await db.delete(credit_note)
            await db.commit()
            raise ValueError(f"Error al emitir NC en AFIP: {afip_result.get('error')}")

        # 5. Actualizar la NC con los datos de AFIP
        from datetime import datetime

        credit_note.cae = afip_result.get("CAE")

        # Convertir CAEFchVto de string a date
        cae_expiration_str = afip_result.get("CAEFchVto")
        if cae_expiration_str:
            # Formato: "2026-02-23" o "20260223"
            if "-" in cae_expiration_str:
                credit_note.cae_expiration = datetime.strptime(
                    cae_expiration_str, "%Y-%m-%d"
                ).date()
            else:
                credit_note.cae_expiration = datetime.strptime(
                    cae_expiration_str, "%Y%m%d"
                ).date()

        credit_note.number = str(afip_result.get("voucherNumber")).zfill(8)

        await db.commit()
        await db.refresh(credit_note)

        # Cargar relaciones
        result = await db.execute(
            select(Voucher)
            .options(selectinload(Voucher.items))
            .where(Voucher.id == credit_note.id)
        )
        credit_note = result.scalar_one()

        await _log_audit(
            db=db,
            user_id=current_user.id,
            business_id=business_id,
            action="create",
            resource_type="voucher",
            resource_id=credit_note.id,
            details={
                "description": f"Nota de crédito creada para factura: {data.original_voucher_id}",
                "original_voucher_id": str(data.original_voucher_id),
                "reason": data.reason,
            },
        )

        return credit_note

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al crear Nota de Crédito: {str(e)}",
        )
