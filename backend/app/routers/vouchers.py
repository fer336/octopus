"""
Router de Comprobantes.
"""

import io
import logging
from datetime import date as date_type
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.business import Business
from app.models.cash_register import CashMovementType, CashPaymentMethod
from app.models.client import Client
from app.models.payment import PaymentMethod
from app.models.payment_receipt import PaymentReceipt
from app.models.tenant_membership import TenantMembership
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.schemas.base import PaginatedResponse
from app.schemas.credit_note import CreditNoteCreate
from app.schemas.payment_receipt import (
    VoucherPayRequest,
    VoucherPayResponse,
)
from app.schemas.voucher import (
    CompilePreviewRequest,
    CompilePreviewResponse,
    CompileToInvoiceRequest,
    ConvertQuotationToInvoice,
    CustomerCreditReturnRequest,
    CustomerCreditReturnResponse,
    CurrentAccountCloseHistoryResponse,
    CurrentAccountClosePreviewRequest,
    CurrentAccountClosePreviewResponse,
    CurrentAccountCloseRequest,
    SourceQuotationResponse,
    VoucherAuditLogResponse,
    VoucherCreate,
    VoucherResponse,
    VoucherTotalsPreviewRequest,
    VoucherTotalsPreviewResponse,
    VoucherUpdate,
)
from app.services.afip_sdk_service import AfipSdkService
from app.services.cash_register_service import (
    create_automatic_movement,
    ensure_open_cash_register_for_billing,
    get_open_cash_register,
)
from app.services.pdf_service import pdf_service
from app.services.voucher_service import VoucherService
from app.utils.acl import parse_module_permissions
from app.utils.security import (
    get_current_business,
    get_current_user,
    require_module_access,
)


def serialize_voucher(voucher: Voucher) -> dict:
    """Serializa un comprobante a dict con información del vendedor."""
    data = VoucherResponse.model_validate(voucher).model_dump()
    unloaded_relationships = inspect(voucher).unloaded
    child_stockpiles = (
        []
        if "child_stockpiles" in unloaded_relationships
        else (getattr(voucher, "child_stockpiles", []) or [])
    )
    data["is_stockpile_principal_receipt"] = bool(
        voucher.voucher_type == VoucherType.RECEIPT
        and not getattr(voucher, "stockpile_id", None)
        and len(child_stockpiles) > 0
    )
    # Agregar info del vendedor
    if voucher.created_by_user:
        data["created_by"] = voucher.created_by_user.id
        data["created_by_name"] = voucher.created_by_user.name or voucher.created_by_user.email
    return data


logger = logging.getLogger(__name__)

# Tipos de comprobante que requieren caja abierta para emitirse
INVOICE_TYPES = {VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C}
RECEIPT_TYPES = {VoucherType.RECEIPT}


def _map_payment_method_to_cash_method(method: PaymentMethod) -> CashPaymentMethod:
    """Mapea el método legacy de pago al enum usado por caja."""
    if method == PaymentMethod.CASH:
        return CashPaymentMethod.CASH
    if method in (
        PaymentMethod.CREDIT_CARD,
        PaymentMethod.DEBIT_CARD,
        PaymentMethod.MERCADOPAGO,
    ):
        return CashPaymentMethod.CARD
    if method == PaymentMethod.TRANSFER:
        return CashPaymentMethod.TRANSFER
    if method == PaymentMethod.CHECK:
        return CashPaymentMethod.CHECK
    return CashPaymentMethod.OTHER

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
        await db.rollback()


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

    if voucher_type == VoucherType.QUOTATION and not bool(
        getattr(business, "quotation_enabled", True)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cotizaciones deshabilitadas para este tenant desde CMS.",
        )

    if voucher_type == VoucherType.INVOICE_X and not bool(
        getattr(business, "srx_enabled", False)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Comprobante SRX deshabilitado para este negocio.",
        )


async def _ensure_invoicing_enabled(db: AsyncSession, business_id: UUID) -> None:
    """Valida que la funcionalidad de facturación esté activa para el tenant."""
    business = await _get_business_or_404(db, business_id)
    if not bool(business.invoicing_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Facturación deshabilitada para este tenant desde CMS.",
        )


async def _ensure_current_account_enabled(db: AsyncSession, business_id: UUID) -> None:
    """Valida que Cuenta Corriente esté activa para el tenant antes de operar."""
    business = await _get_business_or_404(db, business_id)
    if (business.current_account_mode or "disabled") == "disabled":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta Corriente deshabilitada para este tenant desde CMS.",
        )


async def _user_has_current_account_access(
    db: AsyncSession,
    business_id: UUID,
    current_user,
) -> bool:
    """Valida permiso granular de empleado para Cuenta Corriente dentro del tenant."""
    if getattr(current_user, "platform_role", None) == "superadmin":
        return True

    result = await db.execute(
        select(TenantMembership).where(
            TenantMembership.user_id == current_user.id,
            TenantMembership.business_id == business_id,
            TenantMembership.deleted_at.is_(None),
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        # Compatibilidad con negocios legacy owner_id sin tenant_memberships.
        business = await _get_business_or_404(db, business_id)
        return str(getattr(business, "owner_id", "")) == str(current_user.id)

    module_permissions = parse_module_permissions(
        membership.module_permissions,
        membership.role,
    )
    return bool(module_permissions.get("current_account", False))


async def _ensure_current_account_user_access(
    db: AsyncSession,
    business_id: UUID,
    current_user,
) -> None:
    """Bloquea operaciones CC si el empleado no tiene permiso del CMS."""
    if not await _user_has_current_account_access(db, business_id, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenés permiso para acceder a Cuenta Corriente.",
        )


async def _get_user_membership_role(
    db: AsyncSession,
    business_id: UUID,
    user_id: UUID,
) -> str | None:
    """Obtiene el rol del usuario en el negocio."""
    result = await db.execute(
        select(TenantMembership).where(
            TenantMembership.user_id == user_id,
            TenantMembership.business_id == business_id,
            TenantMembership.deleted_at.is_(None),
        )
    )
    membership = result.scalar_one_or_none()
    if membership:
        return membership.role
    # Si no hay membership, verificar si es owner del negocio
    business = await db.get(Business, business_id)
    if business and str(business.owner_id) == str(user_id):
        return "owner"
    return None


async def _ensure_current_account_available(
    db: AsyncSession,
    business_id: UUID,
    current_user,
) -> None:
    """Valida plan del tenant y permiso del empleado para operar Cuenta Corriente."""
    await _ensure_current_account_enabled(db, business_id)
    await _ensure_current_account_user_access(db, business_id, current_user)


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
    search: str | None = Query(default=None),
    voucher_type: VoucherType | None = Query(default=None),
    status: VoucherStatus | None = Query(default=None),
    payment_method_id: UUID | None = Query(default=None),
    is_current_account: bool | None = Query(default=None),
    current_account_status: str | None = Query(default=None),
    date_from: date_type | None = Query(default=None),
    date_to: date_type | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Lista comprobantes con filtros y paginación."""
    has_current_account_access = await _user_has_current_account_access(
        db, business_id, current_user
    )
    if (is_current_account is not None or current_account_status) and not has_current_account_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenés permiso para acceder a Cuenta Corriente.",
        )

    service = VoucherService(db)
    vouchers, total = await service.list(
        business_id=business_id,
        page=page,
        per_page=per_page,
        search=search,
        voucher_type=voucher_type,
        status=status,
        payment_method_id=payment_method_id,
        is_current_account=is_current_account,
        current_account_status=current_account_status,
        date_from=date_from,
        date_to=date_to,
        include_current_account=has_current_account_access,
    )

    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[serialize_voucher(v) for v in vouchers],
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
    if data.is_current_account:
        await _ensure_current_account_available(db, business_id, current_user)

    open_register = None
    # Validar caja abierta vigente para facturas ARCA y SRX.
    # Para INVOICE_X, srx_enabled ya fue validado por _ensure_voucher_type_feature_enabled.
    if data.voucher_type in INVOICE_TYPES or data.voucher_type == VoucherType.INVOICE_X:
        open_register = await ensure_open_cash_register_for_billing(db, business_id)

    service = VoucherService(db)
    try:
        voucher = await service.create(
            business_id,
            data,
            current_user.id,
            cash_register_id=open_register.id if open_register else None,
        )

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

        return serialize_voucher(voucher)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/preview-totals", response_model=VoucherTotalsPreviewResponse)
async def preview_voucher_totals(
    data: VoucherTotalsPreviewRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Previsualiza totales con la misma lógica de backend (sin persistir)."""
    service = VoucherService(db)
    try:
        subtotal, iva_amount, total = await service.preview_totals(
            business_id=business_id,
            items_data=data.items,
            general_discount=data.general_discount,
        )
        return VoucherTotalsPreviewResponse(
            subtotal=subtotal,
            iva_amount=iva_amount,
            total=total,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/customer-credit-return",
    response_model=CustomerCreditReturnResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_customer_credit_return(
    data: CustomerCreditReturnRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Registra una devolución excedente como saldo a favor del cliente."""
    await _ensure_current_account_available(db, business_id, current_user)

    service = VoucherService(db)
    try:
        result = await service.register_customer_credit_return(
            business_id=business_id,
            client_id=data.client_id,
            items_data=data.items,
            general_discount=data.general_discount,
            movement_date=data.date,
            user_id=current_user.id,
            notes=data.notes,
        )

        await _log_audit(
            db=db,
            user_id=current_user.id,
            business_id=business_id,
            action="create",
            resource_type="customer_credit_return",
            resource_id=data.client_id,
            details={
                "description": "Saldo a favor por devolución excedente",
                "client_id": str(data.client_id),
                "credit_amount": str(result["credit_amount"]),
                "total": str(result["total"]),
            },
        )

        return CustomerCreditReturnResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/audit/recent", response_model=PaginatedResponse[VoucherAuditLogResponse])
async def list_recent_voucher_audit_logs(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    action: str | None = Query(
        default=None,
        description="Filtrar por acción específica (ej: update, delete)",
    ),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
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
    await _ensure_voucher_type_feature_enabled(db, business_id, VoucherType.QUOTATION)
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

        return serialize_voucher(voucher)
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
            detail="La cotización ya fue convertida a factura",
        )

    return serialize_voucher(voucher)


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
    copy: str = Query("original", description="Tipo de copia: original (para el cliente) o duplicado (para el comercio)"),
    hide_discount: bool = Query(False, description="Si es True, oculta los descuentos en items y totales (solo para copia original)"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Genera y devuelve el PDF inline de un comprobante.

    Args:
        copy: 'original' (para el cliente) o 'duplicado' (para el comercio).
        hide_discount: Si True, recalcula items sin descuentos (solo afecta a la representación visual).
    """
    if copy not in ("original", "duplicado"):
        raise HTTPException(status_code=400, detail="copy debe ser 'original' o 'duplicado'")

    service = VoucherService(db)
    try:
        voucher = await service.get_by_id(voucher_id, business_id)
        if not voucher:
            raise ValueError("Comprobante no encontrado")
        if voucher.is_current_account or voucher.is_current_account_closure:
            await _ensure_current_account_user_access(db, business_id, current_user)

        pdf_bytes = await service.generate_pdf(
            voucher_id, business_id,
            copy_type=copy,
            hide_discount=hide_discount,
        )

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


@router.get("/{voucher_id}/payment-receipt/pdf")
async def get_payment_receipt_pdf(
    voucher_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Genera el PDF del remito de pago asociado a una factura en cuenta corriente."""
    await _ensure_current_account_available(db, business_id, current_user)
    result = await db.execute(
        select(PaymentReceipt)
        .options(
            selectinload(PaymentReceipt.business),
            selectinload(PaymentReceipt.client),
            selectinload(PaymentReceipt.invoice_voucher).selectinload(Voucher.items),
        )
        .where(
            PaymentReceipt.invoice_voucher_id == voucher_id,
            PaymentReceipt.business_id == business_id,
            PaymentReceipt.deleted_at.is_(None),
        )
        .order_by(PaymentReceipt.created_at.desc())
    )
    payment_receipt = result.scalars().first()

    if not payment_receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No existe remito de pago para esta factura",
        )

    invoice = payment_receipt.invoice_voucher
    context = {
        "business": payment_receipt.business,
        "client": payment_receipt.client,
        "invoice": {
            "full_number": invoice.full_number,
            "date": invoice.date.strftime("%d/%m/%Y") if invoice.date else "—",
        },
        "receipt": {
            "full_number": payment_receipt.full_number,
            "payment_date": payment_receipt.payment_date.strftime("%d/%m/%Y"),
            "amount": f"{Decimal(str(payment_receipt.amount)):.2f}",
            "payment_method": payment_receipt.payment_method.value,
            "reference": payment_receipt.reference,
            "notes": payment_receipt.notes,
        },
        "items": [
            {
                "code": item.code,
                "description": item.description,
                "quantity": item.quantity,
                "unit_price": f"{Decimal(str(item.unit_price)):.2f}",
                "total": f"{Decimal(str(item.total)):.2f}",
            }
            for item in (invoice.items or [])
        ],
    }

    try:
        pdf_bytes = pdf_service.generate_payment_receipt_pdf(context)
    except Exception as e:
        logger.exception("Error al generar PDF de remito de pago para voucher %s", voucher_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar PDF de remito de pago: {str(e)}",
        )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=remito_pago_{payment_receipt.full_number}.pdf"
        },
    )


@router.post("/{voucher_id}/cancel", response_model=VoucherResponse)
async def cancel_voucher(
    voucher_id: UUID,
    reason: str | None = Query(default=None, description="Motivo de anulación"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Anula un comprobante no fiscal y restaura el stock descontado al confirmarlo."""
    service = VoucherService(db)
    before_voucher = await service.get_by_id(voucher_id, business_id)
    if not before_voucher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comprobante no encontrado"
        )

    try:
        voucher = await service.cancel_receipt(
            voucher_id=voucher_id,
            business_id=business_id,
            cancelled_by_user_id=current_user.id,
            reason=reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    response_payload = serialize_voucher(voucher)

    await _log_audit(
        db=db,
        user_id=current_user.id,
        business_id=business_id,
        action="cancel_voucher",
        resource_type="voucher",
        resource_id=voucher_id,
        details={
            "description": "Comprobante anulado y stock restaurado",
            "reason": reason,
            "before": _voucher_snapshot(before_voucher),
            "after": _voucher_snapshot(voucher),
        },
    )

    return response_payload


@router.delete("/{voucher_id}/delete")
async def delete_voucher(
    voucher_id: UUID,
    reason: str | None = Query(default=None, description="Motivo de eliminación"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Elimina un comprobante (soft delete con auditoría y reversión de efectos para devoluciones).
    El registro queda marcado como eliminado pero visible en el historial.
    Para devoluciones, puede requerir autorización según monto/antigüedad.
    """
    service = VoucherService(db)
    before_voucher = await service.get_by_id(voucher_id, business_id)
    if not before_voucher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comprobante no encontrado"
        )

    if before_voucher.is_current_account or before_voucher.is_current_account_closure:
        await _ensure_current_account_user_access(db, business_id, current_user)

    # ========================================
    # VALIDACIÓN DE ROL Y AUTORIZACIÓN
    # ========================================
    membership_role = await _get_user_membership_role(db, business_id, current_user.id)

    # Solo OWNER y MANAGER pueden eliminar devoluciones
    if before_voucher.is_return_receipt and membership_role not in ["owner", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los usuarios con rol Owner o Manager pueden eliminar devoluciones",
        )

    # Verificar si requiere autorización
    if before_voucher.is_return_receipt:
        requires_auth, auth_reason = service.requires_authorization(
            before_voucher, membership_role or ""
        )

        if requires_auth:
            # Crear solicitud de autorización
            auth_request = await service.create_authorization_request(
                voucher_id=voucher_id,
                business_id=business_id,
                requested_by_user_id=current_user.id,
                reason=reason or "Eliminación de devolución",
            )
            return {
                "authorization_required": True,
                "authorization_id": str(auth_request.id),
                "message": auth_reason + ". Solicitud enviada para aprobación.",
            }

    # Ejecutar eliminación directamente
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


# ========================================
# ENDPOINTS DE AUTORIZACIÓN
# ========================================


@router.get("/authorizations/pending")
async def list_pending_authorizations(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Lista las solicitudes de autorización pendientes para el usuario."""
    # Obtener rol del usuario actual
    membership_role = await _get_user_membership_role(db, business_id, current_user.id)

    # Solo owner y manager pueden ver autorizaciones pendientes
    if membership_role not in ["owner", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Owner o Manager pueden gestionar autorizaciones",
        )

    # Buscar autorizaciones pendientes del negocio
    from app.models.authorization import AuthorizationRequest, AuthorizationStatus

    result = await db.execute(
        select(AuthorizationRequest).where(
            AuthorizationRequest.business_id == business_id,
            AuthorizationRequest.status == AuthorizationStatus.PENDING,
            AuthorizationRequest.deleted_at.is_(None),
        )
    )
    authorizations = result.scalars().all()

    return {
        "items": [
            {
                "id": str(a.id),
                "requested_by_user_id": str(a.requested_by),
                "authorization_type": a.authorization_type.value,
                "resource_id": str(a.resource_id),
                "reason": a.reason,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in authorizations
        ],
        "total": len(authorizations),
    }


@router.post("/authorizations/{authorization_id}/approve")
async def approve_authorization(
    authorization_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Aprueba una solicitud de eliminación de devolución."""
    membership_role = await _get_user_membership_role(db, business_id, current_user.id)

    if membership_role not in ["owner", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Owner o Manager pueden aprobar autorizaciones",
        )

    service = VoucherService(db)

    try:
        auth_request = await service.approve_authorization(
            authorization_id, current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Si se aprueba, ejecutar la eliminación del voucher
    try:
        success = await service.soft_delete(
            auth_request.resource_id,
            business_id,
            current_user.id,
            f"Aprobado por authorization {authorization_id}",
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comprobante no encontrado",
            )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await _log_audit(
        db=db,
        user_id=current_user.id,
        business_id=business_id,
        action="approve_authorization_and_delete",
        resource_type="authorization_request",
        resource_id=authorization_id,
        details={
            "authorization_id": str(authorization_id),
            "voucher_id": str(auth_request.resource_id),
        },
    )

    return {"message": "Autorización aprobada y comprobante eliminado"}


@router.post("/authorizations/{authorization_id}/reject")
async def reject_authorization(
    authorization_id: UUID,
    rejection_reason: str = Query(..., description="Motivo del rechazo"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Rechaza una solicitud de eliminación de devolución."""
    membership_role = await _get_user_membership_role(db, business_id, current_user.id)

    if membership_role not in ["owner", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Owner o Manager pueden rechazar autorizaciones",
        )

    service = VoucherService(db)

    try:
        auth_request = await service.reject_authorization(
            authorization_id, current_user.id, rejection_reason
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await _log_audit(
        db=db,
        user_id=current_user.id,
        business_id=business_id,
        action="reject_authorization",
        resource_type="authorization_request",
        resource_id=authorization_id,
        details={
            "rejection_reason": rejection_reason,
        },
    )

    return {"message": "Solicitud de autorización rechazada"}


@router.get("/pending-quotations", response_model=PaginatedResponse[VoucherResponse])
async def list_pending_quotations(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=100, ge=1, le=200),
    search: str | None = Query(default=None),
    voucher_type: VoucherType | None = Query(
        default=None, description="Filtrar por tipo: quotation o receipt"
    ),
    date_from: str | None = Query(
        default=None, description="Fecha desde (YYYY-MM-DD)"
    ),
    date_to: str | None = Query(
        default=None, description="Fecha hasta (YYYY-MM-DD)"
    ),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Lista las cotizaciones y remitos pendientes de facturar.

    Retorna comprobantes (cotización o remito) que:
    - No tienen factura asociada (invoiced_voucher_id es NULL)
    - No están eliminados

    Filtros disponibles: tipo (quotation/receipt), fecha desde/hasta, texto de búsqueda.
    """
    has_current_account_access = await _user_has_current_account_access(
        db, business_id, current_user
    )
    service = VoucherService(db)
    vouchers, total = await service.list_pending_quotations(
        business_id=business_id,
        page=page,
        per_page=per_page,
        search=search,
        voucher_type=voucher_type,
        date_from=date_from,
        date_to=date_to,
        include_current_account=has_current_account_access,
    )

    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[serialize_voucher(v) for v in vouchers],
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
    await _ensure_current_account_available(db, business_id, current_user)
    service = VoucherService(db)
    try:
        closure_voucher = await service.close_current_account(
            business_id=business_id,
            billing_client_id=data.billing_client_id,
            receipt_ids=data.receipt_ids,
            close_all=data.close_all,
            notes=data.notes,
            user_id=current_user.id,
            item_quantity_overrides=data.item_quantity_overrides,
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

        return serialize_voucher(closure_voucher)
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
    await _ensure_current_account_available(db, business_id, current_user)
    service = VoucherService(db)
    try:
        preview = await service.preview_current_account_close(
            business_id=business_id,
            billing_client_id=data.billing_client_id,
            receipt_ids=data.receipt_ids,
            close_all=data.close_all,
            notes=data.notes,
            item_quantity_overrides=data.item_quantity_overrides,
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

    await _ensure_current_account_available(db, business_id, current_user)
    service = VoucherService(db)
    try:
        preview = await service.preview_current_account_close(
            business_id=business_id,
            billing_client_id=data.billing_client_id,
            receipt_ids=data.receipt_ids,
            close_all=data.close_all,
            notes=data.notes,
            item_quantity_overrides=data.item_quantity_overrides,
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

        from datetime import datetime

        from app.services.pdf_service import pdf_service

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
    billing_client_id: UUID | None = Query(
        default=None,
        description="Filtrar por cliente titular",
    ),
    pending_only: bool | None = Query(
        default=None,
        description="True: solo pendientes, False: solo cerrados, None: todos",
    ),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Lista remitos de Cuenta Corriente para control previo al cierre."""
    await _ensure_current_account_available(db, business_id, current_user)
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
        items=[serialize_voucher(v) for v in vouchers],
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
    current_user=Depends(get_current_user),
):
    """Obtiene el historial de cierres de cuenta corriente por cliente titular."""
    await _ensure_current_account_available(db, business_id, current_user)
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
    if data.is_current_account:
        await _ensure_current_account_available(db, business_id, current_user)

    # Validar caja abierta vigente antes de convertir
    open_register = await ensure_open_cash_register_for_billing(db, business_id)

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
            is_current_account=data.is_current_account,
            payment_days=data.payment_days,
            price_strategy=data.price_strategy,
            cash_register_id=open_register.id if open_register else None,
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
                "is_current_account": data.is_current_account,
                "payment_days": data.payment_days,
            },
        )

        return serialize_voucher(invoice)
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
    from app.models.voucher import Voucher as VoucherModel
    from app.models.voucher import VoucherType

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

    # Resolve fiscal client (override) and determine invoice variant
    from app.models.client import Client

    source_client = await db.get(Client, next(iter(client_ids)))
    if not source_client or source_client.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente origen no encontrado",
        )

    invoice_client = source_client
    if data.fiscal_client_id:
        override_client = await db.get(Client, data.fiscal_client_id)
        if not override_client or override_client.business_id != business_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cliente fiscal no encontrado",
            )
        invoice_client = override_client

    invoice_variant = "B"
    if invoice_client.tax_condition == "RI":
        invoice_variant = "A"

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

            # Resolve price based on strategy. IMPORTANT: this preview must
            # mirror VoucherService._resolve_price_and_iva_by_strategy exactly.
            # product.sale_price already includes IVA, so using it here and
            # adding iva_line below would double-charge IVA in the modal preview.
            if data.price_strategy == "historical":
                unit_price = D(str(source_item.unit_price))
                iva_rate = D(str(source_item.iva_rate))
            else:
                unit_price = D(str(product.net_price))
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
        invoice_variant=invoice_variant,
        fiscal_client_id=data.fiscal_client_id,
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
    if data.is_current_account:
        await _ensure_current_account_available(db, business_id, current_user)

    open_register = await ensure_open_cash_register_for_billing(db, business_id)

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
            is_current_account=data.is_current_account,
            payment_days=data.payment_days,
            cash_register_id=open_register.id if open_register else None,
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

        return serialize_voucher(invoice)
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

    # Validar caja abierta vigente antes de emitir NC
    open_register = await ensure_open_cash_register_for_billing(
        db,
        business_id,
        missing_detail="No hay una caja abierta. Debe abrir la caja antes de emitir Notas de Crédito.",
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
            cash_register_id=open_register.id if open_register else None,
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

        # Actualizar sale_point con electronic_sale_point
        electronic_sp = business.electronic_sale_point or business.sale_point or "0001"
        if credit_note.sale_point != electronic_sp:
            credit_note.sale_point = electronic_sp

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


@router.post("/{voucher_id}/pay", response_model=VoucherPayResponse)
async def pay_current_account_voucher(
    voucher_id: UUID,
    data: VoucherPayRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """
    Registrar el pago de una factura en cuenta corriente.
    
    - Actualiza el estado de la factura (is_paid, payment_date, paid_amount)
    - Genera un Remito de Pago automáticamente
    - Registra el movimiento en la caja diaria
    """
    await _ensure_current_account_available(db, business_id, current_user)
    # 1. Buscar la factura
    result = await db.execute(
        select(Voucher).where(
            Voucher.id == voucher_id,
            Voucher.business_id == business_id,
        )
    )
    voucher = result.scalar_one_or_none()
    
    if not voucher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comprobante no encontrado",
        )
    
    # 2. Validar que es una factura en cuenta corriente
    if not voucher.is_current_account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este comprobante no es una factura en cuenta corriente",
        )
    
    # 3. Validar que es una factura (no remito)
    if not voucher.voucher_type.name.startswith("INVOICE"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden pagar facturas en cuenta corriente",
        )
    
    # 4. Validar que no esté ya pagada
    if voucher.is_paid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta factura ya está pagada",
        )
    
    # 5. Validar monto
    amount = Decimal(str(data.amount))
    voucher_total = Decimal(str(voucher.total))

    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El monto debe ser mayor a 0",
        )
    
    if amount > voucher_total:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El monto no puede exceder el total de la factura (${voucher.total})",
        )
    
    # 6. Obtener caja abierta
    cash_register = await get_open_cash_register(db, business_id)
    if not cash_register:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay una caja abierta. Debe abrir la caja antes de registrar cobros.",
        )
    
    # 7. Generar número de Remito de Pago
    business = await db.get(Business, business_id)
    next_number = int(business.last_receipt_number or "0") + 1
    sale_point = business.sale_point
    
    # 8. Crear el Remito de Pago
    payment_receipt = PaymentReceipt(
        business_id=business_id,
        invoice_voucher_id=voucher.id,
        client_id=voucher.billing_client_id or voucher.client_id,
        received_by=current_user.id,
        payment_date=data.payment_date,
        amount=amount,
        payment_method=data.payment_method,
        reference=data.reference,
        sale_point=sale_point,
        number=str(next_number).zfill(8),
        notes=data.notes,
    )
    db.add(payment_receipt)
    
    # 9. Actualizar la factura
    voucher.is_paid = True
    voucher.payment_date = data.payment_date
    voucher.paid_amount = amount
    
    # 10. Actualizar numeración del negocio
    business.last_receipt_number = str(next_number).zfill(8)
    
    await create_automatic_movement(
        db=db,
        cash_register=cash_register,
        movement_type=CashMovementType.PAYMENT_RECEIVED,
        payment_method=_map_payment_method_to_cash_method(data.payment_method),
        amount=amount,
        description=f"Cobro Cta. Cte. Factura {voucher.full_number} - Remito Pago {payment_receipt.full_number}",
        created_by=current_user.id,
        voucher_id=voucher.id,
    )

    await db.commit()
    await db.refresh(payment_receipt)
    await db.refresh(voucher)
    
    # 11. Generar respuesta
    return VoucherPayResponse(
        voucher_id=voucher.id,
        is_paid=voucher.is_paid,
        payment_date=voucher.payment_date,
        paid_amount=voucher.paid_amount,
        payment_receipt=None,  # Por ahora no devolvemos el receipt completo
    )
