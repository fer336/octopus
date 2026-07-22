"""Credential lifecycle service for external agents."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.agent_credential import AgentCredential, AgentCredentialStatus, AgentSurface
from app.utils.agent_security import generate_agent_token


@dataclass(frozen=True)
class CreatedAgentCredential:
    """Credential plus one-time raw secret."""

    credential: AgentCredential
    secret: str


class AgentCredentialService:
    """Manages external-agent credentials with hash-only persistence."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _ensure_singleton(self, surface: str, business_id: UUID | None, credential_id: UUID | None = None) -> None:
        query = select(AgentCredential).where(
            AgentCredential.surface == surface,
            AgentCredential.status == AgentCredentialStatus.ACTIVE,
            AgentCredential.deleted_at.is_(None),
        )
        if surface == AgentSurface.TENANT:
            query = query.where(AgentCredential.business_id == business_id)
        else:
            query = query.where(AgentCredential.business_id.is_(None))
        if credential_id:
            query = query.where(AgentCredential.id != credential_id)
        existing = (await self.db.execute(query)).scalar_one_or_none()
        if existing:
            raise ValueError("Ya existe una credencial activa para esta superficie")

    async def create_credential(
        self,
        name: str,
        surface: str,
        scopes: list[str],
        business_id: UUID | None,
        expires_at: datetime | None = None,
        description: str | None = None,
    ) -> CreatedAgentCredential:
        """Create a credential and return its raw secret exactly once."""
        await self._ensure_singleton(surface, business_id)
        token = generate_agent_token()
        effective_expires_at = expires_at or (
            datetime.utcnow() + timedelta(days=get_settings().AGENT_TOKEN_TTL_DAYS)
        )
        credential = AgentCredential(
            name=name.strip(),
            surface=surface,
            business_id=business_id,
            scopes=list(dict.fromkeys(scopes)),
            key_id=token.key_id,
            secret_hash=token.secret_hash,
            secret_last4=token.last4,
            expires_at=effective_expires_at,
            description=description,
        )
        self.db.add(credential)
        await self.db.flush()
        return CreatedAgentCredential(credential=credential, secret=token.raw)

    async def list_credentials(self, page: int = 1, per_page: int = 50) -> tuple[list[AgentCredential], int]:
        """List credential metadata only."""
        base = select(AgentCredential).where(AgentCredential.deleted_at.is_(None))
        total = (await self.db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
        result = await self.db.execute(
            base.order_by(AgentCredential.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
        )
        return list(result.scalars().all()), int(total)

    async def get_by_id(self, credential_id: UUID) -> AgentCredential | None:
        """Return credential metadata by id."""
        result = await self.db.execute(
            select(AgentCredential).where(AgentCredential.id == credential_id, AgentCredential.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def rotate_credential(self, credential_id: UUID) -> CreatedAgentCredential:
        """Rotate a credential secret immediately."""
        credential = await self.get_by_id(credential_id)
        if credential is None:
            raise LookupError("Credencial no encontrada")
        if credential.status != AgentCredentialStatus.ACTIVE or not credential.is_active:
            raise ValueError("Solo se pueden rotar credenciales activas")
        await self._ensure_singleton(credential.surface, credential.business_id, credential.id)
        token = generate_agent_token()
        credential.key_id = token.key_id
        credential.secret_hash = token.secret_hash
        credential.secret_last4 = token.last4
        await self.db.flush()
        return CreatedAgentCredential(credential=credential, secret=token.raw)

    async def revoke_credential(self, credential_id: UUID) -> AgentCredential:
        """Revoke a credential immediately."""
        credential = await self.get_by_id(credential_id)
        if credential is None:
            raise LookupError("Credencial no encontrada")
        credential.status = AgentCredentialStatus.REVOKED
        credential.is_active = False
        credential.revoked_at = datetime.utcnow()
        await self.db.flush()
        return credential
