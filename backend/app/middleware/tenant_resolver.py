"""
Resolvedor de tenant y dependencias de autorización.
Reemplaza gradualmente get_current_business con resolución basada en
host + membership + claims de rol.
"""

import logging
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.security import ensure_business_subscription_active, get_current_user

logger = logging.getLogger(__name__)


@dataclass
class TenantContext:
    """
    Contexto de tenant resuelto para una request.
    Contiene el tenant activo y el rol del usuario en ese tenant.
    """

    tenant_id: UUID
    membership_role: str  # owner, manager, seller
    platform_role: str  # superadmin, tenant_user


@dataclass
class AdminContext:
    """
    Contexto para requests del CMS superadmin.
    Solo usuarios con platform_role=superadmin pueden obtener este contexto.
    """

    user_id: UUID
    platform_role: str = "superadmin"


async def resolve_tenant_from_host(request: Request) -> str | None:
    """
    Extrae el tenant del host de la request.
    Por ahora retorna None (fallback a membership).
    En producción con subdominios reales, parsear host → tenant_slug.
    """
    host = request.headers.get("host", "")
    # Ejemplo futuro: "mi-negocio.octopus.qeva.xyz" → "mi-negocio"
    if "octopus.qeva.xyz" in host and "adminoctopus" not in host:
        parts = host.split(".")
        if len(parts) > 2 and parts[0] not in ("www", "octopus"):
            return parts[0]
    return None


async def get_tenant_context(
    request: Request,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantContext:
    """
    Dependency que resuelve el contexto de tenant para requests de la app tenant.

    Flujo:
    1. Intentar resolver tenant desde el host
    2. Si no hay host específico, usar la membresía del usuario
    3. Validar que el usuario tenga al menos una membresía activa
    4. Retornar TenantContext con tenant_id y membership_role
    """
    from app.models.business import Business
    from app.models.tenant_membership import TenantMembership

    # Intentar resolver desde host
    tenant_slug = await resolve_tenant_from_host(request)

    if tenant_slug:
        # Resolución por host: buscar business por slug (campo futuro)
        # Por ahora fallback a membership
        pass

    # Resolución por membership: obtener todas las membresías del usuario
    query = select(TenantMembership).where(TenantMembership.user_id == current_user.id)
    result = await db.execute(query)
    memberships = result.scalars().all()

    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenés acceso a ningún negocio. Contactá al administrador.",
        )

    # Si hay una sola membresía, usar esa
    if len(memberships) == 1:
        membership = memberships[0]
        business = await db.get(Business, membership.business_id)
        if not business or business.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tenés acceso a ningún negocio activo. Contactá al administrador.",
            )
        await ensure_business_subscription_active(db, business)
        return TenantContext(
            tenant_id=membership.business_id,
            membership_role=membership.role,
            platform_role=current_user.platform_role,
        )

    # Si hay múltiples, usar la de rol más alto (owner > manager > seller)
    role_priority = {"owner": 3, "manager": 2, "seller": 1}
    best_membership = max(memberships, key=lambda m: role_priority.get(m.role, 0))
    business = await db.get(Business, best_membership.business_id)
    if not business or business.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenés acceso a ningún negocio activo. Contactá al administrador.",
        )
    await ensure_business_subscription_active(db, business)

    return TenantContext(
        tenant_id=best_membership.business_id,
        membership_role=best_membership.role,
        platform_role=current_user.platform_role,
    )


async def require_superadmin(
    current_user=Depends(get_current_user),
) -> AdminContext:
    """
    Dependency que verifica que el usuario sea superadmin.
    Usar en todos los endpoints de /api/admin/*.
    """
    if current_user.platform_role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado. Se requiere rol de superadmin.",
        )

    return AdminContext(
        user_id=current_user.id, platform_role=current_user.platform_role
    )


async def require_tenant_access(
    tenant_ctx: TenantContext = Depends(get_tenant_context),
    min_role: str = "seller",
) -> TenantContext:
    """
    Dependency que verifica que el usuario tenga acceso al tenant.
    Opcionalmente requiere un rol mínimo.

    Jerarquía: owner > manager > seller
    """
    role_priority = {"owner": 3, "manager": 2, "seller": 1}

    if role_priority.get(tenant_ctx.membership_role, 0) < role_priority.get(
        min_role, 0
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Acceso denegado. Se requiere rol mínimo: {min_role}",
        )

    return tenant_ctx


async def get_tenant_business_id(
    tenant_ctx: TenantContext = Depends(get_tenant_context),
) -> UUID:
    """
    Dependency que retorna el business_id del tenant actual.
    Drop-in replacement para get_current_business que usa membership.
    """
    return tenant_ctx.tenant_id
