"""Tenant external-agent facade endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.base import PaginatedResponse
from app.schemas.product import ProductListParams, ProductResponse
from app.services.product_service import ProductService
from app.utils.actor_context import ActorContext
from app.utils.agent_acl import TENANT_PRODUCTS_READ, require_tenant_agent_scope
from app.utils.agent_security import agent_error, get_tenant_agent_context, log_agent_audit

router = APIRouter(prefix="/api/agent/tenant", tags=["agent-tenant"])


def _set_correlation(response: Response, ctx: ActorContext) -> None:
    response.headers["X-Correlation-ID"] = ctx.correlation_id or ""


async def _audit_agent_call(*args, **kwargs) -> None:
    """Best-effort audit wrapper so route outcomes are not audit-dependent."""
    try:
        await log_agent_audit(*args, **kwargs)
    except Exception:
        # log_agent_audit is already best-effort; this extra guard protects route
        # behavior if tests or future refactors replace the imported function.
        return None


@router.get("/health")
async def agent_tenant_health(
    response: Response,
    ctx: ActorContext = Depends(get_tenant_agent_context),
    db: AsyncSession = Depends(get_db),
):
    """Tenant agent health endpoint."""
    _set_correlation(response, ctx)
    await _audit_agent_call(ctx, "read", "agent_health", "allowed", db=db)
    return {
        "status": "healthy",
        "surface": "tenant",
        "business_id": str(ctx.business_id),
        "actor": {"type": "agent", "agent_id": str(ctx.agent_id)},
    }


@router.get("/products", response_model=PaginatedResponse[ProductResponse])
async def agent_list_products(
    response: Response,
    search: str | None = Query(None),
    category_id: UUID | None = Query(None),
    supplier_id: UUID | None = Query(None),
    is_active: bool | None = Query(True),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    ctx: ActorContext = Depends(require_tenant_agent_scope(TENANT_PRODUCTS_READ)),
):
    """List products for the credential-bound business only."""
    _set_correlation(response, ctx)
    params = ProductListParams(
        search=search,
        category_id=category_id,
        supplier_id=supplier_id,
        is_active=is_active,
        page=page,
        per_page=per_page,
    )
    products, total = await ProductService(db).list(ctx.business_id, params)
    await _audit_agent_call(ctx, "read", "products", "allowed", scopes_evaluated=[TENANT_PRODUCTS_READ], db=db)
    return PaginatedResponse(
        items=[ProductResponse.model_validate(product) for product in products],
        total=total,
        page=page,
        per_page=per_page,
        pages=(total + per_page - 1) // per_page if per_page else 0,
    )


@router.get("/products/{product_id}", response_model=ProductResponse)
async def agent_get_product(
    product_id: UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    ctx: ActorContext = Depends(require_tenant_agent_scope(TENANT_PRODUCTS_READ)),
):
    """Get one product using cross-tenant not-found behavior."""
    _set_correlation(response, ctx)
    product = await ProductService(db).get_by_id(product_id, ctx.business_id)
    if not product:
        await _audit_agent_call(ctx, "read", "product", "denied", scopes_evaluated=[TENANT_PRODUCTS_READ], resource_id=product_id, db=db)
        raise agent_error(status.HTTP_404_NOT_FOUND, "agent_resource_not_found", "Recurso no encontrado.", ctx.correlation_id)
    await _audit_agent_call(ctx, "read", "product", "allowed", scopes_evaluated=[TENANT_PRODUCTS_READ], resource_id=product_id, db=db)
    return ProductResponse.model_validate(product)
