"""Scope enforcement helpers for external-agent routes."""

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.actor_context import ActorContext
from app.utils.agent_security import (
    agent_error,
    get_platform_agent_context,
    get_tenant_agent_context,
    log_agent_audit,
)


TENANT_PRODUCTS_READ = "products:read"


def require_tenant_agent_scope(scope: str):
    """Return a tenant-agent dependency that requires a specific scope."""

    async def _dependency(
        ctx: ActorContext = Depends(get_tenant_agent_context),
        db: AsyncSession = Depends(get_db),
    ) -> ActorContext:
        if scope not in ctx.scopes:
            try:
                await log_agent_audit(
                    ctx=ctx,
                    action="authorize",
                    resource_type="agent_scope",
                    outcome="denied",
                    scopes_evaluated=[scope],
                    db=db,
                )
            except Exception:
                pass
            raise agent_error(403, "agent_missing_scope", "La credencial no tiene el scope requerido.", ctx.correlation_id)
        return ctx

    return _dependency


def require_platform_agent_scope(scope: str):
    """Return a platform-agent dependency that requires a specific admin scope."""

    async def _dependency(
        ctx: ActorContext = Depends(get_platform_agent_context),
        db: AsyncSession = Depends(get_db),
    ) -> ActorContext:
        if scope not in ctx.scopes:
            try:
                await log_agent_audit(
                    ctx=ctx,
                    action="authorize",
                    resource_type="agent_scope",
                    outcome="denied",
                    scopes_evaluated=[scope],
                    db=db,
                )
            except Exception:
                pass
            raise agent_error(403, "agent_missing_scope", "La credencial no tiene el scope requerido.", ctx.correlation_id)
        return ctx

    return _dependency


require_agent_scope = require_tenant_agent_scope
