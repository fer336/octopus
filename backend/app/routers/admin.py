"""
Router para el CMS superadmin — gestión de tenants, secretos ARCA y branding.
Todos los endpoints están protegidos con require_superadmin().
"""

import logging
from datetime import datetime
from uuid import UUID
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.business import Business
from app.models.user import User
from app.models.tenant_secret import TenantSecret
from app.models.audit_log import AuditLog
from app.middleware.tenant_resolver import require_superadmin, AdminContext
from app.services.afip_sdk_service import AfipSdkService
from app.utils.crypto import encrypt_api_key, get_last4

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
    "mrbot_email",
    "mrbot_api_key",
    "afipsdk_access_token",
    "afip_cert",
    "afip_key",
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
    mrbot_email: Optional[str] = None
    mrbot_api_key: Optional[str] = None
    afipsdk_access_token: Optional[str] = None
    afip_cert: Optional[str] = None
    afip_key: Optional[str] = None


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


class TenantResponse(BaseModel):
    """Resumen de un tenant para el listado."""

    id: str
    name: str
    cuit: str
    tax_condition: str
    owner_email: str
    created_at: datetime


class TenantListResponse(BaseModel):
    """Respuesta paginada de tenants."""

    tenants: list[TenantResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


# ============================================================================
# Helpers
# ============================================================================


async def log_audit(
    db: AsyncSession,
    user_id: UUID,
    business_id: UUID,
    action: str,
    resource_type: str,
    resource_id: Optional[UUID] = None,
    details: Optional[dict] = None,
):
    """Crea una entrada de auditoría."""
    log = AuditLog(
        user_id=user_id,
        business_id=business_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details or {},
    )
    db.add(log)
    await db.commit()


async def get_business_or_404(tenant_id: UUID, db: AsyncSession) -> Business:
    """Obtiene un business por ID o lanza 404."""
    result = await db.execute(select(Business).where(Business.id == tenant_id))
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
    base_query = select(Business).join(User, Business.owner_id == User.id)

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
        TenantResponse(
            id=str(b.id),
            name=b.name,
            cuit=b.cuit,
            tax_condition=b.tax_condition,
            owner_email=b.owner.email if b.owner else "",
            created_at=b.created_at,
        )
        for b in businesses
    ]

    return TenantListResponse(
        tenants=tenants,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


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
        user_id=admin.platform_role,
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
