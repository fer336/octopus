"""Router for Price Lists."""

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.price_list import (
    AddProductsToPriceListRequest,
    BulkAdjustPriceListRequest,
    DuplicatePriceListRequest,
    PriceListCreate,
    PriceListDetailResponse,
    PriceListItemResponse,
    PriceListItemUpdate,
    PriceListResponse,
    PriceListSendLogCreate,
    PriceListSendLogResponse,
    PriceListUpdate,
)
from app.services.price_list_service import PriceListService
from app.utils.security import get_current_business, require_module_access

router = APIRouter(
    prefix="/price-lists",
    tags=["Price Lists"],
    dependencies=[Depends(require_module_access("price_lists"))],
)


def _effective_item_description(item) -> str | None:
    product = None
    try:
        if "product" not in sa_inspect(item).unloaded:
            product = getattr(item, "product", None)
    except Exception:
        product = getattr(item, "product", None)
    product_description = getattr(product, "description", None)
    return product_description or getattr(item, "description", None)


def _item_response(item) -> PriceListItemResponse:
    response = PriceListItemResponse.model_validate(item)
    response.description = _effective_item_description(item)
    return response


def _detail_response(price_list) -> PriceListDetailResponse:
    response = PriceListDetailResponse.model_validate(price_list)
    response.items = [_item_response(item) for item in price_list.items]
    return response


@router.get("", response_model=list[PriceListResponse])
async def list_price_lists(
    list_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """List all price lists for the current business, optionally filtered by list_type."""
    service = PriceListService(db)
    price_lists = await service.list_all(business_id, list_type=list_type)
    result = []
    for pl in price_lists:
        count = await service.get_item_count(pl.id)
        resp = PriceListResponse.model_validate(pl)
        resp.item_count = count
        result.append(resp)
    return result


@router.post("", response_model=PriceListDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_price_list(
    data: PriceListCreate,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Create a new price list with items."""
    service = PriceListService(db)
    price_list = await service.create(data, business_id)
    await db.commit()
    # Re-fetch with items loaded
    refreshed = await service.get_by_id(price_list.id, business_id)
    return _detail_response(refreshed)


@router.post("/snapshot", response_model=PriceListDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_snapshot(
    name: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Create a price list snapshot from the current active product catalog."""
    service = PriceListService(db)
    price_list = await service.snapshot_from_products(name, business_id)
    await db.commit()
    refreshed = await service.get_by_id(price_list.id, business_id)
    return _detail_response(refreshed)


@router.get("/{price_list_id}", response_model=PriceListDetailResponse)
async def get_price_list(
    price_list_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Get a price list with all its items."""
    service = PriceListService(db)
    price_list = await service.get_by_id(price_list_id, business_id)
    if not price_list:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")
    return _detail_response(price_list)


@router.delete("/{price_list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_price_list(
    price_list_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Delete a price list."""
    service = PriceListService(db)
    deleted = await service.delete(price_list_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")
    await db.commit()


@router.put("/{price_list_id}", response_model=PriceListDetailResponse)
async def update_price_list(
    price_list_id: UUID,
    data: PriceListUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Update price list metadata."""
    service = PriceListService(db)
    pl = await service.update(price_list_id, business_id, data)
    if not pl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")
    await db.commit()
    refreshed = await service.get_by_id(price_list_id, business_id)
    return _detail_response(refreshed)


@router.post("/{price_list_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_price_list(
    price_list_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Archive a price list."""
    service = PriceListService(db)
    ok = await service.archive(price_list_id, business_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")
    await db.commit()


@router.post("/{price_list_id}/items/from-products", response_model=list[PriceListItemResponse])
async def add_products_to_price_list(
    price_list_id: UUID,
    data: AddProductsToPriceListRequest,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Add products to a price list by product IDs."""
    service = PriceListService(db)
    try:
        items = await service.add_products(
            price_list_id, business_id, data.product_ids, data.default_discount_percent
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await db.commit()
    return [_item_response(i) for i in items]


@router.put("/{price_list_id}/items/{item_id}", response_model=PriceListItemResponse)
async def update_price_list_item(
    price_list_id: UUID,
    item_id: UUID,
    data: PriceListItemUpdate,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Update a price list item."""
    service = PriceListService(db)
    item = await service.update_item(price_list_id, item_id, business_id, data)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()
    return _item_response(item)


@router.delete("/{price_list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_price_list_item(
    price_list_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Remove an item from a price list."""
    service = PriceListService(db)
    ok = await service.remove_item(price_list_id, item_id, business_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.commit()


@router.post("/{price_list_id}/bulk-adjust")
async def bulk_adjust_price_list(
    price_list_id: UUID,
    data: BulkAdjustPriceListRequest,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Apply a bulk percentage adjustment to price list items."""
    service = PriceListService(db)
    try:
        count = await service.bulk_adjust(
            price_list_id,
            business_id,
            data.percent,
            category_id=data.category_id,
            brand_id=data.brand_id,
            supplier_id=data.supplier_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await db.commit()
    return {"affected": count}


@router.post(
    "/{price_list_id}/duplicate",
    response_model=PriceListDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_price_list(
    price_list_id: UUID,
    data: DuplicatePriceListRequest,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Duplicate a price list with a new name and optional validity window."""
    service = PriceListService(db)
    try:
        new_pl = await service.duplicate(
            price_list_id, business_id, data.name, data.valid_from, data.valid_until
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    await db.commit()
    refreshed = await service.get_by_id(new_pl.id, business_id)
    return _detail_response(refreshed)


@router.get("/{price_list_id}/export.xlsx")
async def export_price_list_excel(
    price_list_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Export a price list as an Excel file."""
    from fastapi.responses import Response

    service = PriceListService(db)
    pl = await service.get_by_id(price_list_id, business_id)
    if not pl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")
    from app.services.excel_service import ExcelService

    excel_svc = ExcelService(db)
    content = await excel_svc.export_price_list(pl, pl.items)
    await service.create_send_log(
        price_list_id, business_id, PriceListSendLogCreate(channel="excel_export")
    )
    await db.commit()
    filename = f"lista-precios-{pl.name.replace(' ', '-')}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{price_list_id}/export.pdf")
async def export_price_list_pdf(
    price_list_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Export a price list as a PDF file."""
    from datetime import date as date_t

    from fastapi.responses import Response
    from sqlalchemy import select as sa_select

    from app.models.business import Business
    from app.services.pdf_service import pdf_service

    service = PriceListService(db)
    pl = await service.get_by_id(price_list_id, business_id)
    if not pl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Price list not found")
    biz_result = await db.execute(sa_select(Business).where(Business.id == business_id))
    business = biz_result.scalar_one_or_none()
    context = {
        "business": business,
        "price_list": pl,
        "items": pl.items,
        "issued_date": date_t.today(),
    }
    pdf_bytes = pdf_service.generate_price_list_pdf(context)
    await service.create_send_log(
        price_list_id, business_id, PriceListSendLogCreate(channel="pdf_export")
    )
    await db.commit()
    filename = f"lista-precios-{pl.name.replace(' ', '-')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{price_list_id}/send-logs",
    response_model=PriceListSendLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_send_log(
    price_list_id: UUID,
    data: PriceListSendLogCreate,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Record a send log entry for a price list."""
    service = PriceListService(db)
    try:
        log = await service.create_send_log(price_list_id, business_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    await db.commit()
    return PriceListSendLogResponse.model_validate(log)


@router.get("/{price_list_id}/send-logs", response_model=list[PriceListSendLogResponse])
async def list_send_logs(
    price_list_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """List all send logs for a price list."""
    service = PriceListService(db)
    logs = await service.list_send_logs(price_list_id, business_id)
    return [PriceListSendLogResponse.model_validate(log) for log in logs]
