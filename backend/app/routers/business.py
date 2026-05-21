"""
Router para gestión de Business (Negocio).
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.business import Business
from app.models.voucher import Voucher, VoucherType
from app.schemas.business_schemas import BusinessResponse, BusinessUpdate
from app.utils.security import get_current_business, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/business", tags=["business"])


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


@router.get("/me", response_model=BusinessResponse)
async def get_my_business(
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """
    Obtiene los datos del negocio del usuario actual.
    """
    result = await db.execute(select(Business).where(Business.id == business_id))
    business = result.scalar_one_or_none()

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Negocio no encontrado",
        )

    # Query real last numbers from vouchers table (MAX per type, single round-trip)
    rows = await db.execute(
        select(Voucher.voucher_type, func.max(Voucher.number))
        .where(Voucher.business_id == business_id)
        .group_by(Voucher.voucher_type)
    )
    last_by_type: dict[VoucherType, str] = {row[0]: row[1] for row in rows.all()}

    return BusinessResponse(
        id=str(business.id),
        name=business.name,
        cuit=business.cuit,
        tax_condition=business.tax_condition,
        address=business.address,
        city=business.city,
        province=business.province,
        postal_code=business.postal_code,
        phone=business.phone,
        email=business.email,
        logo_url=business.logo_url,
        hide_business_name_in_pdf=bool(
            getattr(business, "hide_business_name_in_pdf", False)
        ),
        logo_position=getattr(business, "logo_position", "left") or "left",
        logo_display_mode=getattr(business, "logo_display_mode", "alongside_text")
        or "alongside_text",
        header_text=business.header_text,
        sale_point=business.sale_point,
        electronic_sale_point=business.electronic_sale_point,
        alternative_sale_point=business.alternative_sale_point,
        srx_enabled=bool(getattr(business, "srx_enabled", False)),
        ai_agent_enabled=bool(business.ai_agent_enabled),
        whatsapp_enabled=bool(getattr(business, "whatsapp_enabled", False)),
        qr_scanner_enabled=bool(getattr(business, "qr_scanner_enabled", False)),
        evolution_api_key=getattr(business, "evolution_api_key", None),
        whatsapp_instance_name=getattr(business, "whatsapp_instance_name", None),
        current_account_mode=business.current_account_mode or "disabled",
        invoicing_enabled=bool(business.invoicing_enabled),
        receipts_enabled=bool(business.receipts_enabled),
        quotation_enabled=bool(getattr(business, "quotation_enabled", True)),
        inventory_enabled=bool(getattr(business, "inventory_enabled", True)),
        stockpile_enabled=bool(getattr(business, "stockpile_enabled", True)),
        price_update_enabled=bool(business.price_update_enabled),
        reports_enabled=bool(business.reports_enabled),
        sql_backup_enabled=bool(getattr(business, "sql_backup_enabled", False)),
        arca_environment=business.arca_environment,
        last_quotation_number=last_by_type.get(VoucherType.QUOTATION) or "00000000",
        last_receipt_number=last_by_type.get(VoucherType.RECEIPT) or "00000000",
        last_invoice_a_number=last_by_type.get(VoucherType.INVOICE_A) or "00000000",
        last_invoice_b_number=last_by_type.get(VoucherType.INVOICE_B) or "00000000",
        last_invoice_c_number=last_by_type.get(VoucherType.INVOICE_C) or "00000000",
        last_invoice_x_number=last_by_type.get(VoucherType.INVOICE_X) or "00000000",
    )


@router.put("/me", response_model=BusinessResponse)
async def update_my_business(
    data: BusinessUpdate,
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Actualiza los datos del negocio del usuario actual.
    """
    result = await db.execute(select(Business).where(Business.id == business_id))
    business = result.scalar_one_or_none()

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Negocio no encontrado",
        )

    # Actualizar campos
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(business, field, value)

    await db.commit()
    await db.refresh(business)

    logger.info(f"Negocio {business.id} actualizado por usuario {current_user.id}")

    await _log_audit(
        db=db,
        user_id=current_user.id,
        business_id=business_id,
        action="update",
        resource_type="branding",
        resource_id=business_id,
        details={
            "description": "Configuración de negocio actualizada",
            "updated_fields": list(update_data.keys()),
        },
    )

    # Convertir UUID a string para el response
    return BusinessResponse(
        id=str(business.id),
        name=business.name,
        cuit=business.cuit,
        tax_condition=business.tax_condition,
        address=business.address,
        city=business.city,
        province=business.province,
        postal_code=business.postal_code,
        phone=business.phone,
        email=business.email,
        logo_url=business.logo_url,
        hide_business_name_in_pdf=bool(
            getattr(business, "hide_business_name_in_pdf", False)
        ),
        logo_position=getattr(business, "logo_position", "left") or "left",
        logo_display_mode=getattr(business, "logo_display_mode", "alongside_text")
        or "alongside_text",
        header_text=business.header_text,
        sale_point=business.sale_point,
        electronic_sale_point=business.electronic_sale_point,
        alternative_sale_point=business.alternative_sale_point,
        srx_enabled=bool(getattr(business, "srx_enabled", False)),
        ai_agent_enabled=bool(business.ai_agent_enabled),
        whatsapp_enabled=bool(getattr(business, "whatsapp_enabled", False)),
        qr_scanner_enabled=bool(getattr(business, "qr_scanner_enabled", False)),
        evolution_api_key=getattr(business, "evolution_api_key", None),
        whatsapp_instance_name=getattr(business, "whatsapp_instance_name", None),
        current_account_mode=business.current_account_mode or "disabled",
        invoicing_enabled=bool(business.invoicing_enabled),
        receipts_enabled=bool(business.receipts_enabled),
        quotation_enabled=bool(getattr(business, "quotation_enabled", True)),
        inventory_enabled=bool(getattr(business, "inventory_enabled", True)),
        stockpile_enabled=bool(getattr(business, "stockpile_enabled", True)),
        price_update_enabled=bool(business.price_update_enabled),
        reports_enabled=bool(business.reports_enabled),
        sql_backup_enabled=bool(getattr(business, "sql_backup_enabled", False)),
        arca_environment=business.arca_environment,
    )
