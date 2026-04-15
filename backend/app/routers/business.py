"""
Router para gestión de Business (Negocio).
"""

import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.business import Business
from app.models.audit_log import AuditLog
from app.schemas.business_schemas import BusinessResponse, BusinessUpdate
from app.utils.security import get_current_user, get_current_business

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
        header_text=business.header_text,
        sale_point=business.sale_point,
        ai_agent_enabled=bool(business.ai_agent_enabled),
        current_account_mode=business.current_account_mode or "disabled",
        arca_environment=business.arca_environment,
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
        header_text=business.header_text,
        sale_point=business.sale_point,
        ai_agent_enabled=bool(business.ai_agent_enabled),
        current_account_mode=business.current_account_mode or "disabled",
        arca_environment=business.arca_environment,
    )
