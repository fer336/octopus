"""
Router de Acopio (Stockpile).
Endoints REST para gestionar acopios.
"""
import io
import logging
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models import Stockpile, StockpileItem, StockpilePriceSnapshot, StockpileStatus, Voucher, VoucherStatus, VoucherType, Product
from app.models.client import Client
from app.models.user import User
from app.routers.auth import get_current_user
from app.utils.security import get_current_business, require_module_access, security
from app.schemas.base import PaginatedResponse
from app.schemas.stockpile import (
    StockpileCreate,
    StockpileCreateByAmount,
    StockpileItemResponse,
    StockpileListItem,
    StockpileListResponse,
    StockpileOpenResponse,
    StockpileResponse,
    StockpileSummary,
    StockpileSummaryItem,
    StockpileTreeChildVoucher,
    StockpileTreeItem,
    StockpileTreeResponse,
    StockpileUpdate,
    StockpileWithdrawCreate,
    ValidateWithdrawalRequest,
    ValidateWithdrawalResponse,
    StockpileOpenItem,
)
from app.services.stockpile_service import StockpileService
from app.services.stockpile_snapshot_service import StockpileSnapshotService

logger = logging.getLogger("uvicorn")

router = APIRouter(
    prefix="/stockpiles",
    tags=["stockpiles"],
    dependencies=[Depends(require_module_access("stockpiles"))],
)

internal_router = APIRouter(
    prefix="/stockpiles",
    tags=["stockpiles"],
)


async def authorize_price_snapshot_download(
    stockpile: Stockpile,
    db: AsyncSession,
    credentials: HTTPAuthorizationCredentials | None,
) -> None:
    """Autoriza descarga por JWT del frontend."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales no proporcionadas",
        )

    current_user = await get_current_user(credentials=credentials, db=db)
    business_id = await get_current_business(db=db, current_user=current_user)
    if stockpile.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Acopio no encontrado",
        )


def serialize_stockpile_item(item) -> StockpileItemResponse:
    """Serializa un ítem de acopio."""
    return StockpileItemResponse(
        id=item.id,
        product_id=item.product_id,
        product_code=item.product_code,
        product_description=item.product_description,
        quantity_initial=item.quantity_initial,
        quantity_withdrawn=item.quantity_withdrawn,
        quantity_remaining=item.quantity_remaining,
        currency=item.currency,
        frozen_unit_price=item.frozen_unit_price,
        frozen_iva_rate=item.frozen_iva_rate,
        frozen_iva_amount=item.frozen_iva_amount,
        frozen_subtotal=item.frozen_subtotal,
        frozen_total=item.frozen_total,
    )


def serialize_stockpile(
    stockpile: Stockpile,
    include_items: bool = True,
    items_override: list | None = None,
    client_name_override: str | None = None,
    billing_client_name_override: str | None = None,
    principal_voucher_number_override: str | None = None,
) -> StockpileResponse:
    """Serializa un acopio completo."""
    # Cliente
    client_name = client_name_override
    loaded_client = stockpile.__dict__.get("client")
    if client_name is None and loaded_client:
        client_name = loaded_client.name

    # Cliente de facturación
    billing_client_name = billing_client_name_override
    loaded_billing_client = stockpile.__dict__.get("billing_client")
    if billing_client_name is None and loaded_billing_client:
        billing_client_name = loaded_billing_client.name

    # Usuario
    created_by_name = None
    loaded_created_by_user = stockpile.__dict__.get("created_by_user")
    if loaded_created_by_user:
        created_by_name = loaded_created_by_user.name or loaded_created_by_user.email

    principal_voucher_number = principal_voucher_number_override
    loaded_principal_voucher = stockpile.__dict__.get("principal_voucher")
    if principal_voucher_number is None and loaded_principal_voucher:
        principal_voucher_number = loaded_principal_voucher.full_number

    # Items
    items = []
    if items_override is not None:
        for item in items_override:
            items.append(serialize_stockpile_item(item))
    elif include_items:
        for item in stockpile.items:
            items.append(serialize_stockpile_item(item))

    return StockpileResponse(
        id=stockpile.id,
        business_id=stockpile.business_id,
        client_id=stockpile.client_id,
        client_name=client_name or "Unknown",
        billing_client_id=stockpile.billing_client_id,
        billing_client_name=billing_client_name,
        created_by=stockpile.created_by,
        created_by_name=created_by_name,
        name=stockpile.name,
        stockpile_number=stockpile.stockpile_number,
        description=stockpile.description,
        status=stockpile.status,
        currency=stockpile.currency,
        exchange_rate=stockpile.exchange_rate,
        discount_percent=stockpile.discount_percent,
        initial_amount=stockpile.initial_amount,
        withdrawn_amount=stockpile.withdrawn_amount,
        remaining_amount=stockpile.remaining_amount,
        created_at=stockpile.created_at,
        completed_at=stockpile.completed_at,
        expiration_mode=stockpile.expiration_mode or "none",
        due_date=stockpile.due_date,
        principal_voucher_id=stockpile.principal_voucher_id,
        principal_voucher_number=principal_voucher_number,
        notes=stockpile.notes,
        items=items,
    )


@router.get("", response_model=PaginatedResponse[StockpileListItem])
async def list_stockpiles(
    client_id: UUID | None = Query(None, description="Filtrar por cliente"),
    status: str | None = Query(None, description="Filtrar por estado"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Lista todos los acopios del negocio."""
    service = StockpileService(db)

    stockpiles, total = await service.list(
        business_id,
        client_id=client_id,
        status=status,
        page=page,
        per_page=per_page,
    )

    items = []
    for s in stockpiles:
        # Cliente
        client_name = s.client.name if s.client else "Unknown"
        billing_client_name = (
            s.billing_client.name if s.billing_client else None
        )

        items.append(
            StockpileListItem(
                id=s.id,
                client_name=client_name,
                billing_client_name=billing_client_name,
                name=s.name,
                stockpile_number=s.stockpile_number,
                description=s.description,
                status=s.status,
                initial_amount=s.initial_amount,
                withdrawn_amount=s.withdrawn_amount,
                remaining_amount=s.remaining_amount,
                created_at=s.created_at,
            )
        )

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/tree", response_model=StockpileTreeResponse)
async def list_stockpiles_tree(
    status_filter: str | None = Query(None, alias="status", description="Filtrar por estado"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Lista acopios como árbol: acopio/remito principal → remitos parciales."""

    query = (
        select(Stockpile, Client.name, Client.email, Client.phone, Voucher.sale_point, Voucher.number)
        .join(Client, Client.id == Stockpile.client_id)
        .outerjoin(Voucher, Voucher.id == Stockpile.principal_voucher_id)
        .where(Stockpile.business_id == business_id)
        .order_by(Stockpile.created_at.desc())
        .limit(100)
    )
    if status_filter:
        query = query.where(Stockpile.status == status_filter)
    else:
        # Por defecto, no mostrar archivados en árbol activo
        query = query.where(Stockpile.status != StockpileStatus.ARCHIVED)

    result = await db.execute(query)
    rows = result.all()

    stockpile_ids = [stockpile.id for stockpile, *_ in rows]
    children_by_stockpile: dict[UUID, list[Voucher]] = {}
    snapshot_stockpile_ids: set[UUID] = set()
    if stockpile_ids:
        child_result = await db.execute(
            select(Voucher)
            .where(
                Voucher.business_id == business_id,
                Voucher.stockpile_id.in_(stockpile_ids),
                Voucher.deleted_at.is_(None),
            )
            .order_by(Voucher.stockpile_id.asc(), Voucher.date.asc(), Voucher.number.asc())
        )
        for child in child_result.scalars().all():
            sid = child.stockpile_id
            if sid not in children_by_stockpile:
                children_by_stockpile[sid] = []
            children_by_stockpile[sid].append(child)

        snapshot_result = await db.execute(
            select(StockpilePriceSnapshot.stockpile_id)
            .where(
                StockpilePriceSnapshot.stockpile_id.in_(stockpile_ids),
                StockpilePriceSnapshot.deleted_at.is_(None),
            )
            .group_by(StockpilePriceSnapshot.stockpile_id)
        )
        snapshot_stockpile_ids = set(snapshot_result.scalars().all())

    items: list[StockpileTreeItem] = []
    for stockpile, client_name, client_email, client_phone, sale_point, number in rows:
        child_vouchers = [
            StockpileTreeChildVoucher(
                id=child.id,
                number=child.full_number,
                date=child.date,
                total=child.total,
                status=child.status.value if hasattr(child.status, "value") else str(child.status),
            )
            for child in children_by_stockpile.get(stockpile.id, [])
        ]

        principal_number = f"{sale_point}-{number}" if sale_point and number else None
        items.append(
            StockpileTreeItem(
                id=stockpile.id,
                client_id=stockpile.client_id,
                billing_client_id=stockpile.billing_client_id,
                name=stockpile.name,
                stockpile_number=stockpile.stockpile_number,
                description=stockpile.description,
                client_name=client_name,
                client_email=client_email,
                client_phone=client_phone,
                status=stockpile.status,
                created_at=stockpile.created_at,
                principal_voucher_id=stockpile.principal_voucher_id,
                principal_voucher_number=principal_number,
                initial_amount=stockpile.initial_amount,
                withdrawn_amount=stockpile.withdrawn_amount,
                remaining_amount=stockpile.remaining_amount,
                has_price_snapshot=stockpile.id in snapshot_stockpile_ids,
                child_vouchers=child_vouchers,
            )
        )

    return StockpileTreeResponse(items=items, total=len(items))


@router.post(
    "", response_model=StockpileResponse, status_code=status.HTTP_201_CREATED
)
async def create_stockpile(
    data: StockpileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Crea un nuevo acopio."""
    service = StockpileService(db)

    # Preparar items
    items_data = [
        {"product_id": item.product_id, "quantity": item.quantity}
        for item in data.items
    ]

    stockpile, items = await service.create(
        business_id=business_id,
        client_id=data.client_id,
        created_by=current_user.id,
        name=data.name,
        currency=data.currency,
        exchange_rate=data.exchange_rate,
        billing_client_id=data.billing_client_id,
        items_data=items_data,
        expiration_mode=data.expiration_mode,
        due_date=data.due_date,
        principal_voucher_id=data.principal_voucher_id,
    )

    principal_voucher = (
        await db.get(Voucher, stockpile.principal_voucher_id)
        if stockpile.principal_voucher_id
        else None
    )

    return serialize_stockpile(
        stockpile,
        items_override=items,
        principal_voucher_number_override=(
            principal_voucher.full_number if principal_voucher else None
        ),
    )


@router.post(
    "/by-amount", response_model=StockpileResponse, status_code=status.HTTP_201_CREATED
)
async def create_stockpile_by_amount(
    data: StockpileCreateByAmount,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """
    Crea un acopio por monto fijo (sin productos específicos).
    El descuento se aplica en retiros futuros.
    """
    service = StockpileService(db)
    try:
        stockpile, item = await service.create_by_amount(
            business_id=business_id,
            client_id=data.client_id,
            created_by=current_user.id,
            name=data.name,
            description=data.description,
            currency=data.currency,
            exchange_rate=data.exchange_rate,
            billing_client_id=data.billing_client_id,
            amount=data.amount,
            discount_percent=data.discount_percent,
            expiration_mode=data.expiration_mode,
            due_date=data.due_date,
            principal_voucher_id=data.principal_voucher_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    logger.info(f"Stockpile by amount created: {stockpile.id}, amount={data.amount}")
    client = await db.get(Client, stockpile.client_id)
    billing_client = (
        await db.get(Client, stockpile.billing_client_id)
        if stockpile.billing_client_id
        else None
    )
    principal_voucher = (
        await db.get(Voucher, stockpile.principal_voucher_id)
        if stockpile.principal_voucher_id
        else None
    )

    return serialize_stockpile(
        stockpile,
        items_override=[item],
        client_name_override=client.name if client else None,
        billing_client_name_override=billing_client.name if billing_client else None,
        principal_voucher_number_override=(
            principal_voucher.full_number if principal_voucher else None
        ),
    )


# ========================================
# ENDPOINTS DE REMITOS HIJOS DE ACPIO - DEBEN ESTAR ANTES DE /{stockpile_id}
# Usar /acopio-voucher/ para evitar conflictos
# ========================================


@router.get("/acopio-voucher/{voucher_id}/pdf", tags=["acopio-vouchers"])
async def get_acopio_voucher_pdf(
    voucher_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Genera y devuelve el PDF inline de un remito hijo de acopio."""
    from app.services.voucher_service import VoucherService
    
    service = VoucherService(db)
    try:
        voucher = await service.get_by_id(voucher_id, business_id)
        if not voucher:
            raise HTTPException(status_code=404, detail="Remito no encontrado")
        
        pdf_bytes = await service.generate_pdf(voucher_id, business_id)
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=voucher_{voucher_id}.pdf"
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Error al generar PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error al generar PDF: {str(e)}")


@router.post("/{stockpile_id}/remitos/{remito_id}/anular", tags=["acopio-vouchers"])
async def cancel_partial_receipt(
    stockpile_id: UUID,
    remito_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Anula remito parcial de acopio revirtiendo montos y stock (transaccional)."""
    try:
        started_nested = db.in_transaction()
        tx_ctx = db.begin_nested() if started_nested else db.begin()
        async with tx_ctx:
            stockpile = (
                await db.execute(
                    select(Stockpile).where(
                        Stockpile.id == stockpile_id,
                        Stockpile.business_id == business_id,
                    )
                )
            ).scalar_one_or_none()

            if not stockpile:
                raise HTTPException(status_code=404, detail="Acopio no encontrado")

            remito = (
                await db.execute(
                    select(Voucher).where(
                        Voucher.id == remito_id,
                        Voucher.business_id == business_id,
                        Voucher.stockpile_id == stockpile_id,
                        Voucher.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()

            if not remito:
                raise HTTPException(status_code=404, detail="Remito no encontrado para el acopio indicado")

            if remito.voucher_type != VoucherType.RECEIPT:
                raise HTTPException(status_code=400, detail="Solo se pueden anular remitos")

            if remito.status == VoucherStatus.CANCELLED:
                raise HTTPException(status_code=400, detail="El remito ya está anulado")

            if stockpile.status == StockpileStatus.COMPLETED and stockpile.completed_at is not None:
                raise HTTPException(status_code=400, detail="El acopio está cerrado/completado y no admite anulación")

            # Revertir monto del acopio
            remito_total = Decimal(str(remito.total or 0))
            stockpile.withdrawn_amount = max(Decimal("0"), Decimal(str(stockpile.withdrawn_amount or 0)) - remito_total)
            stockpile.remaining_amount = Decimal(str(stockpile.remaining_amount or 0)) + remito_total

            # Revertir stock de productos y stockpile items
            remito_items = (
                await db.execute(select(StockpileItem).where(StockpileItem.stockpile_id == stockpile_id))
            ).scalars().all()
            stockpile_item_by_product = {it.product_id: it for it in remito_items if it.product_id}

            from app.models.voucher_item import VoucherItem
            vitems = (
                await db.execute(select(VoucherItem).where(VoucherItem.voucher_id == remito_id))
            ).scalars().all()

            # Anti-deadlock: adquirir locks de productos en orden determinístico
            vitems_sorted = sorted(
                [vi for vi in vitems if vi.product_id],
                key=lambda i: str(i.product_id),
            )

            for vi in vitems_sorted:
                product = (
                    await db.execute(
                        select(Product)
                        .where(Product.id == vi.product_id)
                        .with_for_update()
                    )
                ).scalar_one_or_none()

                if product:
                    product.current_stock = int(product.current_stock or 0) + int(vi.quantity or 0)

                spi = stockpile_item_by_product.get(vi.product_id)
                if spi:
                    q = Decimal(str(vi.quantity or 0))
                    spi.quantity_withdrawn = max(Decimal("0"), Decimal(str(spi.quantity_withdrawn or 0)) - q)
                    spi.quantity_remaining = Decimal(str(spi.quantity_remaining or 0)) + q

            # Estado remito: anulado (soft business state)
            remito.status = VoucherStatus.CANCELLED
            remito.internal_notes = (remito.internal_notes or "") + "\n[ANULADO] Remito parcial anulado y revertido."

            # Recalcular estado acopio
            active_remitos = (
                await db.execute(
                    select(func.count())
                    .select_from(Voucher)
                    .where(
                        Voucher.stockpile_id == stockpile_id,
                        Voucher.deleted_at.is_(None),
                        Voucher.status != VoucherStatus.CANCELLED,
                    )
                )
            ).scalar() or 0

            withdrawn = Decimal(str(stockpile.withdrawn_amount or 0))
            initial = Decimal(str(stockpile.initial_amount or 0))
            if withdrawn <= Decimal("0"):
                stockpile.withdrawn_amount = Decimal("0")
                stockpile.remaining_amount = initial
                if active_remitos == 0:
                    stockpile.status = StockpileStatus.CANCELLED
                    stockpile.completed_at = datetime.utcnow()
                else:
                    stockpile.status = StockpileStatus.OPEN
                    stockpile.completed_at = None
            elif withdrawn < initial:
                stockpile.status = StockpileStatus.PARTIAL
                stockpile.completed_at = None
            else:
                stockpile.status = StockpileStatus.COMPLETED
                stockpile.completed_at = datetime.utcnow()

        # Si entramos en nested transaction, hacemos commit explícito de la transacción exterior
        # para evitar que el cambio quede sólo en savepoint y luego se revierta.
        if started_nested and db.in_transaction():
            await db.commit()

        return {"message": "Remito anulado correctamente. Se revirtieron stock y montos."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo anular el remito: {e}")


# Compatibilidad: endpoint anterior ahora delega a anulación
@router.delete("/acopio-voucher/{voucher_id}", tags=["acopio-vouchers"])
async def delete_acopio_voucher(
    voucher_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    remito = (
        await db.execute(
            select(Voucher).where(
                Voucher.id == voucher_id,
                Voucher.business_id == business_id,
                Voucher.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not remito or not remito.stockpile_id:
        raise HTTPException(status_code=404, detail="Remito no encontrado")
    return await cancel_partial_receipt(remito.stockpile_id, voucher_id, db, current_user, business_id)


@router.post("/{stockpile_id}/cancelar")
async def cancel_stockpile_explicit(
    stockpile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Cancela un acopio sólo si no tiene remitos activos."""
    stockpile = (
        await db.execute(
            select(Stockpile).where(
                Stockpile.id == stockpile_id,
                Stockpile.business_id == business_id,
            )
        )
    ).scalar_one_or_none()
    if not stockpile:
        raise HTTPException(status_code=404, detail="Acopio no encontrado")

    active_remitos = (
        await db.execute(
            select(func.count())
            .select_from(Voucher)
            .where(
                Voucher.stockpile_id == stockpile_id,
                Voucher.deleted_at.is_(None),
                Voucher.status != VoucherStatus.CANCELLED,
            )
        )
    ).scalar() or 0

    if active_remitos > 0:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "El acopio tiene remitos activos. Anulá los remitos antes de cancelar."},
        )

    stockpile.withdrawn_amount = Decimal("0")
    stockpile.remaining_amount = Decimal(str(stockpile.initial_amount or 0))
    stockpile.status = StockpileStatus.CANCELLED
    stockpile.completed_at = datetime.utcnow()
    await db.commit()
    return {"message": "Acopio cancelado correctamente"}


@router.post("/archivar-cancelados")
async def archive_cancelled_stockpiles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Archiva en lote todos los acopios cancelados."""
    result = await db.execute(
        select(Stockpile).where(
            Stockpile.business_id == business_id,
            Stockpile.status == StockpileStatus.CANCELLED,
        )
    )
    rows = result.scalars().all()
    for sp in rows:
        sp.status = StockpileStatus.ARCHIVED
    await db.commit()
    return {"message": "Acopios cancelados archivados", "count": len(rows)}


@router.get("/{stockpile_id}", response_model=StockpileResponse)
async def get_stockpile(
    stockpile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene un acopio por ID."""
    service = StockpileService(db)

    stockpile = await service.get_by_id(stockpile_id, business_id)
    if not stockpile:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Acopio no encontrado"},
        )

    return serialize_stockpile(stockpile)


@router.put("/{stockpile_id}", response_model=StockpileResponse)
async def update_stockpile(
    stockpile_id: UUID,
    data: StockpileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza un acopio (nombre, descripción, notas, status)."""
    service = StockpileService(db)

    stockpile = await service.get_by_id(stockpile_id, business_id)
    if not stockpile:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Acopio no encontrado"},
        )

    # Aplicar updates
    if data.name is not None:
        stockpile.name = data.name
    if data.description is not None:
        stockpile.description = data.description
    if data.notes is not None:
        stockpile.notes = data.notes
    if data.status is not None:
        if data.status == StockpileStatus.COMPLETED:
            await service.close(stockpile, force=True)
        elif data.status == StockpileStatus.CANCELLED:
            await service.cancel(stockpile)

    await db.commit()
    await db.refresh(stockpile)

    return serialize_stockpile(stockpile)


@router.delete("/{stockpile_id}")
async def delete_stockpile(
    stockpile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Cancela un acopio."""
    service = StockpileService(db)

    stockpile = await service.get_by_id(stockpile_id, business_id)
    if not stockpile:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Acopio no encontrado"},
        )

    try:
        await service.cancel(stockpile)
        return {"message": "Acopio cancelado"}
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(e)},
        )


@router.post("/{stockpile_id}/withdraw")
async def withdraw_from_stockpile(
    stockpile_id: UUID,
    data: StockpileWithdrawCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """
    Retira productos del acopio.
    Retorna lositems actualizados y los faltantes (si hay).
    """
    service = StockpileService(db)

    stockpile = await service.get_by_id(stockpile_id, business_id)
    if not stockpile:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Acopio no encontrado"},
        )

    items_data = [
        {"product_id": item.product_id, "quantity": item.quantity}
        for item in data.items
    ]

    try:
        updated, insufficient = await service.withdraw(stockpile, items_data)

        # Serializar
        updated_items = [serialize_stockpile_item(i) for i in updated]
        insufficient_items = [serialize_stockpile_item(i) for i in insufficient]

        return {
            "stockpile": serialize_stockpile(stockpile),
            "withdrawn_items": updated_items,
            "insufficient_items": insufficient_items,
            "message": f"Retirados {len(updated_items)} productos",
        }

    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(e)},
        )


@router.post("/{stockpile_id}/close")
async def close_stockpile(
    stockpile_id: UUID,
    force: bool = Query(False, description="Forzar cierre aunque tenga saldo"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Cierra un acopio."""
    service = StockpileService(db)

    stockpile = await service.get_by_id(stockpile_id, business_id)
    if not stockpile:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Acopio no encontrado"},
        )

    try:
        stockpile = await service.close(stockpile, force=force)
        return {
            "stockpile": serialize_stockpile(stockpile),
            "message": "Acopio cerrado",
        }
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(e)},
        )


# ──────────────────────────────────────────────────────────
# Endpoints para Remito UI
# ──────────────────────────────────────────────────────────


def serialize_stockpile_open(
    stockpile,
    principal_voucher_number_override: str | None = None,
) -> StockpileOpenItem:
    """Serializa acopio para lista de abiertos."""
    # Obtener número de voucher principal si existe
    principal_voucher_number = principal_voucher_number_override
    loaded_principal = stockpile.__dict__.get("principal_voucher")
    if principal_voucher_number is None and loaded_principal:
        principal_voucher_number = loaded_principal.full_number

    return StockpileOpenItem(
        id=stockpile.id,
        name=stockpile.name,
        status=stockpile.status,
        created_at=stockpile.created_at,
        expiration_mode=stockpile.expiration_mode,
        due_date=stockpile.due_date,
        principal_voucher_id=stockpile.principal_voucher_id,
        principal_voucher_number=principal_voucher_number,
        initial_amount=stockpile.initial_amount,
        withdrawn_amount=stockpile.withdrawn_amount,
        remaining_amount=stockpile.remaining_amount,
        currency=stockpile.currency,
        discount_percent=stockpile.discount_percent,
    )


@router.get(
    "/by-client/{client_id}/open", response_model=StockpileOpenResponse
)
async def list_open_stockpiles_by_client(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Lista acopios abiertos para un cliente."""
    service = StockpileService(db)

    stockpiles = await service.list_open_by_client(business_id, client_id)

    items = []
    for row in stockpiles:
        items.append(
            serialize_stockpile_open(
                row["stockpile"],
                principal_voucher_number_override=row["principal_voucher_number"],
            )
        )

    return StockpileOpenResponse(items=items, total=len(items))


@router.get("/{stockpile_id}/summary", response_model=StockpileSummary)
async def get_stockpile_summary(
    stockpile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene summary de un acopio para Remito UI."""
    service = StockpileService(db)

    summary = await service.get_summary(stockpile_id, business_id)
    if not summary:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Acopio no encontrado"},
        )

    # Serializar ítems
    items = []
    for item in summary["items"]:
        items.append(
            StockpileSummaryItem(
                stockpile_item_id=item.id,
                product_id=item.product_id,
                product_code=item.product_code,
                product_description=item.product_description,
                quantity_initial=item.quantity_initial,
                quantity_withdrawn=item.quantity_withdrawn,
                quantity_remaining=item.quantity_remaining,
                frozen_unit_price=item.frozen_unit_price,
                frozen_iva_rate=item.frozen_iva_rate,
                frozen_iva_amount=item.frozen_iva_amount,
                frozen_subtotal=item.frozen_subtotal,
                frozen_total=item.frozen_total,
                currency=item.currency,
            )
        )

    return StockpileSummary(
        stockpile_id=summary["stockpile_id"],
        name=summary["name"],
        status=summary["status"],
        created_at=summary["created_at"],
        snapshot_date=summary["snapshot_date"],
        prices_valid_at=summary["prices_valid_at"],
        initial_amount=summary["initial_amount"],
        withdrawn_amount=summary["withdrawn_amount"],
        remaining_amount=summary["remaining_amount"],
        child_remitos_count=summary["child_remitos_count"],
        principal_voucher_id=summary["principal_voucher_id"],
        principal_voucher_number=summary["principal_voucher_number"],
        items=items,
    )


@router.post(
    "/{stockpile_id}/validate-withdrawal",
    response_model=ValidateWithdrawalResponse,
)
async def validate_stockpile_withdrawal(
    stockpile_id: UUID,
    data: ValidateWithdrawalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Valida si un retiro puede realizarse."""
    service = StockpileService(db)

    result = await service.validate_withdrawal(
        stockpile_id, business_id, data.withdrawal_amount
    )

    return ValidateWithdrawalResponse(**result)


@router.get(
    "/{stockpile_id}/frozen-items", response_model=list[StockpileSummaryItem]
)
async def get_frozen_items(
    stockpile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene los ítems congelados de un acopio para Remito UI."""
    service = StockpileService(db)

    items = await service.get_frozen_items(stockpile_id, business_id)
    if items is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Acopio no encontrado"},
        )

    # Serializar
    result = []
    for item in items:
        result.append(
            StockpileSummaryItem(
                stockpile_item_id=item.id,
                product_id=item.product_id,
                product_code=item.product_code,
                product_description=item.product_description,
                quantity_initial=item.quantity_initial,
                quantity_withdrawn=item.quantity_withdrawn,
                quantity_remaining=item.quantity_remaining,
                frozen_unit_price=item.frozen_unit_price,
                frozen_iva_rate=item.frozen_iva_rate,
                frozen_iva_amount=item.frozen_iva_amount,
                frozen_subtotal=item.frozen_subtotal,
                frozen_total=item.frozen_total,
                currency=item.currency,
            )
        )

    return result


@internal_router.get("/{stockpile_id}/price-snapshot/excel")
async def download_price_snapshot_excel(
    stockpile_id: UUID,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    """Descarga el Excel de precios congelados de un acopio por monto."""
    stockpile = await db.get(Stockpile, stockpile_id)
    if not stockpile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Acopio no encontrado",
        )
    await authorize_price_snapshot_download(stockpile, db, credentials)

    snapshot_service = StockpileSnapshotService(db)
    snapshots = await snapshot_service.get_snapshots(stockpile_id)

    if not snapshots:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay snapshots de precios para este acopio. "
                   "Solo los acopios por monto generan snapshots.",
        )

    excel_bytes = snapshot_service.generate_excel(snapshots, stockpile.name or "Acopio")

    filename = f"precios_congelados_{stockpile.stockpile_number or stockpile_id}_{datetime.utcnow().strftime('%Y_%m_%d')}.xlsx"

    return StreamingResponse(
        iter([excel_bytes.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
        },
    )
