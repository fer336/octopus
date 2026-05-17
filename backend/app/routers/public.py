"""Public endpoints — no authentication required."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.product import Product

router = APIRouter(tags=["public"])


class PublicProductResponse(BaseModel):
    id: UUID
    code: str
    description: str
    sale_price: float
    unit: str | None
    photo_url: str | None
    supplier_code: str | None

    class Config:
        from_attributes = True


@router.get("/products/{product_id}", response_model=PublicProductResponse)
async def get_public_product(product_id: UUID, db: AsyncSession = Depends(get_db)):
    """Public product info — used by QR landing page. No auth required."""
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return product
