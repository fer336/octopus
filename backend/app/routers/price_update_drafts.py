"""
Router para borradores de actualización masiva de precios.
"""
import json
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.price_update_draft import PriceUpdateDraft
from app.utils.security import get_current_business, get_current_user

router = APIRouter(prefix="/price-update-drafts", tags=["Price Update Drafts"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class DraftFilters(BaseModel):
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    search: Optional[str] = None


class SaveDraftRequest(BaseModel):
    name: str
    filters: Optional[DraftFilters] = None
    products: list  # array de EditableProduct serializado


class DraftResponse(BaseModel):
    id: str
    name: str
    product_count: int
    filter_category_name: Optional[str] = None
    filter_supplier_name: Optional[str] = None
    filter_search: Optional[str] = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class DraftDetailResponse(DraftResponse):
    products: list  # array deserializado


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=List[DraftResponse])
async def list_drafts(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista todos los borradores del negocio, ordenados por más reciente."""
    result = await db.execute(
        select(PriceUpdateDraft)
        .where(
            PriceUpdateDraft.business_id == business_id,
            PriceUpdateDraft.deleted_at.is_(None),
        )
        .order_by(desc(PriceUpdateDraft.updated_at))
    )
    drafts = result.scalars().all()

    return [
        DraftResponse(
            id=str(d.id),
            name=d.name,
            product_count=int(d.product_count or 0),
            filter_category_name=d.filter_category_name,
            filter_supplier_name=d.filter_supplier_name,
            filter_search=d.filter_search,
            created_at=d.created_at.isoformat(),
            updated_at=d.updated_at.isoformat(),
        )
        for d in drafts
    ]


@router.post("", response_model=DraftResponse, status_code=status.HTTP_201_CREATED)
async def save_draft(
    data: SaveDraftRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Guarda un nuevo borrador de actualización de precios.
    Almacena el estado completo de los productos editados para retomar después.
    """
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="El nombre del borrador no puede estar vacío")

    if not data.products:
        raise HTTPException(status_code=400, detail="El borrador debe contener al menos un producto")

    draft = PriceUpdateDraft(
        business_id=business_id,
        created_by=current_user.id,
        name=data.name.strip(),
        filter_category_id=UUID(data.filters.category_id) if data.filters and data.filters.category_id else None,
        filter_category_name=data.filters.category_name if data.filters else None,
        filter_supplier_id=UUID(data.filters.supplier_id) if data.filters and data.filters.supplier_id else None,
        filter_supplier_name=data.filters.supplier_name if data.filters else None,
        filter_search=data.filters.search if data.filters else None,
        products_data=json.dumps(data.products),
        product_count=str(len(data.products)),
    )

    db.add(draft)
    await db.commit()
    await db.refresh(draft)

    return DraftResponse(
        id=str(draft.id),
        name=draft.name,
        product_count=int(draft.product_count),
        filter_category_name=draft.filter_category_name,
        filter_supplier_name=draft.filter_supplier_name,
        filter_search=draft.filter_search,
        created_at=draft.created_at.isoformat(),
        updated_at=draft.updated_at.isoformat(),
    )


@router.get("/{draft_id}", response_model=DraftDetailResponse)
async def get_draft(
    draft_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene un borrador con todos sus productos para retomar la edición."""
    result = await db.execute(
        select(PriceUpdateDraft).where(
            PriceUpdateDraft.id == draft_id,
            PriceUpdateDraft.business_id == business_id,
            PriceUpdateDraft.deleted_at.is_(None),
        )
    )
    draft = result.scalar_one_or_none()

    if not draft:
        raise HTTPException(status_code=404, detail="Borrador no encontrado")

    return DraftDetailResponse(
        id=str(draft.id),
        name=draft.name,
        product_count=int(draft.product_count or 0),
        filter_category_name=draft.filter_category_name,
        filter_supplier_name=draft.filter_supplier_name,
        filter_search=draft.filter_search,
        created_at=draft.created_at.isoformat(),
        updated_at=draft.updated_at.isoformat(),
        products=json.loads(draft.products_data),
    )


@router.put("/{draft_id}", response_model=DraftResponse)
async def update_draft(
    draft_id: UUID,
    data: SaveDraftRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza un borrador existente (sobreescribe los productos)."""
    result = await db.execute(
        select(PriceUpdateDraft).where(
            PriceUpdateDraft.id == draft_id,
            PriceUpdateDraft.business_id == business_id,
            PriceUpdateDraft.deleted_at.is_(None),
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Borrador no encontrado")

    draft.name = data.name.strip() or draft.name
    if data.filters:
        draft.filter_category_id = UUID(data.filters.category_id) if data.filters.category_id else None
        draft.filter_category_name = data.filters.category_name
        draft.filter_supplier_id = UUID(data.filters.supplier_id) if data.filters.supplier_id else None
        draft.filter_supplier_name = data.filters.supplier_name
        draft.filter_search = data.filters.search
    draft.products_data = json.dumps(data.products)
    draft.product_count = str(len(data.products))

    await db.commit()
    await db.refresh(draft)

    return DraftResponse(
        id=str(draft.id),
        name=draft.name,
        product_count=int(draft.product_count),
        filter_category_name=draft.filter_category_name,
        filter_supplier_name=draft.filter_supplier_name,
        filter_search=draft.filter_search,
        created_at=draft.created_at.isoformat(),
        updated_at=draft.updated_at.isoformat(),
    )


@router.delete("/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft(
    draft_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Elimina un borrador (soft delete)."""
    result = await db.execute(
        select(PriceUpdateDraft).where(
            PriceUpdateDraft.id == draft_id,
            PriceUpdateDraft.business_id == business_id,
            PriceUpdateDraft.deleted_at.is_(None),
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Borrador no encontrado")

    draft.soft_delete()
    await db.commit()
