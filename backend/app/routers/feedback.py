"""Router de feedback de usuarios (bugs y solicitudes)."""

from datetime import datetime
import logging
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
import httpx
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business import Business
from app.models.feedback_ticket import FeedbackTicket
from app.models.tenant_secret import TenantSecret
from app.models.user import User
from app.schemas.base import PaginatedResponse
from app.utils.crypto import decrypt_api_key
from app.utils.security import get_current_business, get_current_user

tenant_router = APIRouter(prefix="/feedback", tags=["Feedback"])
admin_router = APIRouter(prefix="/api/admin/feedback", tags=["Admin Feedback"])

logger = logging.getLogger(__name__)
LINEAR_SECRET_TYPE = "linear_api_key"


FeedbackType = Literal["bug", "feature"]
FeedbackStatus = Literal["new", "reviewing", "planned", "done", "rejected"]


class FeedbackCreateRequest(BaseModel):
    feedback_type: FeedbackType
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=10, max_length=5000)


class FeedbackStatusUpdateRequest(BaseModel):
    status: FeedbackStatus
    admin_note: Optional[str] = Field(default=None, max_length=5000)


class FeedbackResponse(BaseModel):
    id: str
    business_id: str
    user_id: Optional[str]
    user_email: Optional[str]
    feedback_type: FeedbackType
    title: str
    description: str
    status: FeedbackStatus
    source: str
    admin_note: Optional[str]
    resolved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


def _serialize_feedback(ticket: FeedbackTicket) -> FeedbackResponse:
    return FeedbackResponse(
        id=str(ticket.id),
        business_id=str(ticket.business_id),
        user_id=str(ticket.user_id) if ticket.user_id else None,
        user_email=ticket.user.email if ticket.user else None,
        feedback_type=ticket.feedback_type,  # type: ignore[arg-type]
        title=ticket.title,
        description=ticket.description,
        status=ticket.status,  # type: ignore[arg-type]
        source=ticket.source,
        admin_note=ticket.admin_note,
        resolved_at=ticket.resolved_at,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


def _ensure_superadmin(user: User) -> None:
    if user.platform_role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requiere rol superadmin",
        )


async def _try_sync_feedback_to_linear(
    db: AsyncSession,
    ticket: FeedbackTicket,
    current_user: User,
) -> None:
    """
    Sincroniza feedback a Linear de forma opcional.
    No bloquea la creación del ticket si falla.
    """
    business_result = await db.execute(
        select(Business).where(Business.id == ticket.business_id)
    )
    business = business_result.scalar_one_or_none()

    if not business or not business.linear_sync_enabled:
        return

    secret_result = await db.execute(
        select(TenantSecret).where(
            TenantSecret.business_id == ticket.business_id,
            TenantSecret.secret_type == LINEAR_SECRET_TYPE,
            TenantSecret.is_configured.is_(True),
            TenantSecret.encrypted_value.is_not(None),
        )
    )
    secret = secret_result.scalar_one_or_none()
    if not secret or not secret.encrypted_value:
        return

    try:
        api_key = decrypt_api_key(secret.encrypted_value)
    except Exception as exc:
        logger.warning(
            "No se pudo descifrar linear_api_key para tenant %s: %s",
            ticket.business_id,
            exc,
        )
        return

    prefix = "[BUG]" if ticket.feedback_type == "bug" else "[FEATURE]"
    linear_title = f"{prefix} {ticket.title}"
    linear_description = (
        f"Tipo: {ticket.feedback_type}\n"
        f"Tenant: {ticket.business_id}\n"
        f"Usuario: {current_user.email}\n\n"
        f"{ticket.description}"
    )

    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            team_query = {"query": "query { teams(first: 1) { nodes { id } } }"}
            team_response = await client.post(
                "https://api.linear.app/graphql",
                json=team_query,
                headers=headers,
            )
            team_response.raise_for_status()
            team_payload = team_response.json()

            if team_payload.get("errors"):
                logger.warning(
                    "Linear devolvió errores al consultar teams para tenant %s: %s",
                    ticket.business_id,
                    team_payload["errors"],
                )
                return

            teams = team_payload.get("data", {}).get("teams", {}).get("nodes", [])
            if not teams:
                logger.warning(
                    "Linear sin teams disponibles para tenant %s", ticket.business_id
                )
                return

            team_id = teams[0]["id"]
            issue_mutation = {
                "query": (
                    "mutation IssueCreate($input: IssueCreateInput!) { "
                    "issueCreate(input: $input) { success issue { id identifier } } }"
                ),
                "variables": {
                    "input": {
                        "teamId": team_id,
                        "title": linear_title,
                        "description": linear_description,
                    }
                },
            }
            issue_response = await client.post(
                "https://api.linear.app/graphql",
                json=issue_mutation,
                headers=headers,
            )
            issue_response.raise_for_status()
            issue_payload = issue_response.json()

            if issue_payload.get("errors"):
                logger.warning(
                    "Linear devolvió errores al crear issue para ticket %s: %s",
                    ticket.id,
                    issue_payload["errors"],
                )
                return

            issue_create = issue_payload.get("data", {}).get("issueCreate", {})
            if not issue_create.get("success"):
                logger.warning(
                    "Linear no confirmó creación para ticket %s (tenant %s)",
                    ticket.id,
                    ticket.business_id,
                )
                return

            identifier = issue_create.get("issue", {}).get("identifier")
            logger.info(
                "Feedback %s sincronizado a Linear como %s",
                ticket.id,
                identifier,
            )
    except Exception as exc:
        logger.warning(
            "Fallo sincronización opcional de feedback %s a Linear: %s",
            ticket.id,
            exc,
        )


@tenant_router.post(
    "", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED
)
async def create_feedback(
    data: FeedbackCreateRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    ticket = FeedbackTicket(
        business_id=business_id,
        user_id=current_user.id,
        feedback_type=data.feedback_type,
        title=data.title.strip(),
        description=data.description.strip(),
        status="new",
        source="tenant_app",
    )

    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)

    await _try_sync_feedback_to_linear(db, ticket, current_user)

    return _serialize_feedback(ticket)


@tenant_router.get("", response_model=PaginatedResponse[FeedbackResponse])
async def list_feedback_for_tenant(
    feedback_type: Optional[FeedbackType] = Query(default=None),
    status_filter: Optional[FeedbackStatus] = Query(default=None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    base_query = select(FeedbackTicket).where(
        FeedbackTicket.business_id == business_id,
        FeedbackTicket.deleted_at.is_(None),
    )

    if feedback_type:
        base_query = base_query.where(FeedbackTicket.feedback_type == feedback_type)
    if status_filter:
        base_query = base_query.where(FeedbackTicket.status == status_filter)

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    offset = (page - 1) * per_page
    result = await db.execute(
        base_query.order_by(FeedbackTicket.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    items = result.scalars().all()
    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[_serialize_feedback(item) for item in items],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@admin_router.get("", response_model=PaginatedResponse[FeedbackResponse])
async def list_feedback_for_admin(
    business_id: Optional[UUID] = Query(default=None),
    feedback_type: Optional[FeedbackType] = Query(default=None),
    status_filter: Optional[FeedbackStatus] = Query(default=None, alias="status"),
    q: Optional[str] = Query(default=None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_superadmin(current_user)

    base_query = select(FeedbackTicket).where(FeedbackTicket.deleted_at.is_(None))

    if business_id:
        base_query = base_query.where(FeedbackTicket.business_id == business_id)
    if feedback_type:
        base_query = base_query.where(FeedbackTicket.feedback_type == feedback_type)
    if status_filter:
        base_query = base_query.where(FeedbackTicket.status == status_filter)
    if q:
        like = f"%{q.strip()}%"
        base_query = base_query.where(
            or_(
                FeedbackTicket.title.ilike(like), FeedbackTicket.description.ilike(like)
            )
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    offset = (page - 1) * per_page
    result = await db.execute(
        base_query.order_by(FeedbackTicket.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    items = result.scalars().all()
    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[_serialize_feedback(item) for item in items],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@admin_router.patch("/{ticket_id}", response_model=FeedbackResponse)
async def update_feedback_status(
    ticket_id: UUID,
    data: FeedbackStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_superadmin(current_user)

    result = await db.execute(
        select(FeedbackTicket).where(
            FeedbackTicket.id == ticket_id,
            FeedbackTicket.deleted_at.is_(None),
        )
    )
    ticket = result.scalar_one_or_none()

    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback no encontrado",
        )

    ticket.status = data.status
    ticket.admin_note = data.admin_note
    ticket.resolved_at = (
        datetime.utcnow() if data.status in {"done", "rejected"} else None
    )

    await db.commit()
    await db.refresh(ticket)
    return _serialize_feedback(ticket)
