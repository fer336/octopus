"""Router for Price Lists."""

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.price_list import (
    PriceListCreate,
    PriceListDetailResponse,
    PriceListResponse,
)
from app.services.price_list_service import PriceListService
from app.utils.security import get_current_business

router = APIRouter(
    prefix="/price-lists",
    tags=["Price Lists"],
)


@router.get("", response_model=list[PriceListResponse])
async def list_price_lists(
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """List all price lists for the current business."""
    service = PriceListService(db)
    price_lists = await service.list_all(business_id)
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
    return PriceListDetailResponse.model_validate(refreshed)


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
    return PriceListDetailResponse.model_validate(refreshed)


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
    return PriceListDetailResponse.model_validate(price_list)


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
