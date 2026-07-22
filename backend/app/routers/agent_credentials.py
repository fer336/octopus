"""CMS-authenticated routes for external-agent credential lifecycle."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.tenant_resolver import AdminContext, require_superadmin
from app.models.audit_log import AuditLog
from app.schemas.agent import AgentCredentialCreate, AgentCredentialCreateResponse, AgentCredentialListResponse, AgentCredentialResponse
from app.services.agent_credential_service import AgentCredentialService

router = APIRouter(prefix="/api/admin/agent-credentials", tags=["agent-credentials"])


def _credential_response(credential) -> AgentCredentialResponse:
    return AgentCredentialResponse.model_validate(credential)


def _audit_credential_operation(db: AsyncSession, admin: AdminContext, credential, action: str) -> None:
    """Queue a user-auth audit row without secret material."""
    db.add(
        AuditLog(
            user_id=admin.user_id,
            business_id=credential.business_id,
            action=action,
            resource_type="agent_credential",
            resource_id=credential.id,
            actor_type="user",
            outcome="allowed",
            details={
                "surface": credential.surface,
                "scopes": list(credential.scopes or []),
                "status": credential.status,
            },
        )
    )


@router.post("", response_model=AgentCredentialCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_credential(
    data: AgentCredentialCreate,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Create an external-agent credential and show its secret once."""
    service = AgentCredentialService(db)
    try:
        created = await service.create_credential(
            name=data.name,
            surface=data.surface,
            scopes=data.scopes,
            business_id=data.business_id,
            expires_at=data.expires_at,
            description=data.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    _audit_credential_operation(db, admin, created.credential, "create")
    await db.commit()
    await db.refresh(created.credential)
    return AgentCredentialCreateResponse(credential=_credential_response(created.credential), secret=created.secret)


@router.get("", response_model=AgentCredentialListResponse)
async def list_agent_credentials(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """List credential metadata without raw secrets."""
    credentials, total = await AgentCredentialService(db).list_credentials(page, per_page)
    return AgentCredentialListResponse(
        items=[_credential_response(credential) for credential in credentials],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/{credential_id}/rotate", response_model=AgentCredentialCreateResponse)
async def rotate_agent_credential(
    credential_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Rotate a credential and show the new secret once."""
    try:
        rotated = await AgentCredentialService(db).rotate_credential(credential_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    _audit_credential_operation(db, admin, rotated.credential, "rotate")
    await db.commit()
    await db.refresh(rotated.credential)
    return AgentCredentialCreateResponse(credential=_credential_response(rotated.credential), secret=rotated.secret)


@router.post("/{credential_id}/revoke", response_model=AgentCredentialResponse)
async def revoke_agent_credential(
    credential_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a credential immediately."""
    try:
        credential = await AgentCredentialService(db).revoke_credential(credential_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    _audit_credential_operation(db, admin, credential, "revoke")
    await db.commit()
    await db.refresh(credential)
    return _credential_response(credential)
