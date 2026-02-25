"""
Router de Caja.
Endpoints para apertura, cierre y movimientos de la caja diaria.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.cash_register import (
    CashCloseRequest,
    CashMovementCreateRequest,
    CashMovementResponse,
    CashOpenRequest,
    CashRegisterResponse,
    CashRegisterSummaryResponse,
    CashSummaryResponse,
)
from app.services import cash_register_service as service
from app.utils.security import get_current_business, get_current_user

router = APIRouter(prefix="/cash", tags=["Caja"])


@router.get("/current", response_model=Optional[CashRegisterResponse])
async def get_current_cash(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Retorna la caja activa del negocio con todos sus movimientos.
    Si no hay caja abierta, retorna null.
    El campo `is_expired` indica si lleva más de 24hs abierta.
    """
    return await service.get_current(db, business_id)


@router.post("/open", response_model=CashRegisterResponse, status_code=status.HTTP_201_CREATED)
async def open_cash(
    data: CashOpenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """
    Abre una nueva caja para el día.
    - Solo puede haber una caja abierta a la vez.
    - Si hay una caja vencida (+24hs), debe cerrarse primero.
    """
    return await service.open_cash(db, business_id, current_user, data)


@router.post("/close", response_model=CashRegisterResponse)
async def close_cash(
    data: CashCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """
    Cierra la caja activa.
    - Si hay diferencia entre el efectivo esperado y el contado, el motivo es obligatorio.
    - El cierre es irreversible.
    """
    return await service.close_cash(db, business_id, current_user, data)


@router.get("/history", response_model=List[CashRegisterSummaryResponse])
async def get_history(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Retorna el historial de cajas cerradas (últimas 30), de más reciente a más antigua.
    """
    registers = await service.get_history(db, business_id)
    return [
        CashRegisterSummaryResponse(
            id=r.id,
            status=r.status,
            is_expired=False,
            opening_amount=r.opening_amount,
            opened_at=r.opened_at,
            closed_at=r.closed_at,
            difference=r.difference,
        )
        for r in registers
    ]


@router.get("/{cash_register_id}/movements", response_model=List[CashMovementResponse])
async def list_movements(
    cash_register_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Lista todos los movimientos de una caja específica.
    """
    register_response = await service.get_summary(db, business_id, cash_register_id)
    # Reusamos el get_summary para validar que la caja pertenece al negocio
    # y luego obtenemos los movimientos directamente
    from sqlalchemy import select, and_
    from app.models.cash_register import CashRegister, CashMovement
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(CashRegister)
        .options(selectinload(CashRegister.movements))
        .where(
            and_(
                CashRegister.id == cash_register_id,
                CashRegister.business_id == business_id,
                CashRegister.deleted_at.is_(None),
            )
        )
    )
    register = result.scalar_one_or_none()
    if not register:
        raise HTTPException(status_code=404, detail="Caja no encontrada.")

    return [
        CashMovementResponse(
            id=m.id,
            type=m.type,
            payment_method=m.payment_method,
            amount=m.amount,
            description=m.description,
            voucher_id=m.voucher_id,
            created_by=m.created_by,
            created_at=m.created_at,
        )
        for m in register.movements
    ]


@router.post("/{cash_register_id}/movements", response_model=CashMovementResponse, status_code=status.HTTP_201_CREATED)
async def add_movement(
    cash_register_id: UUID,
    data: CashMovementCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """
    Registra un movimiento manual en la caja activa.
    Solo se permiten tipos INCOME (ingreso) o EXPENSE (egreso).
    La caja debe estar abierta y no vencida.
    """
    # Validamos que el cash_register_id corresponda a la caja activa del negocio
    from sqlalchemy import select, and_
    from app.models.cash_register import CashRegister

    result = await db.execute(
        select(CashRegister).where(
            and_(
                CashRegister.id == cash_register_id,
                CashRegister.business_id == business_id,
                CashRegister.deleted_at.is_(None),
            )
        )
    )
    register = result.scalar_one_or_none()
    if not register:
        raise HTTPException(status_code=404, detail="Caja no encontrada.")

    return await service.add_movement(db, business_id, current_user, data)


@router.get("/{cash_register_id}/summary", response_model=CashSummaryResponse)
async def get_summary(
    cash_register_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Retorna el resumen de totales de la caja agrupado por método de pago.
    Incluye el efectivo esperado al cierre (fondo inicial + neto en efectivo).
    """
    return await service.get_summary(db, business_id, cash_register_id)


@router.get("/{cash_register_id}/pdf")
async def get_closure_pdf(
    cash_register_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Genera y descarga el PDF de cierre de una caja.
    Disponible tanto al momento del cierre como desde el historial.
    """
    pdf_bytes = await service.generate_closure_pdf(db, business_id, cash_register_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="cierre_caja_{cash_register_id}.pdf"'
        },
    )
