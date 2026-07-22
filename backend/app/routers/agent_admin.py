"""Platform external-agent facade endpoints for Unit 1 surface separation."""

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.actor_context import ActorContext
from app.utils.agent_security import get_platform_agent_context, log_agent_audit

router = APIRouter(prefix="/api/agent/admin", tags=["agent-admin"])


@router.get("/health")
async def agent_admin_health(
    response: Response,
    ctx: ActorContext = Depends(get_platform_agent_context),
    db: AsyncSession = Depends(get_db),
):
    """Platform agent health endpoint; broader admin routes are deferred."""
    response.headers["X-Correlation-ID"] = ctx.correlation_id or ""
    await log_agent_audit(ctx, "read", "agent_admin_health", "allowed", db=db)
    return {"status": "healthy", "surface": "admin", "actor": {"type": "agent", "agent_id": str(ctx.agent_id)}}
