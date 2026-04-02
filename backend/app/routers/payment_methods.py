"""
Router de métodos de pago.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.payment_method import (
    PaymentMethodCreate,
    PaymentMethodResponse,
    PaymentMethodStatusUpdate,
    PaymentMethodUpdate,
)
from app.services.payment_method_service import PaymentMethodService
from app.utils.security import get_current_business

router = APIRouter(prefix="/payment-methods", tags=["Payment Methods"])


@router.get("", response_model=List[PaymentMethodResponse])
async def list_payment_methods(
    active_only: bool = Query(
        default=True,
        description="Si es true retorna solo métodos activos; si es false retorna todos.",
    ),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Listar métodos de pago activos del negocio.

    Retorna todos los métodos de pago configurados para el negocio actual.
    Solo se muestran los métodos activos (is_active = True).
    """
    service = PaymentMethodService(db)
    return await service.list(business_id=business_id, active_only=active_only)


@router.post(
    "", response_model=PaymentMethodResponse, status_code=status.HTTP_201_CREATED
)
async def create_payment_method(
    data: PaymentMethodCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Crea un nuevo método de pago para el negocio actual."""
    service = PaymentMethodService(db)

    try:
        payment_method = await service.create(business_id=business_id, data=data)
        return PaymentMethodResponse.model_validate(payment_method)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.put("/{payment_method_id}", response_model=PaymentMethodResponse)
async def update_payment_method(
    payment_method_id: UUID,
    data: PaymentMethodUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza un método de pago existente del negocio actual."""
    service = PaymentMethodService(db)

    try:
        payment_method = await service.update(
            payment_method_id=payment_method_id,
            business_id=business_id,
            data=data,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    if not payment_method:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Método de pago no encontrado",
        )

    return PaymentMethodResponse.model_validate(payment_method)


@router.patch("/{payment_method_id}/status", response_model=PaymentMethodResponse)
async def update_payment_method_status(
    payment_method_id: UUID,
    data: PaymentMethodStatusUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Activa o desactiva un método de pago existente."""
    service = PaymentMethodService(db)

    payment_method = await service.update_status(
        payment_method_id=payment_method_id,
        business_id=business_id,
        is_active=data.is_active,
    )

    if not payment_method:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Método de pago no encontrado",
        )

    return PaymentMethodResponse.model_validate(payment_method)
