"""
Router de Órdenes de Pedido.
Endpoints para control de inventario físico y gestión de órdenes a proveedores.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.purchase_order import PurchaseOrderStatus
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.purchase_order import (
    PurchaseOrderCreate,
    PurchaseOrderListItem,
    PurchaseOrderResponse,
    PurchaseOrderUpdate,
)
from app.models.business import Business
from app.services.purchase_order_service import PurchaseOrderService
from app.services.pdf_service import pdf_service
from app.utils.security import get_current_business, get_current_user

router = APIRouter(prefix="/purchase-orders", tags=["Órdenes de Pedido"])


# ---------------------------------------------------------------------------
# Planilla de conteo (PDF)
# ---------------------------------------------------------------------------


@router.get("/inventory-count/pdf")
async def download_inventory_count_pdf(
    supplier_id: Optional[UUID] = Query(None, description="Filtrar por proveedor"),
    category_id: Optional[UUID] = Query(None, description="Filtrar por categoría"),
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Genera y descarga la planilla de conteo físico en PDF.
    Requiere al menos un filtro: supplier_id o category_id.
    """
    if not supplier_id and not category_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe especificar al menos un proveedor o una categoría",
        )

    service = PurchaseOrderService(db)
    products = await service.get_products_for_count_sheet(
        business_id=current_business,
        supplier_id=supplier_id,
        category_id=category_id,
    )

    if not products:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontraron productos activos con los filtros indicados",
        )

    # Cargar objeto Business completo para el PDF
    business = await db.get(Business, current_business)

    # Resolver nombres para el PDF y el nombre del archivo
    supplier_name = ""
    category_name = ""
    if products:

        first = products[0]
        if first.supplier:
            supplier_name = first.supplier.name
        if first.category:
            category_name = first.category.name

    pdf_bytes = pdf_service.generate_inventory_count_pdf(
        business=business,
        products=products,
        supplier_name=supplier_name,
        category_name=category_name,
    )

    suffix = ""
    if supplier_name:
        suffix += f"_{supplier_name[:15].replace(' ', '_')}"
    if category_name:
        suffix += f"_{category_name[:15].replace(' ', '_')}"
    from datetime import date
    filename = f"planilla_conteo{suffix}_{date.today().strftime('%Y_%m_%d')}.pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# CRUD Órdenes de Pedido
# ---------------------------------------------------------------------------


@router.get("", response_model=PaginatedResponse[PurchaseOrderListItem])
async def list_purchase_orders(
    supplier_id: Optional[UUID] = Query(None),
    category_id: Optional[UUID] = Query(None),
    status: Optional[PurchaseOrderStatus] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Lista todas las órdenes de pedido con filtros y paginación."""
    service = PurchaseOrderService(db)
    result = await service.list(
        business_id=current_business,
        supplier_id=supplier_id,
        category_id=category_id,
        status=status,
        page=page,
        per_page=per_page,
    )
    return result


@router.post("", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    data: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Crea una nueva orden de pedido en estado DRAFT.
    Los precios de costo se calculan automáticamente pero son editables.
    """
    service = PurchaseOrderService(db)
    try:
        order = await service.create(
            business_id=current_business,
            user_id=current_user.id,
            data=data,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return order


@router.get("/{order_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Obtiene el detalle completo de una orden de pedido."""
    service = PurchaseOrderService(db)
    order = await service.get_by_id(order_id, current_business)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orden de pedido no encontrada",
        )
    return order


@router.put("/{order_id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(
    order_id: UUID,
    data: PurchaseOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Actualiza una orden de pedido en estado DRAFT.
    No se pueden editar órdenes ya confirmadas.
    """
    service = PurchaseOrderService(db)
    try:
        order = await service.update(order_id, current_business, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orden de pedido no encontrada",
        )
    return order


@router.post("/{order_id}/confirm", response_model=PurchaseOrderResponse)
async def confirm_purchase_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Confirma una orden de pedido (DRAFT → CONFIRMED)."""
    service = PurchaseOrderService(db)
    try:
        order = await service.confirm(order_id, current_business)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orden de pedido no encontrada",
        )
    return order


@router.delete("/{order_id}", response_model=MessageResponse)
async def delete_purchase_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Elimina una orden de pedido (solo si está en DRAFT)."""
    service = PurchaseOrderService(db)
    try:
        deleted = await service.delete(order_id, current_business)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orden de pedido no encontrada",
        )
    return MessageResponse(message="Orden de pedido eliminada correctamente")


@router.get("/{order_id}/pdf")
async def download_purchase_order_pdf(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Descarga el PDF de una orden de pedido."""
    service = PurchaseOrderService(db)
    order = await service.get_by_id(order_id, current_business)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Orden de pedido no encontrada",
        )

    # Cargar objeto Business completo para el PDF
    business = await db.get(Business, current_business)

    pdf_bytes = pdf_service.generate_purchase_order_pdf(
        business=business,
        order=order,
    )

    from datetime import date
    supplier_slug = (getattr(order, 'supplier_name', None) or "sin_proveedor").replace(" ", "_")[:20]
    filename = f"orden_pedido_{supplier_slug}_{date.today().strftime('%Y_%m_%d')}.pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
