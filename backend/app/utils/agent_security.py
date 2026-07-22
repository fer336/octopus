"""Opaque-token security helpers for external agents."""

import hashlib
import hmac
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.agent_credential import AgentCredential, AgentCredentialStatus, AgentSurface
from app.models.audit_log import AuditLog
from app.utils.actor_context import ActorContext

agent_bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)
MAX_CORRELATION_ID_LENGTH = 80
_SAFE_CORRELATION_CHARS = re.compile(r"[^A-Za-z0-9_.-]")


@dataclass(frozen=True)
class GeneratedAgentToken:
    """Generated token parts for one-time display and hash storage."""

    raw: str
    key_id: str
    secret_hash: str
    last4: str


def _agent_token_pepper() -> str:
    settings = get_settings()
    pepper = getattr(settings, "AGENT_TOKEN_PEPPER", "") or ""
    if pepper:
        return pepper
    raise RuntimeError("AGENT_TOKEN_PEPPER must be configured for agent authentication")


def validate_agent_security_settings() -> None:
    """Fail fast when external-agent token hashing is not configured."""
    _agent_token_pepper()


def generate_agent_token() -> GeneratedAgentToken:
    """Generate an opaque agent token and its HMAC hash."""
    key_id = secrets.token_hex(8)
    secret = secrets.token_hex(32)
    raw = f"otag_v1_{key_id}_{secret}"
    return GeneratedAgentToken(
        raw=raw,
        key_id=key_id,
        secret_hash=hash_agent_token(raw),
        last4=raw[-4:],
    )


def parse_agent_token(raw_token: str) -> tuple[str, str]:
    """Parse an agent token into key id and secret fragment."""
    parts = raw_token.split("_", 3)
    if len(parts) != 4 or parts[0] != "otag" or parts[1] != "v1" or not parts[2] or not parts[3]:
        raise ValueError("invalid agent token format")
    return parts[2], parts[3]


def hash_agent_token(raw_token: str) -> str:
    """Hash an agent token with HMAC-SHA256 and the configured pepper."""
    return hmac.new(_agent_token_pepper().encode(), raw_token.encode(), hashlib.sha256).hexdigest()


def verify_agent_token(raw_token: str, expected_hash: str) -> bool:
    """Constant-time agent token verification."""
    try:
        return hmac.compare_digest(hash_agent_token(raw_token), expected_hash)
    except RuntimeError:
        raise
    except Exception:
        return False


def correlation_id_from_request(request: Request) -> str:
    """Get or create a request correlation id."""
    return sanitize_correlation_id(request.headers.get("X-Correlation-ID"))


def sanitize_correlation_id(raw_value: str | None) -> str:
    """Return a bounded correlation id safe for headers, JSON, and logs."""
    value = (raw_value or "").strip() or str(uuid4())
    value = _SAFE_CORRELATION_CHARS.sub("-", value)
    value = value[:MAX_CORRELATION_ID_LENGTH]
    return value or str(uuid4())


def agent_error(status_code: int, code: str, message: str, correlation_id: str | None) -> HTTPException:
    """Build the standard agent error response."""
    safe_correlation_id = sanitize_correlation_id(correlation_id)
    return HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message, "correlation_id": safe_correlation_id}},
        headers={"X-Correlation-ID": safe_correlation_id},
    )


async def log_agent_audit(
    ctx: ActorContext,
    action: str,
    resource_type: str,
    outcome: str,
    scopes_evaluated: list[str] | None = None,
    resource_id=None,
    details: dict | None = None,
    db: AsyncSession | None = None,
) -> AuditLog | None:
    """Best-effort agent audit logging isolated from request outcomes."""
    if db is None:
        return None
    try:
        log = AuditLog(
            user_id=None,
            agent_id=ctx.agent_id,
            actor_type="agent",
            business_id=ctx.business_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            correlation_id=ctx.correlation_id,
            outcome=outcome,
            scopes_evaluated=scopes_evaluated or [],
            details={"surface": ctx.surface, "agent_scopes": ctx.scopes, **(details or {})},
        )
        db.add(log)
        await db.commit()
        return log
    except Exception as exc:
        await db.rollback()
        logger.warning(
            "Agent audit logging failed action=%s resource_type=%s correlation_id=%s: %s",
            action,
            resource_type,
            ctx.correlation_id,
            exc,
        )
        return None


async def _resolve_agent_context(
    surface: str,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
    db: AsyncSession,
) -> ActorContext:
    correlation_id = correlation_id_from_request(request)
    if not credentials:
        raise agent_error(status.HTTP_401_UNAUTHORIZED, "agent_credentials_missing", "Credenciales no proporcionadas.", correlation_id)
    raw_token = credentials.credentials
    try:
        key_id, _ = parse_agent_token(raw_token)
    except ValueError:
        raise agent_error(status.HTTP_401_UNAUTHORIZED, "agent_token_invalid", "Token inválido.", correlation_id)

    result = await db.execute(select(AgentCredential).where(AgentCredential.key_id == key_id, AgentCredential.deleted_at.is_(None)))
    credential = result.scalar_one_or_none()
    if not credential or not verify_agent_token(raw_token, credential.secret_hash):
        raise agent_error(status.HTTP_401_UNAUTHORIZED, "agent_token_invalid", "Token inválido.", correlation_id)

    ctx = ActorContext(
        actor_type="agent",
        agent_id=credential.id,
        business_id=credential.business_id,
        scopes=list(credential.scopes or []),
        surface=credential.surface,
        correlation_id=correlation_id,
    )
    if credential.status != AgentCredentialStatus.ACTIVE or not credential.is_active:
        await log_agent_audit(ctx, "authenticate", "agent_credential", "denied", db=db)
        raise agent_error(status.HTTP_401_UNAUTHORIZED, "agent_token_revoked", "Credencial revocada.", correlation_id)
    if credential.expires_at and datetime.utcnow() >= credential.expires_at:
        await log_agent_audit(ctx, "authenticate", "agent_credential", "denied", db=db)
        raise agent_error(status.HTTP_401_UNAUTHORIZED, "agent_token_expired", "Credencial expirada.", correlation_id)
    if credential.surface != surface:
        await log_agent_audit(ctx, "authorize", "agent_surface", "denied", db=db)
        raise agent_error(status.HTTP_403_FORBIDDEN, "agent_wrong_surface", "La credencial no pertenece a esta superficie.", correlation_id)

    credential.last_used_at = datetime.utcnow()
    await db.commit()
    return ctx


async def get_tenant_agent_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(agent_bearer),
    db: AsyncSession = Depends(get_db),
) -> ActorContext:
    """Authenticate a tenant-bound external agent."""
    ctx = await _resolve_agent_context(AgentSurface.TENANT, request, credentials, db)
    if ctx.business_id is None:
        raise agent_error(status.HTTP_403_FORBIDDEN, "agent_wrong_surface", "La credencial tenant debe tener comercio asociado.", ctx.correlation_id)
    return ctx


async def get_platform_agent_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(agent_bearer),
    db: AsyncSession = Depends(get_db),
) -> ActorContext:
    """Authenticate a platform external agent."""
    return await _resolve_agent_context(AgentSurface.PLATFORM, request, credentials, db)
