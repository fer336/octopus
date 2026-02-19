"""
Router de métodos de pago.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.database import get_db
from app.models.payment_method import PaymentMethodCatalog
from app.schemas.payment_method import PaymentMethodResponse
from app.utils.security import get_current_business

router = APIRouter(prefix="/payment-methods", tags=["Payment Methods"])


@router.get("/", response_model=List[PaymentMethodResponse])
async def list_payment_methods(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Listar métodos de pago activos del negocio.
    
    Retorna todos los métodos de pago configurados para el negocio actual.
    Solo se muestran los métodos activos (is_active = True).
    """
    result = await db.execute(
        select(PaymentMethodCatalog)
        .where(
            PaymentMethodCatalog.business_id == business_id,
            PaymentMethodCatalog.is_active == True,
        )
        .order_by(PaymentMethodCatalog.name)
    )
    
    methods = result.scalars().all()
    return methods
