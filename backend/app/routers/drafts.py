"""
Router para manejar Borradores (Drafts) de ventas.

Los borradores se guardan en la base de datos para persistencia
y son compartidos entre todos los usuarios del negocio.
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.draft import Draft
from app.schemas.draft import (
    DraftCreate,
    DraftResponse,
    DraftUpdate,
)
from app.models.user import User
from app.utils.security import get_current_business, get_current_user


router = APIRouter(prefix="/drafts", tags=["drafts"])


class DraftListItem(BaseModel):
    """Schema simplificado para listar borradores."""
    
    id: str
    client_name: Optional[str]
    voucher_type: str
    item_count: int
    general_discount: float
    show_prices: bool
    created_at: datetime
    updated_at: datetime


@router.get("", response_model=list[DraftListItem])
async def list_drafts(
    business_id: uuid.UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista todos los borradores del negocio.
    
    Los borradores son compartidos entre todos los usuarios del negocio.
    """
    stmt = (
        select(Draft)
        .where(Draft.business_id == business_id)
        .order_by(Draft.updated_at.desc())
    )
    result = await db.execute(stmt)
    drafts = result.scalars().all()
    
    return [
        DraftListItem(
            id=str(d.id),
            client_name=d.client_name,
            voucher_type=d.voucher_type,
            item_count=d.item_count,
            general_discount=float(d.general_discount),
            show_prices=d.show_prices,
            created_at=d.created_at,
            updated_at=d.updated_at,
        )
        for d in drafts
    ]


@router.post("", response_model=DraftResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    draft_data: DraftCreate,
    business_id: uuid.UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Crea un nuevo borrador.
    
    El borrador se guarda en la base de datos y es accesible
    por cualquier usuario del negocio.
    """
    # Calcular cantidad de items
    item_count = len(draft_data.items)
    
    # Convertir items a JSON
    items_json = [item.model_dump() for item in draft_data.items]
    
    draft = Draft(
        business_id=business_id,
        user_id=current_user.id,
        client_id=uuid.UUID(draft_data.client_id) if draft_data.client_id else None,
        client_name=draft_data.client_name,
        voucher_type=draft_data.voucher_type,
        operating_client_id=uuid.UUID(draft_data.operating_client_id) if draft_data.operating_client_id else None,
        items=items_json,
        general_discount=draft_data.general_discount,
        show_prices=draft_data.show_prices,
        item_count=item_count,
    )
    
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    
    return DraftResponse(
        id=str(draft.id),
        business_id=str(draft.business_id),
        user_id=str(draft.user_id) if draft.user_id else None,
        client_id=str(draft.client_id) if draft.client_id else None,
        client_name=draft.client_name,
        voucher_type=draft.voucher_type,
        operating_client_id=str(draft.operating_client_id) if draft.operating_client_id else None,
        items=draft.items,
        general_discount=float(draft.general_discount),
        show_prices=draft.show_prices,
        item_count=draft.item_count,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


@router.get("/{draft_id}", response_model=DraftResponse)
async def get_draft(
    draft_id: uuid.UUID,
    business_id: uuid.UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Obtiene un borrador específico por su ID.
    """
    stmt = select(Draft).where(
        Draft.id == draft_id,
        Draft.business_id == business_id
    )
    result = await db.execute(stmt)
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Borrador no encontrado"
        )
    
    return DraftResponse(
        id=str(draft.id),
        business_id=str(draft.business_id),
        user_id=str(draft.user_id) if draft.user_id else None,
        client_id=str(draft.client_id) if draft.client_id else None,
        client_name=draft.client_name,
        voucher_type=draft.voucher_type,
        operating_client_id=str(draft.operating_client_id) if draft.operating_client_id else None,
        items=draft.items,
        general_discount=float(draft.general_discount),
        show_prices=draft.show_prices,
        item_count=draft.item_count,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


@router.put("/{draft_id}", response_model=DraftResponse)
async def update_draft(
    draft_id: uuid.UUID,
    draft_data: DraftUpdate,
    business_id: uuid.UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Actualiza un borrador existente.
    """
    stmt = select(Draft).where(
        Draft.id == draft_id,
        Draft.business_id == business_id
    )
    result = await db.execute(stmt)
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Borrador no encontrado"
        )
    
    # Actualizar campos si vienen presentes
    update_data = draft_data.model_dump(exclude_unset=True)
    
    if 'client_id' in update_data and update_data['client_id']:
        draft.client_id = uuid.UUID(update_data['client_id'])
    elif 'client_id' in update_data:
        draft.client_id = None
        
    if 'operating_client_id' in update_data and update_data['operating_client_id']:
        draft.operating_client_id = uuid.UUID(update_data['operating_client_id'])
    elif 'operating_client_id' in update_data:
        draft.operating_client_id = None
        
    if 'items' in update_data and update_data['items']:
        draft.items = [item.model_dump() for item in update_data['items']]
        draft.item_count = len(draft.items)
    
    if 'client_name' in update_data:
        draft.client_name = update_data['client_name']
    if 'voucher_type' in update_data:
        draft.voucher_type = update_data['voucher_type']
    if 'general_discount' in update_data:
        draft.general_discount = update_data['general_discount']
    if 'show_prices' in update_data:
        draft.show_prices = update_data['show_prices']
    
    draft.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(draft)
    
    return DraftResponse(
        id=str(draft.id),
        business_id=str(draft.business_id),
        user_id=str(draft.user_id) if draft.user_id else None,
        client_id=str(draft.client_id) if draft.client_id else None,
        client_name=draft.client_name,
        voucher_type=draft.voucher_type,
        operating_client_id=str(draft.operating_client_id) if draft.operating_client_id else None,
        items=draft.items,
        general_discount=float(draft.general_discount),
        show_prices=draft.show_prices,
        item_count=draft.item_count,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


@router.delete("/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_draft(
    draft_id: uuid.UUID,
    business_id: uuid.UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Elimina un borrador.
    """
    stmt = select(Draft).where(
        Draft.id == draft_id,
        Draft.business_id == business_id
    )
    result = await db.execute(stmt)
    draft = result.scalar_one_or_none()
    
    if not draft:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Borrador no encontrado"
        )
    
    await db.delete(draft)
    await db.commit()
    
    return None
