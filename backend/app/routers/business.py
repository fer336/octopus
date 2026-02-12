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
from app.schemas.business_schemas import BusinessResponse, BusinessUpdate
from app.utils.security import get_current_user, get_current_business

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/business", tags=["business"])


@router.get("/me", response_model=BusinessResponse)
async def get_my_business(
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """
    Obtiene los datos del negocio del usuario actual.
    """
    result = await db.execute(
        select(Business).where(Business.id == business_id)
    )
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
        arca_environment=business.arca_environment,
    )


@router.put("/me", response_model=BusinessResponse)
async def update_my_business(
    data: BusinessUpdate,
    business_id: UUID = Depends(get_current_business),
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Actualiza los datos del negocio del usuario actual.
    """
    result = await db.execute(
        select(Business).where(Business.id == business_id)
    )
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
        arca_environment=business.arca_environment,
    )
