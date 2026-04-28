"""
Router para el CMS superadmin — gestión de tenants, secretos ARCA y branding.
Todos los endpoints están protegidos con require_superadmin().
"""

import logging
from datetime import datetime, timedelta
from uuid import UUID
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.business import Business
from app.models.user import User, PlatformRole
from app.models.tenant_membership import (
    MembershipAccessStatus,
    TenantMembership,
    MembershipRole,
)
from app.models.tenant_secret import TenantSecret
from app.models.audit_log import AuditLog
from app.utils.audit import log_audit
from app.middleware.tenant_resolver import require_superadmin, AdminContext
from app.services.afip_sdk_service import AfipSdkService
from app.utils.crypto import encrypt_api_key, get_last4
from app.utils.security import hash_password
from app.utils.acl import (
    MODULE_KEYS,
    default_module_permissions,
    dump_module_permissions,
    normalize_module_permissions,
    parse_module_permissions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["superadmin"])

# ============================================================================
# Secret types constants
# ============================================================================

SECRET_TYPES = [
    "arca_token",
    "arca_sign",
    "arca_email",
    "arca_cuit_representante",
    "arca_environment",
    "afipsdk_access_token",
    "afip_cert",
    "afip_key",
    "linear_api_key",
]

# ============================================================================
# Pydantic Schemas
# ============================================================================


class SecretStatus(BaseModel):
    """Estado de un secreto individual."""

    configured: bool = False
    last4: Optional[str] = None
    type: str


class ArcaSecretsResponse(BaseModel):
    """Respuesta con el estado de todos los secretos ARCA (enmascarados)."""

    business_id: str
    secrets: dict[str, SecretStatus]


class ArcaSecretsUpdate(BaseModel):
    """Actualización parcial de secretos ARCA."""

    arca_token: Optional[str] = None
    arca_sign: Optional[str] = None
    arca_email: Optional[str] = None
    arca_cuit_representante: Optional[str] = None
    arca_environment: Optional[str] = None
    afipsdk_access_token: Optional[str] = None
    afip_cert: Optional[str] = None
    afip_key: Optional[str] = None
    linear_api_key: Optional[str] = None


class ArcaTestResponse(BaseModel):
    """Respuesta del test de facturación."""

    success: bool
    step: str
    message: str
    cae: Optional[str] = None
    cae_expiration: Optional[str] = None
    voucher_number: Optional[str] = None
    error: Optional[str] = None


class BrandingResponse(BaseModel):
    """Datos de branding fiscal del negocio."""

    id: str
    name: Optional[str] = None
    cuit: Optional[str] = None
    tax_condition: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    header_text: Optional[str] = None
    sale_point: Optional[str] = None
    arca_environment: Optional[str] = None


class BrandingUpdate(BaseModel):
    """Actualización parcial de branding."""

    name: Optional[str] = None
    cuit: Optional[str] = None
    tax_condition: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    header_text: Optional[str] = None
    sale_point: Optional[str] = None
    arca_environment: Optional[str] = None


class FeatureFlagsResponse(BaseModel):
    """Feature flags habilitadas para un tenant."""

    business_id: str
    ai_agent_enabled: bool
    linear_sync_enabled: bool
    current_account_mode: Literal["disabled", "automatic", "manual"]
    invoicing_enabled: bool
    receipts_enabled: bool
    price_update_enabled: bool
    reports_enabled: bool
    sql_backup_enabled: bool = False


class FeatureFlagsUpdate(BaseModel):
    """Actualización parcial de feature flags del tenant."""

    ai_agent_enabled: Optional[bool] = None
    linear_sync_enabled: Optional[bool] = None
    current_account_mode: Optional[Literal["disabled", "automatic", "manual"]] = None
    invoicing_enabled: Optional[bool] = None
    receipts_enabled: Optional[bool] = None
    price_update_enabled: Optional[bool] = None
    reports_enabled: Optional[bool] = None
    sql_backup_enabled: Optional[bool] = None


class TenantResponse(BaseModel):
    """Resumen de un tenant para el listado."""

    id: str
    name: str
    cuit: str
    tax_condition: str
    owner_email: str
    created_at: datetime
    can_delete: bool = True
    subscription_status: str = "active"
    subscription_starts_at: Optional[datetime] = None
    subscription_ends_at: Optional[datetime] = None
    subscription_days_remaining: Optional[int] = None
    subscription_blocked_reason: Optional[str] = None


class TenantListResponse(BaseModel):
    """Respuesta paginada de tenants."""

    tenants: list[TenantResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class TenantCreateRequest(BaseModel):
    """Payload para crear manualmente un comercio desde CMS admin."""

    name: str = Field(..., min_length=2, max_length=255)
    cuit: str = Field(..., min_length=7, max_length=13)
    tax_condition: str = Field(default="Monotributista", max_length=50)
    owner_email: Optional[str] = Field(default=None, max_length=255)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    province: Optional[str] = Field(default=None, max_length=100)
    postal_code: Optional[str] = Field(default=None, max_length=10)
    phone: Optional[str] = Field(default=None, max_length=50)
    email: Optional[str] = Field(default=None, max_length=255)


class TenantDeleteResponse(BaseModel):
    """Resultado de eliminación segura de comercio vacío."""

    tenant_id: str
    deleted: bool
    message: str


class TenantSubscriptionRenewRequest(BaseModel):
    """Renueva la suscripción mensual del comercio."""

    days: int = Field(default=30, ge=1, le=365)


class TenantSubscriptionAccessUpdateRequest(BaseModel):
    """Actualiza estado de acceso del comercio completo."""

    subscription_status: Literal["active", "suspended"]
    blocked_reason: Optional[str] = Field(default=None, max_length=255)


class UserResponse(BaseModel):
    """Resumen de usuario para CMS admin."""

    class UserBusinessResponse(BaseModel):
        """Comercio asignado al usuario mediante membresía."""

        id: str
        name: str

    id: str
    email: str
    name: str
    platform_role: str
    is_active: bool
    created_at: datetime
    businesses: list[UserBusinessResponse] = Field(default_factory=list)


class UserListResponse(BaseModel):
    """Respuesta paginada de usuarios."""

    users: list[UserResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


class UserCreateRequest(BaseModel):
    """Payload mínimo para crear usuarios desde CMS admin."""

    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    name: Optional[str] = Field(default=None, max_length=255)
    platform_role: str = Field(default=PlatformRole.TENANT_USER)
    is_active: bool = Field(default=True)


class UserStatusUpdateRequest(BaseModel):
    """Actualiza estado activo/inactivo del usuario."""

    is_active: bool


class TenantUserResponse(UserResponse):
    """Usuario asignado a tenant con rol de membresía."""

    membership_role: str
    access_starts_at: Optional[datetime] = None
    access_ends_at: Optional[datetime] = None
    access_status: str
    blocked_reason: Optional[str] = None
    days_remaining: Optional[int] = None
    module_permissions: dict[str, bool] = Field(default_factory=dict)


class TenantUserListResponse(BaseModel):
    """Listado de miembros de un tenant."""

    users: list[TenantUserResponse]
    total: int


class TenantUserAssignRequest(BaseModel):
    """Asigna un usuario existente a un tenant por id o email."""

    user_id: Optional[UUID] = None
    email: Optional[str] = Field(default=None, max_length=255)
    role: str = Field(default=MembershipRole.MANAGER)

    @model_validator(mode="after")
    def validate_identifier(self):
        if not self.user_id and not self.email:
            raise ValueError("Debe enviar user_id o email")
        if self.role not in MembershipRole.ALL:
            raise ValueError(
                f"Rol inválido. Valores permitidos: {', '.join(MembershipRole.ALL)}"
            )
        return self


class TenantUserAssignResponse(BaseModel):
    """Resultado de asignación de usuario a tenant."""

    user: TenantUserResponse
    created: bool


class TrialActivateRequest(BaseModel):
    """Activa acceso trial para una membresía existente."""

    days: int = Field(default=30, ge=1, le=365)


class MembershipAccessUpdateRequest(BaseModel):
    """Actualiza estado de acceso de una membresía."""

    access_status: str
    blocked_reason: Optional[str] = Field(default=None, max_length=255)
    access_ends_at: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_access_status(self):
        allowed_statuses = {
            MembershipAccessStatus.ACTIVE,
            MembershipAccessStatus.SUSPENDED,
            MembershipAccessStatus.TRIAL,
        }
        if self.access_status not in allowed_statuses:
            raise ValueError(
                "access_status inválido. Valores permitidos: active, suspended, trial"
            )
        return self


class MembershipPermissionsUpdateRequest(BaseModel):
    """Actualiza permisos granulares por módulo de una membresía."""

    module_permissions: dict[str, bool]

    @model_validator(mode="after")
    def validate_module_permissions(self):
        unknown = sorted(set(self.module_permissions.keys()) - set(MODULE_KEYS))
        if unknown:
            raise ValueError(
                f"Módulos inválidos: {', '.join(unknown)}. Permitidos: {', '.join(MODULE_KEYS)}"
            )
        return self


class PurgeTenantRequest(BaseModel):
    """Solicitud de purga total de datos de un tenant."""

    reason: str = Field(
        ..., min_length=10, max_length=500, description="Motivo obligatorio de la purga"
    )
    confirm_deletion: bool = Field(
        ..., description="Confirmación explícita de que se requiere eliminación total"
    )

    @model_validator(mode="after")
    def validate_confirmation(self):
        if not self.confirm_deletion:
            raise ValueError(
                "Debe confirmar la eliminación marcando confirm_deletion=true"
            )
        return self


class PurgeTenantResponse(BaseModel):
    """Respuesta de operación de purga."""

    tenant_id: str
    purged_tables: dict[str, int]  # table_name -> records_deleted
    reason: str
    executed_by: str  # email del superadmin
    executed_at: datetime


# ============================================================================
# Helpers
# ============================================================================


async def get_business_or_404(tenant_id: UUID, db: AsyncSession) -> Business:
    """Obtiene un business por ID o lanza 404."""
    result = await db.execute(
        select(Business).where(Business.id == tenant_id, Business.deleted_at.is_(None))
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant no encontrado",
        )
    return business


def _mask_secrets(secrets: list[TenantSecret]) -> dict[str, SecretStatus]:
    """Construye el diccionario de estado de secretos (sin valores crudos)."""
    secret_map = {s.secret_type: s for s in secrets}
    result = {}
    for stype in SECRET_TYPES:
        secret = secret_map.get(stype)
        if secret and secret.is_configured:
            result[stype] = SecretStatus(
                configured=True,
                last4=secret.last4,
                type=stype,
            )
        else:
            result[stype] = SecretStatus(
                configured=False,
                last4=None,
                type=stype,
            )
    return result


async def _upsert_secret(
    db: AsyncSession,
    business_id: UUID,
    secret_type: str,
    plain_value: str,
) -> TenantSecret:
    """Crea o actualiza un secreto cifrado."""
    encrypted = encrypt_api_key(plain_value)
    last4 = get_last4(plain_value)

    result = await db.execute(
        select(TenantSecret).where(
            TenantSecret.business_id == business_id,
            TenantSecret.secret_type == secret_type,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.encrypted_value = encrypted
        existing.last4 = last4
        existing.is_configured = True
    else:
        existing = TenantSecret(
            business_id=business_id,
            secret_type=secret_type,
            encrypted_value=encrypted,
            last4=last4,
            is_configured=True,
        )
        db.add(existing)

    return existing


def _serialize_user(user: User) -> UserResponse:
    """Convierte un User SQLAlchemy al esquema de respuesta admin."""
    memberships = user.memberships or []
    businesses = [
        UserResponse.UserBusinessResponse(
            id=str(membership.business.id),
            name=membership.business.name,
        )
        for membership in memberships
        if membership.business is not None
    ]
    businesses.sort(key=lambda item: item.name.lower())

    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        platform_role=user.platform_role,
        is_active=user.is_active,
        created_at=user.created_at,
        businesses=businesses,
    )


def _serialize_tenant(business: Business, can_delete: bool = True) -> TenantResponse:
    """Convierte un Business al resumen de tenant para CMS."""
    return TenantResponse(
        id=str(business.id),
        name=business.name,
        cuit=business.cuit,
        tax_condition=business.tax_condition,
        owner_email=business.owner.email if business.owner else "Sin usuario asignado",
        created_at=business.created_at,
        can_delete=can_delete,
        subscription_status=business.subscription_status or "active",
        subscription_starts_at=business.subscription_starts_at,
        subscription_ends_at=business.subscription_ends_at,
        subscription_days_remaining=_calculate_days_remaining(
            business.subscription_ends_at
        ),
        subscription_blocked_reason=business.subscription_blocked_reason,
    )


async def _tenant_operational_counts(
    db: AsyncSession, tenant_id: UUID
) -> dict[str, int]:
    """Cuenta datos operativos que bloquean la eliminación manual del comercio."""
    checks = {
        "productos": "SELECT COUNT(*) FROM products WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "clientes": "SELECT COUNT(*) FROM clients WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "proveedores": "SELECT COUNT(*) FROM suppliers WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "categorias": "SELECT COUNT(*) FROM categories WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "comprobantes": "SELECT COUNT(*) FROM vouchers WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "pagos": "SELECT COUNT(*) FROM payments WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "cajas": "SELECT COUNT(*) FROM cash_registers WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "ordenes_pedido": "SELECT COUNT(*) FROM purchase_orders WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "borradores_precios": "SELECT COUNT(*) FROM price_update_drafts WHERE business_id = :tenant_id AND deleted_at IS NULL",
        "feedback": "SELECT COUNT(*) FROM feedback_tickets WHERE business_id = :tenant_id",
    }

    counts: dict[str, int] = {}
    for label, sql in checks.items():
        result = await db.execute(text(sql), {"tenant_id": str(tenant_id)})
        count = result.scalar() or 0
        counts[label] = int(count)
    return counts


async def _tenant_can_be_deleted(db: AsyncSession, tenant_id: UUID) -> bool:
    """Indica si el comercio no tiene datos operativos cargados."""
    counts = await _tenant_operational_counts(db, tenant_id)
    return not any(counts.values())


def _calculate_days_remaining(access_ends_at: Optional[datetime]) -> Optional[int]:
    """Calcula días restantes de acceso redondeando hacia arriba."""
    if access_ends_at is None:
        return None
    remaining_seconds = (access_ends_at - datetime.utcnow()).total_seconds()
    if remaining_seconds <= 0:
        return 0
    return int((remaining_seconds + 86399) // 86400)


def _serialize_tenant_user(
    user: User, membership: TenantMembership
) -> TenantUserResponse:
    """Serializa un usuario de tenant incluyendo estado de acceso."""
    access_status = membership.access_status or MembershipAccessStatus.ACTIVE
    return TenantUserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        platform_role=user.platform_role,
        is_active=user.is_active,
        created_at=user.created_at,
        membership_role=membership.role,
        access_starts_at=membership.access_starts_at,
        access_ends_at=membership.access_ends_at,
        access_status=access_status,
        blocked_reason=membership.blocked_reason,
        days_remaining=_calculate_days_remaining(membership.access_ends_at),
        module_permissions=parse_module_permissions(
            membership.module_permissions,
            membership.role,
        ),
    )


async def _get_membership_or_404(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
) -> TenantMembership:
    """Obtiene una membresía por tenant y usuario o retorna 404."""
    membership_result = await db.execute(
        select(TenantMembership).where(
            TenantMembership.user_id == user_id,
            TenantMembership.business_id == tenant_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membresía no encontrada para este usuario en el tenant",
        )
    return membership


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/tenants", response_model=TenantListResponse)
async def list_tenants(
    page: int = Query(1, ge=1, description="Número de página"),
    per_page: int = Query(20, ge=1, le=100, description="Resultados por página"),
    search: Optional[str] = Query(None, description="Buscar por nombre de negocio"),
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    Lista todos los tenants (negocios) con paginación y búsqueda.
    """
    base_query = select(Business).where(Business.deleted_at.is_(None)).options(selectinload(Business.owner))

    if search:
        base_query = base_query.where(Business.name.ilike(f"%{search}%"))

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    total_pages = max(1, (total + per_page - 1) // per_page)

    offset = (page - 1) * per_page
    query = (
        base_query.order_by(Business.created_at.desc()).offset(offset).limit(per_page)
    )
    result = await db.execute(query)
    businesses = result.scalars().all()

    tenants = [
        _serialize_tenant(
            business,
            can_delete=await _tenant_can_be_deleted(db, UUID(str(business.id))),
        )
        for business in businesses
    ]

    return TenantListResponse(
        tenants=tenants,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    data: TenantCreateRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Crea manualmente un comercio; asignar usuario es un paso separado."""
    normalized_cuit = data.cuit.strip()
    existing_result = await db.execute(
        select(Business).where(
            Business.cuit == normalized_cuit,
            Business.deleted_at.is_(None),
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un comercio con ese CUIT",
        )

    owner: Optional[User] = None
    if data.owner_email:
        normalized_owner_email = data.owner_email.strip().lower()
        owner_result = await db.execute(
            select(User).where(User.email == normalized_owner_email)
        )
        owner = owner_result.scalar_one_or_none()
        if owner is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No existe un usuario con ese email para asignarlo como owner",
            )

    business = Business(
        owner_id=owner.id if owner else None,
        name=data.name.strip(),
        cuit=normalized_cuit,
        tax_condition=data.tax_condition.strip() or "Monotributista",
        address=data.address,
        city=data.city,
        province=data.province,
        postal_code=data.postal_code,
        phone=data.phone,
        email=data.email,
        subscription_starts_at=datetime.utcnow(),
        subscription_ends_at=datetime.utcnow() + timedelta(days=30),
        subscription_status="active",
    )
    db.add(business)
    await db.flush()

    if owner:
        membership = TenantMembership(
            user_id=owner.id,
            business_id=business.id,
            role=MembershipRole.OWNER,
            module_permissions=dump_module_permissions(
                default_module_permissions(MembershipRole.OWNER),
                MembershipRole.OWNER,
            ),
        )
        db.add(membership)

    await db.commit()
    await db.refresh(business)
    await db.refresh(business, attribute_names=["owner"])

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=business.id,
        action="create",
        resource_type="tenant",
        resource_id=business.id,
        details={
            "description": "Comercio creado manualmente desde CMS",
            "assigned_owner_email": owner.email if owner else None,
        },
    )
    await db.commit()

    return _serialize_tenant(business)


@router.post(
    "/tenants/{tenant_id}/subscription/renew",
    response_model=TenantResponse,
)
async def renew_tenant_subscription(
    tenant_id: UUID,
    data: TenantSubscriptionRenewRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Renueva el comercio por N días; pago mensual típico = 30 días."""
    business = await get_business_or_404(tenant_id, db)
    now = datetime.utcnow()
    business.subscription_starts_at = now
    business.subscription_ends_at = now + timedelta(days=data.days)
    business.subscription_status = "active"
    business.subscription_blocked_reason = None

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="renew",
        resource_type="tenant_subscription",
        resource_id=tenant_id,
        details={
            "description": "Suscripción del comercio renovada desde CMS",
            "days": data.days,
            "subscription_ends_at": business.subscription_ends_at.isoformat(),
        },
    )
    await db.commit()
    await db.refresh(business)
    await db.refresh(business, attribute_names=["owner"])

    return _serialize_tenant(
        business,
        can_delete=await _tenant_can_be_deleted(db, tenant_id),
    )


@router.patch(
    "/tenants/{tenant_id}/subscription/access",
    response_model=TenantResponse,
)
async def update_tenant_subscription_access(
    tenant_id: UUID,
    data: TenantSubscriptionAccessUpdateRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Bloquea o reactiva manualmente el acceso de todo el comercio."""
    business = await get_business_or_404(tenant_id, db)
    business.subscription_status = data.subscription_status
    business.subscription_blocked_reason = (
        data.blocked_reason if data.subscription_status == "suspended" else None
    )

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="update_access",
        resource_type="tenant_subscription",
        resource_id=tenant_id,
        details={
            "description": "Acceso del comercio actualizado desde CMS",
            "subscription_status": data.subscription_status,
            "blocked_reason": business.subscription_blocked_reason,
        },
    )
    await db.commit()
    await db.refresh(business)
    await db.refresh(business, attribute_names=["owner"])

    return _serialize_tenant(
        business,
        can_delete=await _tenant_can_be_deleted(db, tenant_id),
    )


@router.delete("/tenants/{tenant_id}", response_model=TenantDeleteResponse)
async def delete_empty_tenant(
    tenant_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Elimina manualmente un comercio sin datos operativos cargados."""
    business = await get_business_or_404(tenant_id, db)
    counts = await _tenant_operational_counts(db, tenant_id)
    blocking_counts = {label: count for label, count in counts.items() if count > 0}

    if blocking_counts:
        detail = ", ".join(
            f"{label}: {count}" for label, count in blocking_counts.items()
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede eliminar el comercio porque tiene datos cargados ({detail}). Usá purga controlada si realmente querés vaciarlo.",
        )

    # Remover accesos/configuración asociados para que el comercio deje de aparecer.
    await db.execute(
        text("DELETE FROM tenant_memberships WHERE business_id = :tenant_id"),
        {"tenant_id": str(tenant_id)},
    )
    await db.execute(
        text("DELETE FROM tenant_secrets WHERE business_id = :tenant_id"),
        {"tenant_id": str(tenant_id)},
    )
    await db.execute(
        text("DELETE FROM ai_provider_configs WHERE business_id = :tenant_id"),
        {"tenant_id": str(tenant_id)},
    )

    business.owner_id = None
    business.deleted_at = datetime.utcnow()

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="delete",
        resource_type="tenant",
        resource_id=tenant_id,
        details={
            "description": "Comercio vacío eliminado manualmente desde CMS",
            "business_name": business.name,
            "business_cuit": business.cuit,
        },
    )
    await db.commit()

    return TenantDeleteResponse(
        tenant_id=str(tenant_id),
        deleted=True,
        message="Comercio eliminado correctamente",
    )


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1, description="Número de página"),
    per_page: int = Query(20, ge=1, le=100, description="Resultados por página"),
    search: Optional[str] = Query(None, description="Buscar por email o nombre"),
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Lista usuarios de plataforma con paginación y búsqueda básica."""
    base_query = select(User).options(
        selectinload(User.memberships).selectinload(TenantMembership.business)
    )

    if search:
        search_term = f"%{search.strip()}%"
        base_query = base_query.where(
            or_(
                User.email.ilike(search_term),
                User.name.ilike(search_term),
            )
        )

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    total_pages = max(1, (total + per_page - 1) // per_page)

    offset = (page - 1) * per_page
    query = base_query.order_by(User.created_at.desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    return UserListResponse(
        users=[_serialize_user(user) for user in users],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreateRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Crea un usuario mínimo para habilitar asignación a tenants."""
    normalized_email = data.email.strip().lower()

    existing_result = await db.execute(
        select(User).where(User.email == normalized_email)
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese email",
        )

    name = (data.name or "").strip() or normalized_email.split("@")[0]
    user = User(
        email=normalized_email,
        name=name,
        password_hash=hash_password(data.password),
        google_id=None,
        platform_role=data.platform_role,
        is_active=data.is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await db.refresh(user, attribute_names=["memberships"])

    return _serialize_user(user)


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def update_user_status(
    user_id: UUID,
    data: UserStatusUpdateRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza estado activo/inactivo de un usuario del CMS admin."""
    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.memberships).selectinload(TenantMembership.business))
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    user.is_active = data.is_active
    await db.commit()

    await db.refresh(user)

    return _serialize_user(user)


@router.get("/tenants/{tenant_id}/users", response_model=TenantUserListResponse)
async def list_tenant_users(
    tenant_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Lista usuarios asignados al tenant y su rol de membresía."""
    await get_business_or_404(tenant_id, db)

    result = await db.execute(
        select(TenantMembership, User)
        .join(User, User.id == TenantMembership.user_id)
        .where(TenantMembership.business_id == tenant_id)
        .order_by(User.email.asc())
    )
    rows = result.all()

    users = [_serialize_tenant_user(user, membership) for membership, user in rows]

    return TenantUserListResponse(users=users, total=len(users))


@router.post(
    "/tenants/{tenant_id}/users",
    response_model=TenantUserAssignResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_user_to_tenant(
    tenant_id: UUID,
    data: TenantUserAssignRequest,
    response: Response,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Asigna usuario existente a tenant. Es idempotente para evitar duplicados."""
    business = await get_business_or_404(tenant_id, db)

    user: Optional[User] = None
    if data.user_id:
        result = await db.execute(select(User).where(User.id == data.user_id))
        user = result.scalar_one_or_none()
    elif data.email:
        normalized_email = data.email.strip().lower()
        result = await db.execute(select(User).where(User.email == normalized_email))
        user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    membership_result = await db.execute(
        select(TenantMembership).where(
            TenantMembership.user_id == user.id,
            TenantMembership.business_id == tenant_id,
        )
    )
    existing_membership = membership_result.scalar_one_or_none()
    if existing_membership:
        should_update_membership = False
        if existing_membership.role != data.role:
            existing_membership.role = data.role
            existing_membership.module_permissions = dump_module_permissions(
                default_module_permissions(data.role),
                data.role,
            )
            should_update_membership = True

        if data.role == MembershipRole.OWNER and business.owner_id != user.id:
            business.owner_id = user.id
            should_update_membership = True

        if should_update_membership:
            await db.commit()
            await db.refresh(existing_membership)
        response.status_code = status.HTTP_200_OK
        return TenantUserAssignResponse(
            user=_serialize_tenant_user(user, existing_membership),
            created=False,
        )

    membership = TenantMembership(
        user_id=user.id,
        business_id=tenant_id,
        role=data.role,
        module_permissions=dump_module_permissions(
            default_module_permissions(data.role),
            data.role,
        ),
    )
    db.add(membership)
    if data.role == MembershipRole.OWNER:
        business.owner_id = user.id
    await db.commit()

    return TenantUserAssignResponse(
        user=_serialize_tenant_user(user, membership),
        created=True,
    )


@router.post(
    "/tenants/{tenant_id}/users/{user_id}/trial",
    response_model=TenantUserResponse,
)
async def activate_trial_for_tenant_user(
    tenant_id: UUID,
    user_id: UUID,
    data: TrialActivateRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Activa un período trial para un usuario dentro de un tenant."""
    await get_business_or_404(tenant_id, db)
    membership = await _get_membership_or_404(db, tenant_id, user_id)

    now = datetime.utcnow()
    membership.access_starts_at = now
    membership.access_ends_at = now + timedelta(days=data.days)
    membership.access_status = MembershipAccessStatus.TRIAL
    membership.blocked_reason = None
    await db.commit()

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    return _serialize_tenant_user(user, membership)


@router.patch(
    "/tenants/{tenant_id}/users/{user_id}/access",
    response_model=TenantUserResponse,
)
async def update_tenant_user_access(
    tenant_id: UUID,
    user_id: UUID,
    data: MembershipAccessUpdateRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza estado de acceso de una membresía de tenant."""
    await get_business_or_404(tenant_id, db)
    membership = await _get_membership_or_404(db, tenant_id, user_id)

    membership.access_status = data.access_status
    membership.blocked_reason = data.blocked_reason

    if data.access_status == MembershipAccessStatus.ACTIVE:
        membership.blocked_reason = None
    if data.access_ends_at is not None:
        membership.access_ends_at = data.access_ends_at

    await db.commit()

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    return _serialize_tenant_user(user, membership)


@router.patch(
    "/tenants/{tenant_id}/users/{user_id}/permissions",
    response_model=TenantUserResponse,
)
async def update_tenant_user_permissions(
    tenant_id: UUID,
    user_id: UUID,
    data: MembershipPermissionsUpdateRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza permisos granulares por módulo para una membresía."""
    await get_business_or_404(tenant_id, db)
    membership = await _get_membership_or_404(db, tenant_id, user_id)

    normalized = normalize_module_permissions(data.module_permissions, membership.role)
    membership.module_permissions = dump_module_permissions(normalized, membership.role)
    await db.commit()

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    return _serialize_tenant_user(user, membership)


@router.delete(
    "/tenants/{tenant_id}/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_user_from_tenant(
    tenant_id: UUID,
    user_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    Quita la membresía de un usuario dentro de un tenant sin eliminar su identidad global.

    En un sistema multi-tenant, borrar la relación usuario↔comercio es distinto a
    borrar el usuario completo: el mismo usuario puede pertenecer a otros comercios.
    """
    business = await get_business_or_404(tenant_id, db)
    membership = await _get_membership_or_404(db, tenant_id, user_id)

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    removed_role = membership.role
    cleared_owner = business.owner_id == user_id
    if cleared_owner:
        business.owner_id = None

    await db.delete(membership)

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="delete",
        resource_type="tenant_membership",
        resource_id=user_id,
        details={
            "description": "Usuario quitado del comercio desde CMS",
            "removed_user_email": user.email,
            "removed_role": removed_role,
            "cleared_owner": cleared_owner,
        },
    )
    await db.commit()
    return None


@router.get("/tenants/{tenant_id}/arca-secrets", response_model=ArcaSecretsResponse)
async def get_arca_secrets(
    tenant_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    Obtiene el estado de los secretos ARCA de un tenant.
    NUNCA retorna valores crudos — solo estado y últimos 4 caracteres.
    """
    business = await get_business_or_404(tenant_id, db)

    result = await db.execute(
        select(TenantSecret).where(TenantSecret.business_id == tenant_id)
    )
    secrets = result.scalars().all()

    return ArcaSecretsResponse(
        business_id=str(tenant_id),
        secrets=_mask_secrets(secrets),
    )


@router.put("/tenants/{tenant_id}/arca-secrets", response_model=ArcaSecretsResponse)
async def update_arca_secrets(
    tenant_id: UUID,
    data: ArcaSecretsUpdate,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    Actualiza los secretos ARCA de un tenant.
    Acepta actualizaciones parciales — solo se procesan los campos enviados.
    Los valores se cifran antes de almacenar.
    """
    business = await get_business_or_404(tenant_id, db)

    updates = data.model_dump(exclude_unset=True)
    updated_types = []

    for secret_type, plain_value in updates.items():
        if plain_value is not None and plain_value.strip():
            await _upsert_secret(db, tenant_id, secret_type, plain_value)
            updated_types.append(secret_type)

    await db.commit()

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="update",
        resource_type="arca_secret",
        resource_id=tenant_id,
        details={"updated_types": updated_types},
    )

    result = await db.execute(
        select(TenantSecret).where(TenantSecret.business_id == tenant_id)
    )
    secrets = result.scalars().all()

    logger.info(f"Secretos ARCA actualizados para tenant {tenant_id}: {updated_types}")

    return ArcaSecretsResponse(
        business_id=str(tenant_id),
        secrets=_mask_secrets(secrets),
    )


@router.delete(
    "/tenants/{tenant_id}/arca-secrets", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_arca_secrets(
    tenant_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    Invalida todos los secretos ARCA de un tenant en almacenamiento seguro.
    Limpia valor cifrado y metadata de masking sin exponer datos sensibles.
    """
    await get_business_or_404(tenant_id, db)

    result = await db.execute(
        select(TenantSecret).where(TenantSecret.business_id == tenant_id)
    )
    secrets = result.scalars().all()

    invalidated_types = []
    for secret in secrets:
        secret.encrypted_value = None
        secret.last4 = None
        secret.is_configured = False
        invalidated_types.append(secret.secret_type)

    await db.commit()

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="delete",
        resource_type="arca_secret",
        resource_id=tenant_id,
        details={
            "invalidated_types": sorted(invalidated_types),
            "invalidated_count": len(invalidated_types),
        },
    )

    logger.info(
        "Secretos ARCA invalidados para tenant %s: %s",
        tenant_id,
        invalidated_types,
    )


@router.post("/tenants/{tenant_id}/arca-test", response_model=ArcaTestResponse)
async def test_arca_invoice(
    tenant_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    Envía una factura de prueba para verificar la integración ARCA/AFIP.
    Valida que los secretos estén configurados antes de intentar la emisión.
    """
    business = await get_business_or_404(tenant_id, db)

    result = await db.execute(
        select(TenantSecret).where(TenantSecret.business_id == tenant_id)
    )
    secrets = result.scalars().all()
    secret_map = {s.secret_type: s for s in secrets}

    if not secret_map.get("afipsdk_access_token", TenantSecret()).is_configured:
        return ArcaTestResponse(
            success=False,
            step="config",
            message="No hay access_token de Afip SDK configurado.",
        )

    if not business.cuit:
        return ArcaTestResponse(
            success=False,
            step="config",
            message="El CUIT del negocio no está configurado.",
        )

    sale_point = int(business.sale_point or "1")
    cbte_fch = datetime.now().strftime("%Y%m%d")

    test_data = {
        "CantReg": 1,
        "PtoVta": sale_point,
        "CbteTipo": 6,
        "Concepto": 1,
        "DocTipo": 99,
        "DocNro": 0,
        "CbteFch": cbte_fch,
        "ImpTotal": 121.00,
        "ImpTotConc": 0,
        "ImpNeto": 100.00,
        "ImpOpEx": 0,
        "ImpTrib": 0,
        "ImpIVA": 21.00,
        "MonId": "PES",
        "MonCotiz": 1,
        "CondicionIVAReceptorId": 5,
        "Iva": [
            {
                "Id": 5,
                "BaseImp": 100,
                "Importe": 21,
            }
        ],
    }

    service = AfipSdkService(business)

    try:
        logger.info(f"Enviando factura de prueba para tenant {tenant_id}")
        result = await service.create_next_voucher(test_data)

        if result["success"]:
            await log_audit(
                db=db,
                user_id=admin.user_id,
                business_id=tenant_id,
                action="test_invoice",
                resource_type="arca_secret",
                resource_id=tenant_id,
                details={
                    "cae": result.get("CAE"),
                    "voucher_number": result.get("voucherNumber"),
                },
            )

            return ArcaTestResponse(
                success=True,
                step="factura",
                message="¡Factura de prueba emitida exitosamente!",
                cae=result.get("CAE"),
                cae_expiration=result.get("CAEFchVto"),
                voucher_number=result.get("voucherNumber"),
            )
        else:
            return ArcaTestResponse(
                success=False,
                step="factura",
                message="Error al emitir factura de prueba",
                error=result.get("error"),
            )

    except Exception as e:
        logger.error(f"Error en factura de prueba para tenant {tenant_id}: {e}")
        return ArcaTestResponse(
            success=False,
            step="error",
            message=f"Error inesperado: {str(e)}",
        )


@router.get("/tenants/{tenant_id}/branding", response_model=BrandingResponse)
async def get_branding(
    tenant_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    Obtiene los datos de branding fiscal de un tenant.
    """
    business = await get_business_or_404(tenant_id, db)

    return BrandingResponse(
        id=str(business.id),
        name=business.name,
        cuit=business.cuit,
        tax_condition=business.tax_condition,
        address=business.address,
        city=business.city,
        province=business.province,
        postal_code=business.postal_code,
        phone=business.phone,
        email=business.email,
        logo_url=business.logo_url,
        header_text=business.header_text,
        sale_point=business.sale_point,
        arca_environment=business.arca_environment,
    )


@router.get("/tenants/{tenant_id}/features", response_model=FeatureFlagsResponse)
async def get_feature_flags(
    tenant_id: UUID,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Obtiene las feature flags configurables del tenant."""
    business = await get_business_or_404(tenant_id, db)

    return FeatureFlagsResponse(
        business_id=str(business.id),
        ai_agent_enabled=bool(business.ai_agent_enabled),
        linear_sync_enabled=bool(business.linear_sync_enabled),
        current_account_mode=business.current_account_mode or "disabled",
        invoicing_enabled=bool(business.invoicing_enabled),
        receipts_enabled=bool(business.receipts_enabled),
        price_update_enabled=bool(business.price_update_enabled),
        reports_enabled=bool(business.reports_enabled),
        sql_backup_enabled=bool(business.sql_backup_enabled),
    )


@router.patch("/tenants/{tenant_id}/features", response_model=FeatureFlagsResponse)
async def update_feature_flags(
    tenant_id: UUID,
    data: FeatureFlagsUpdate,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza feature flags del tenant desde CMS admin."""
    business = await get_business_or_404(tenant_id, db)

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se enviaron cambios de funcionalidades",
        )

    for field, value in update_data.items():
        setattr(business, field, value)

    await db.commit()
    await db.refresh(business)

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="update",
        resource_type="feature_flags",
        resource_id=tenant_id,
        details={"updated_fields": list(update_data.keys()), **update_data},
    )

    return FeatureFlagsResponse(
        business_id=str(business.id),
        ai_agent_enabled=bool(business.ai_agent_enabled),
        linear_sync_enabled=bool(business.linear_sync_enabled),
        current_account_mode=business.current_account_mode or "disabled",
        invoicing_enabled=bool(business.invoicing_enabled),
        receipts_enabled=bool(business.receipts_enabled),
        price_update_enabled=bool(business.price_update_enabled),
        reports_enabled=bool(business.reports_enabled),
    )


@router.put("/tenants/{tenant_id}/branding", response_model=BrandingResponse)
async def update_branding(
    tenant_id: UUID,
    data: BrandingUpdate,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    Actualiza los datos de branding fiscal de un tenant.
    Acepta actualizaciones parciales.
    """
    business = await get_business_or_404(tenant_id, db)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(business, field, value)

    await db.commit()
    await db.refresh(business)

    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="update",
        resource_type="branding",
        resource_id=tenant_id,
        details={"updated_fields": list(update_data.keys())},
    )

    logger.info(f"Branding actualizado para tenant {tenant_id} por superadmin")

    return BrandingResponse(
        id=str(business.id),
        name=business.name,
        cuit=business.cuit,
        tax_condition=business.tax_condition,
        address=business.address,
        city=business.city,
        province=business.province,
        postal_code=business.postal_code,
        phone=business.phone,
        email=business.email,
        logo_url=business.logo_url,
        header_text=business.header_text,
        sale_point=business.sale_point,
        arca_environment=business.arca_environment,
    )


@router.post("/tenants/{tenant_id}/purge", response_model=PurgeTenantResponse)
async def purge_tenant_data(
    tenant_id: UUID,
    data: PurgeTenantRequest,
    admin: AdminContext = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """
    PURGA TOTAL E INMUTABLE de todos los datos de un tenant.
    Esta operación es DESTRUCTIVA e IRREVERSIBLE.

    Elimina (soft delete donde corresponde):
    - Todas las órdenes de pedido
    - Todos los movimientos de caja
    - Todos los comprobantes y sus ítems
    - Todos los productos y su historial de precios
    - Todas las categorías (solo las que tienen productos del tenant)
    - Todos los proveedores (solo los que tienen productos del tenant)
    - Todos los clientes
    - Todos los miembros del tenant (membresías, no usuarios)
    - Todos los secrets de configuración
    - Todos los proveedores de AI configurados

    NO ELIMINA:
    - El registro del business (solo marco como inactivo)
    - Los usuarios (solo su membresía en este tenant)

    REQUIERE:
    - Permisos de superadmin
    - Razón explícita y confirmación de eliminación

    La operación se registra en auditoría con detalles completos.
    """
    business = await get_business_or_404(tenant_id, db)

    logger.warning(
        f"=== TENANT PURGE REQUESTED === Tenant: {tenant_id}, Admin: {admin.user_id}, Reason: {data.reason}"
    )

    purged_tables = {}

    # 1. Purchase Order Items (primero por FK)
    poi_result = await db.execute(
        select(func.count()).select_from(
            text(f"""
                (SELECT poi.id FROM purchase_order_items poi
                 JOIN purchase_orders po ON poi.purchase_order_id = po.id
                 WHERE po.business_id = '{tenant_id}')
            """)
        )
    )
    poi_count = poi_result.scalar() or 0
    if poi_count > 0:
        await db.execute(
            text(f"""
                UPDATE purchase_order_items SET deleted_at = NOW()
                WHERE id IN (
                    SELECT poi.id FROM purchase_order_items poi
                    JOIN purchase_orders po ON poi.purchase_order_id = po.id
                    WHERE po.business_id = '{tenant_id}' AND poi.deleted_at IS NULL
                )
            """)
        )
    purged_tables["purchase_order_items"] = poi_count

    # 2. Purchase Orders
    po_result = await db.execute(
        select(func.count(PurchaseOrder.id)).where(
            PurchaseOrder.business_id == tenant_id, PurchaseOrder.deleted_at.is_(None)
        )
    )
    po_count = po_result.scalar() or 0
    if po_count > 0:
        await db.execute(
            text(
                f"UPDATE purchase_orders SET deleted_at = NOW() WHERE business_id = '{tenant_id}' AND deleted_at IS NULL"
            )
        )
    purged_tables["purchase_orders"] = po_count

    # 3. Cash Movements (vía Cash Registers)
    cm_result = await db.execute(
        select(func.count()).select_from(
            text(f"""
                (SELECT cm.id FROM cash_movements cm
                 JOIN cash_registers cr ON cm.cash_register_id = cr.id
                 WHERE cr.business_id = '{tenant_id}')
            """)
        )
    )
    cm_count = cm_result.scalar() or 0
    if cm_count > 0:
        await db.execute(
            text(f"""
                UPDATE cash_movements SET deleted_at = NOW()
                WHERE id IN (
                    SELECT cm.id FROM cash_movements cm
                    JOIN cash_registers cr ON cm.cash_register_id = cr.id
                    WHERE cr.business_id = '{tenant_id}' AND cm.deleted_at IS NULL
                )
            """)
        )
    purged_tables["cash_movements"] = cm_count

    # 4. Cash Registers
    cr_result = await db.execute(
        select(func.count(CashRegister.id)).where(
            CashRegister.business_id == tenant_id, CashRegister.deleted_at.is_(None)
        )
    )
    cr_count = cr_result.scalar() or 0
    if cr_count > 0:
        await db.execute(
            text(
                f"UPDATE cash_registers SET deleted_at = NOW() WHERE business_id = '{tenant_id}' AND deleted_at IS NULL"
            )
        )
    purged_tables["cash_registers"] = cr_count

    # 5. Payments (vía Vouchers)
    p_result = await db.execute(
        select(func.count()).select_from(
            text(f"""
                (SELECT p.id FROM payments p
                 JOIN vouchers v ON p.voucher_id = v.id
                 WHERE v.business_id = '{tenant_id}')
            """)
        )
    )
    p_count = p_result.scalar() or 0
    if p_count > 0:
        await db.execute(
            text(f"""
                UPDATE payments SET deleted_at = NOW()
                WHERE id IN (
                    SELECT p.id FROM payments p
                    JOIN vouchers v ON p.voucher_id = v.id
                    WHERE v.business_id = '{tenant_id}' AND p.deleted_at IS NULL
                )
            """)
        )
    purged_tables["payments"] = p_count

    # 6. Voucher Items (vía Vouchers)
    vi_result = await db.execute(
        select(func.count()).select_from(
            text(f"""
                (SELECT vi.id FROM voucher_items vi
                 JOIN vouchers v ON vi.voucher_id = v.id
                 WHERE v.business_id = '{tenant_id}')
            """)
        )
    )
    vi_count = vi_result.scalar() or 0
    if vi_count > 0:
        await db.execute(
            text(f"""
                UPDATE voucher_items SET deleted_at = NOW()
                WHERE id IN (
                    SELECT vi.id FROM voucher_items vi
                    JOIN vouchers v ON vi.voucher_id = v.id
                    WHERE v.business_id = '{tenant_id}' AND vi.deleted_at IS NULL
                )
            """)
        )
    purged_tables["voucher_items"] = vi_count

    # 7. Vouchers
    v_result = await db.execute(
        select(func.count(Voucher.id)).where(
            Voucher.business_id == tenant_id, Voucher.deleted_at.is_(None)
        )
    )
    v_count = v_result.scalar() or 0
    if v_count > 0:
        await db.execute(
            text(
                f"UPDATE vouchers SET deleted_at = NOW() WHERE business_id = '{tenant_id}' AND deleted_at IS NULL"
            )
        )
    purged_tables["vouchers"] = v_count

    # 8. Price History (vía Products)
    ph_result = await db.execute(
        select(func.count()).select_from(
            text(f"""
                (SELECT ph.id FROM price_histories ph
                 JOIN products p ON ph.product_id = p.id
                 WHERE p.business_id = '{tenant_id}')
            """)
        )
    )
    ph_count = ph_result.scalar() or 0
    if ph_count > 0:
        await db.execute(
            text(f"""
                UPDATE price_histories SET deleted_at = NOW()
                WHERE id IN (
                    SELECT ph.id FROM price_histories ph
                    JOIN products p ON ph.product_id = p.id
                    WHERE p.business_id = '{tenant_id}' AND ph.deleted_at IS NULL
                )
            """)
        )
    purged_tables["price_histories"] = ph_count

    # 9. Products
    prod_result = await db.execute(
        select(func.count(Product.id)).where(
            Product.business_id == tenant_id, Product.deleted_at.is_(None)
        )
    )
    prod_count = prod_result.scalar() or 0
    if prod_count > 0:
        await db.execute(
            text(
                f"UPDATE products SET deleted_at = NOW() WHERE business_id = '{tenant_id}' AND deleted_at IS NULL"
            )
        )
    purged_tables["products"] = prod_count

    # 10. Categories (solo las que tenían productos del tenant)
    cat_ids_result = await db.execute(
        text(f"""
            SELECT DISTINCT c.id FROM categories c
            JOIN products p ON c.id = p.category_id
            WHERE p.business_id = '{tenant_id}'
        """)
    )
    cat_ids = [row[0] for row in cat_ids_result.fetchall()]
    if cat_ids:
        await db.execute(
            text(
                f"UPDATE categories SET deleted_at = NOW() WHERE id = ANY(ARRAY{cat_ids}) AND deleted_at IS NULL"
            )
        )
    purged_tables["categories"] = len(cat_ids)

    # 11. Suppliers
    supp_ids_result = await db.execute(
        text(f"""
            SELECT DISTINCT s.id FROM suppliers s
            JOIN products p ON s.id = p.supplier_id
            WHERE p.business_id = '{tenant_id}'
            UNION
            SELECT DISTINCT s.id FROM suppliers s
            JOIN purchase_orders po ON s.id = po.supplier_id
            WHERE po.business_id = '{tenant_id}'
        """)
    )
    supp_ids = [row[0] for row in supp_ids_result.fetchall()]
    if supp_ids:
        await db.execute(
            text(
                f"UPDATE suppliers SET deleted_at = NOW() WHERE id = ANY(ARRAY{supp_ids}) AND deleted_at IS NULL"
            )
        )
    purged_tables["suppliers"] = len(supp_ids)

    # 12. Clients
    client_result = await db.execute(
        select(func.count(Client.id)).where(
            Client.business_id == tenant_id, Client.deleted_at.is_(None)
        )
    )
    client_count = client_result.scalar() or 0
    if client_count > 0:
        await db.execute(
            text(
                f"UPDATE clients SET deleted_at = NOW() WHERE business_id = '{tenant_id}' AND deleted_at IS NULL"
            )
        )
    purged_tables["clients"] = client_count

    # 13. Tenant Secrets (hard delete)
    secret_result = await db.execute(
        select(func.count(TenantSecret.id)).where(TenantSecret.business_id == tenant_id)
    )
    secret_count = secret_result.scalar() or 0
    if secret_count > 0:
        await db.execute(
            text(f"DELETE FROM tenant_secrets WHERE business_id = '{tenant_id}'")
        )
    purged_tables["tenant_secrets"] = secret_count

    # 14. AI Provider Configs (hard delete)
    ai_result = await db.execute(
        select(func.count(AIProviderConfig.id)).where(
            AIProviderConfig.business_id == tenant_id
        )
    )
    ai_count = ai_result.scalar() or 0
    if ai_count > 0:
        await db.execute(
            text(f"DELETE FROM ai_provider_configs WHERE business_id = '{tenant_id}'")
        )
    purged_tables["ai_provider_configs"] = ai_count

    # 15. Tenant Memberships (hard delete)
    member_result = await db.execute(
        select(func.count(TenantMembership.id)).where(
            TenantMembership.business_id == tenant_id
        )
    )
    member_count = member_result.scalar() or 0
    if member_count > 0:
        await db.execute(
            text(f"DELETE FROM tenant_memberships WHERE business_id = '{tenant_id}'")
        )
    purged_tables["tenant_memberships"] = member_count

    # Marcar business como purgado
    business.deleted_at = datetime.utcnow()
    await db.commit()

    # Log audit con detalles completos
    await log_audit(
        db=db,
        user_id=admin.user_id,
        business_id=tenant_id,
        action="tenant_purge",
        resource_type="business",
        resource_id=tenant_id,
        details={
            "reason": data.reason,
            "purged_tables": purged_tables,
            "total_records_deleted": sum(purged_tables.values()),
        },
    )

    executed_at = datetime.utcnow()

    logger.warning(
        f"=== TENANT PURGE COMPLETED === Tenant: {tenant_id}, Records: {sum(purged_tables.values())}, Admin: {admin.user_id}"
    )

    return PurgeTenantResponse(
        tenant_id=str(tenant_id),
        purged_tables=purged_tables,
        reason=data.reason,
        executed_by=str(admin.user_id),
        executed_at=executed_at,
    )
