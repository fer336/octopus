"""
Servicio de Caja.
Contiene toda la lógica de negocio de apertura, cierre y movimientos de caja.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cash_register import (
    CashMovement,
    CashMovementType,
    CashPaymentMethod,
    CashRegister,
    CashRegisterStatus,
)
from app.models.user import User
from app.schemas.cash_register import (
    CashCloseRequest,
    CashMovementCreateRequest,
    CashMovementResponse,
    CashOpenRequest,
    CashRegisterResponse,
    CashSummaryResponse,
    PaymentMethodSummary,
)

EXPIRED_THRESHOLD_HOURS = 24


def _is_expired(cash_register: CashRegister) -> bool:
    """Calcula si una caja abierta está vencida (> 24hs)."""
    if cash_register.status != CashRegisterStatus.OPEN:
        return False
    threshold = datetime.utcnow() - timedelta(hours=EXPIRED_THRESHOLD_HOURS)
    return cash_register.opened_at < threshold


def _to_response(cash_register: CashRegister, with_movements: bool = True) -> CashRegisterResponse:
    """Convierte un CashRegister ORM a su schema de respuesta."""
    movements = []
    if with_movements and cash_register.movements:
        movements = [
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
            for m in cash_register.movements
        ]

    return CashRegisterResponse(
        id=cash_register.id,
        business_id=cash_register.business_id,
        opened_by=cash_register.opened_by,
        closed_by=cash_register.closed_by,
        status=cash_register.status,
        is_expired=_is_expired(cash_register),
        opening_amount=cash_register.opening_amount,
        opened_at=cash_register.opened_at,
        closed_at=cash_register.closed_at,
        counted_cash=cash_register.counted_cash,
        difference=cash_register.difference,
        difference_reason=cash_register.difference_reason,
        closing_pdf_path=cash_register.closing_pdf_path,
        movements=movements,
        created_at=cash_register.created_at,
    )


async def get_open_cash_register(
    db: AsyncSession,
    business_id: UUID,
) -> Optional[CashRegister]:
    """Retorna la caja actualmente abierta del negocio, o None si no hay."""
    result = await db.execute(
        select(CashRegister)
        .options(selectinload(CashRegister.movements))
        .where(
            and_(
                CashRegister.business_id == business_id,
                CashRegister.status == CashRegisterStatus.OPEN,
                CashRegister.deleted_at.is_(None),
            )
        )
    )
    return result.scalar_one_or_none()


async def get_current(
    db: AsyncSession,
    business_id: UUID,
) -> Optional[CashRegisterResponse]:
    """
    Retorna el estado de la caja del día:
    - Caja abierta (con movimientos)
    - None si no hay caja abierta
    """
    register = await get_open_cash_register(db, business_id)
    if not register:
        return None
    return _to_response(register, with_movements=True)


async def open_cash(
    db: AsyncSession,
    business_id: UUID,
    current_user: User,
    data: CashOpenRequest,
) -> CashRegisterResponse:
    """
    Abre una nueva caja para el negocio.
    Reglas:
    - Solo puede haber una caja abierta a la vez.
    - Si hay una caja vencida (>24hs), el operador debe cerrarla primero.
    """
    existing = await get_open_cash_register(db, business_id)
    if existing:
        if _is_expired(existing):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Hay una caja vencida (más de 24hs abierta). Cerrala antes de abrir una nueva.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya hay una caja abierta. Cerrala antes de abrir una nueva.",
        )

    register = CashRegister(
        business_id=business_id,
        opened_by=current_user.id,
        status=CashRegisterStatus.OPEN,
        opening_amount=data.opening_amount,
        opened_at=datetime.utcnow(),
    )
    db.add(register)
    await db.commit()
    await db.refresh(register)

    # Recargar con relaciones
    result = await db.execute(
        select(CashRegister)
        .options(selectinload(CashRegister.movements))
        .where(CashRegister.id == register.id)
    )
    register = result.scalar_one()
    return _to_response(register)


async def close_cash(
    db: AsyncSession,
    business_id: UUID,
    current_user: User,
    data: CashCloseRequest,
) -> CashRegisterResponse:
    """
    Cierra la caja activa.
    Reglas:
    - Debe haber una caja abierta.
    - Si hay diferencia != 0, el motivo es obligatorio.
    - Calcula la diferencia automáticamente.
    - Una vez cerrada, no puede reabrirse.
    """
    register = await get_open_cash_register(db, business_id)
    if not register:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay ninguna caja abierta para cerrar.",
        )

    # Calcular total esperado en efectivo
    summary = _calculate_summary(register)
    expected_cash = summary.expected_cash

    # Calcular diferencia
    difference = data.counted_cash - expected_cash

    # Validar motivo si hay diferencia
    if difference != 0 and not data.difference_reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El campo 'difference_reason' es obligatorio cuando hay una diferencia en el efectivo.",
        )

    register.status = CashRegisterStatus.CLOSED
    register.closed_by = current_user.id
    register.closed_at = datetime.utcnow()
    register.counted_cash = data.counted_cash
    register.difference = difference
    register.difference_reason = data.difference_reason

    await db.commit()
    await db.refresh(register)

    result = await db.execute(
        select(CashRegister)
        .options(selectinload(CashRegister.movements))
        .where(CashRegister.id == register.id)
    )
    register = result.scalar_one()
    return _to_response(register)


async def add_movement(
    db: AsyncSession,
    business_id: UUID,
    current_user: User,
    data: CashMovementCreateRequest,
) -> CashMovementResponse:
    """
    Registra un movimiento manual (INCOME o EXPENSE) en la caja activa.
    Reglas:
    - Debe haber una caja abierta y no vencida.
    """
    register = await get_open_cash_register(db, business_id)
    if not register:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay ninguna caja abierta para registrar movimientos.",
        )
    if _is_expired(register):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La caja está vencida (+24hs). Cerrala antes de registrar nuevos movimientos.",
        )

    movement = CashMovement(
        cash_register_id=register.id,
        type=data.type,
        payment_method=data.payment_method,
        amount=data.amount,
        description=data.description,
        created_by=current_user.id,
    )
    db.add(movement)
    await db.commit()
    await db.refresh(movement)

    return CashMovementResponse(
        id=movement.id,
        type=movement.type,
        payment_method=movement.payment_method,
        amount=movement.amount,
        description=movement.description,
        voucher_id=movement.voucher_id,
        created_by=movement.created_by,
        created_at=movement.created_at,
    )


async def get_summary(
    db: AsyncSession,
    business_id: UUID,
    cash_register_id: UUID,
) -> CashSummaryResponse:
    """
    Calcula el resumen de totales de una caja agrupado por método de pago.
    """
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caja no encontrada.",
        )

    return _calculate_summary(register)


def _calculate_summary(register: CashRegister) -> CashSummaryResponse:
    """Calcula totales por método de pago a partir de los movimientos."""
    # Inicializar acumuladores por método
    by_method: dict[CashPaymentMethod, PaymentMethodSummary] = {
        method: PaymentMethodSummary(payment_method=method)
        for method in CashPaymentMethod
    }

    for mv in register.movements:
        summary = by_method[mv.payment_method]
        if mv.type == CashMovementType.SALE:
            summary.total_sales += mv.amount
        elif mv.type == CashMovementType.PAYMENT_RECEIVED:
            summary.total_payments_received += mv.amount
        elif mv.type == CashMovementType.INCOME:
            summary.total_income += mv.amount
        elif mv.type == CashMovementType.EXPENSE:
            summary.total_expense += mv.amount

    # Calcular neto por método
    for summary in by_method.values():
        inflows = summary.total_sales + summary.total_payments_received + summary.total_income
        summary.net = inflows - summary.total_expense

    # Neto en efectivo + fondo inicial = efectivo esperado al cierre
    cash_net = by_method[CashPaymentMethod.CASH].net
    expected_cash = register.opening_amount + cash_net
    total_net = sum(s.net for s in by_method.values())

    return CashSummaryResponse(
        by_method=list(by_method.values()),
        total_net=total_net,
        expected_cash=expected_cash,
    )


async def create_automatic_movement(
    db: AsyncSession,
    cash_register: CashRegister,
    movement_type: CashMovementType,
    payment_method: CashPaymentMethod,
    amount: Decimal,
    description: str,
    created_by: UUID,
    voucher_id: Optional[UUID] = None,
) -> CashMovement:
    """
    Crea un movimiento automático (SALE o PAYMENT_RECEIVED).
    Usado internamente por el servicio de vouchers y de pagos.
    """
    movement = CashMovement(
        cash_register_id=cash_register.id,
        type=movement_type,
        payment_method=payment_method,
        amount=amount,
        description=description,
        voucher_id=voucher_id,
        created_by=created_by,
    )
    db.add(movement)
    # No hace commit: el caller es responsable
    return movement


async def get_history(
    db: AsyncSession,
    business_id: UUID,
    limit: int = 30,
) -> List[CashRegister]:
    """
    Retorna el historial de cajas cerradas del negocio,
    ordenadas de más reciente a más antigua.
    """
    result = await db.execute(
        select(CashRegister)
        .where(
            and_(
                CashRegister.business_id == business_id,
                CashRegister.status == CashRegisterStatus.CLOSED,
                CashRegister.deleted_at.is_(None),
            )
        )
        .order_by(desc(CashRegister.closed_at))
        .limit(limit)
    )
    return list(result.scalars().all())


async def generate_closure_pdf(
    db: AsyncSession,
    business_id: UUID,
    cash_register_id: UUID,
) -> bytes:
    """
    Genera el PDF de cierre de una caja.
    Funciona tanto para cajas recién cerradas como para histórico.
    """
    from pathlib import Path
    from jinja2 import Environment, FileSystemLoader
    from weasyprint import HTML
    from sqlalchemy import select
    from app.models.business import Business
    from app.models.user import User

    # Obtener la caja con sus movimientos
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

    # Obtener datos del negocio
    biz_result = await db.execute(
        select(Business).where(Business.id == business_id)
    )
    business = biz_result.scalar_one_or_none()

    # Obtener nombres de operadores
    opener_result = await db.execute(
        select(User).where(User.id == register.opened_by)
    )
    opener = opener_result.scalar_one_or_none()

    closer = None
    if register.closed_by:
        closer_result = await db.execute(
            select(User).where(User.id == register.closed_by)
        )
        closer = closer_result.scalar_one_or_none()

    # Calcular summary
    summary = _calculate_summary(register)

    PAYMENT_LABELS = {
        "CASH": "Efectivo",
        "CARD": "Tarjeta",
        "TRANSFER": "Transferencia",
        "CHECK": "Cheque",
        "OTHER": "Otro",
    }
    TYPE_LABELS = {
        "SALE": "Venta",
        "PAYMENT_RECEIVED": "Cobro cta. cte.",
        "INCOME": "Ingreso manual",
        "EXPENSE": "Egreso manual",
    }

    def fmt(value) -> str:
        """Formatea un número como moneda argentina."""
        return f"$ {float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    # Preparar datos por método
    by_method_data = []
    for m in summary.by_method:
        by_method_data.append({
            "label": PAYMENT_LABELS.get(m.payment_method.value, m.payment_method.value),
            "total_sales": float(m.total_sales),
            "total_sales_fmt": fmt(m.total_sales),
            "total_payments_received": float(m.total_payments_received),
            "total_payments_received_fmt": fmt(m.total_payments_received),
            "total_income": float(m.total_income),
            "total_income_fmt": fmt(m.total_income),
            "total_expense": float(m.total_expense),
            "total_expense_fmt": fmt(m.total_expense),
            "net": float(m.net),
            "net_fmt": fmt(m.net),
        })

    # Totales generales
    total_sales = sum(m.total_sales for m in summary.by_method)
    total_payments = sum(m.total_payments_received for m in summary.by_method)
    total_income = sum(m.total_income for m in summary.by_method)
    total_expense = sum(m.total_expense for m in summary.by_method)
    cash_net = next(
        (m.net for m in summary.by_method if m.payment_method.value == "CASH"),
        Decimal("0")
    )
    difference = register.difference or Decimal("0")

    # Movimientos
    movements_data = []
    for mv in sorted(register.movements, key=lambda m: m.created_at):
        is_expense = mv.type.value == "EXPENSE"
        movements_data.append({
            "time": mv.created_at.strftime("%H:%M"),
            "description": mv.description,
            "type_label": TYPE_LABELS.get(mv.type.value, mv.type.value),
            "method_label": PAYMENT_LABELS.get(mv.payment_method.value, mv.payment_method.value),
            "amount_fmt": fmt(mv.amount),
            "is_expense": is_expense,
        })

    # Fechas formateadas
    def fmt_dt(dt) -> str:
        if not dt:
            return "—"
        return dt.strftime("%d/%m/%Y %H:%M")

    closed_date = register.closed_at.strftime("%d/%m/%Y") if register.closed_at else "—"

    context = {
        "business": {
            "name": business.name if business else "Mi Negocio",
            "cuit": business.cuit if business else "—",
            "address": business.address if business else "",
            "city": business.city if business else "",
            "phone": business.phone if business else "",
        },
        "closed_date": closed_date,
        "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "opened_at": fmt_dt(register.opened_at),
        "closed_at": fmt_dt(register.closed_at),
        "opener_name": opener.name if opener else "—",
        "closer_name": closer.name if closer else "—",
        "opening_amount": fmt(register.opening_amount),
        "total_movements": len(register.movements),
        "by_method": by_method_data,
        "total_sales_fmt": fmt(total_sales),
        "total_payments_fmt": fmt(total_payments),
        "total_income_fmt": fmt(total_income),
        "total_expense_fmt": fmt(total_expense),
        "total_net_fmt": fmt(summary.total_net),
        "cash_net_fmt": fmt(cash_net),
        "expected_cash_fmt": fmt(summary.expected_cash),
        "counted_cash_fmt": fmt(register.counted_cash or 0),
        "difference": float(difference),
        "difference_fmt": fmt(difference),
        "difference_reason": register.difference_reason or "",
        "movements": movements_data,
    }

    # Renderizar con Jinja2 y WeasyPrint
    TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "pdf"
    jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
    template = jinja_env.get_template("cash_register_closure.html")
    html_content = template.render(**context)
    return HTML(string=html_content).write_pdf()
