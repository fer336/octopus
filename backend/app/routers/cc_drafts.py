"""Router for CC Drafts (current-account closure drafts)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.cc_draft import CCDraftResponse, CCDraftSave
from app.services.cc_draft_service import CCDraftService
from app.utils.security import get_current_business

router = APIRouter(
    prefix="/cc-drafts",
    tags=["CC Drafts"],
)


@router.get("/{titular_id}", response_model=CCDraftResponse)
async def get_cc_draft(
    titular_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Get the CC draft for a given titular (client)."""
    service = CCDraftService(db)
    draft = await service.get_by_titular(titular_id, business_id)
    if not draft:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    return CCDraftResponse.model_validate(draft)


@router.put("/{titular_id}", response_model=CCDraftResponse)
async def upsert_cc_draft(
    titular_id: UUID,
    data: CCDraftSave,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Create or update the CC draft for a given titular."""
    # Ensure the path param and body are consistent
    data.titular_id = titular_id
    service = CCDraftService(db)
    draft = await service.upsert(data, business_id)
    await db.commit()
    await db.refresh(draft)
    return CCDraftResponse.model_validate(draft)


@router.delete("/{titular_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cc_draft(
    titular_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Delete the CC draft for a given titular."""
    service = CCDraftService(db)
    deleted = await service.delete(titular_id, business_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    await db.commit()
