"""
Utilidades de seguridad: JWT, autenticación y dependencies.
"""

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.utils.acl import parse_module_permissions

settings = get_settings()
security = HTTPBearer(auto_error=False)

PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 390000


async def ensure_business_subscription_active(db: AsyncSession, business) -> None:
    """Valida que el comercio tenga suscripción activa; bloquea si venció o está suspendido."""
    status_value = (business.subscription_status or "active").lower()

    if status_value == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=business.subscription_blocked_reason
            or "El comercio está bloqueado por falta de pago. Contactá al administrador.",
        )

    if status_value == "expired":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=business.subscription_blocked_reason
            or "El comercio está vencido por falta de pago. Contactá al administrador.",
        )

    if business.subscription_ends_at and datetime.utcnow() > business.subscription_ends_at:
        business.subscription_status = "expired"
        business.subscription_blocked_reason = "Pago mensual vencido"
        try:
            await db.commit()
        except Exception:
            await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El comercio está vencido por falta de pago. Contactá al administrador.",
        )


def create_access_token(
    user_id: UUID, email: str, platform_role: str = "tenant_user"
) -> str:
    """Crea un JWT de acceso con expiración de 30 minutos."""
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "platform_role": platform_role,
        "type": "access",
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: UUID) -> str:
    """Crea un JWT de refresh con expiración de 7 días."""
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str) -> dict:
    """Verifica y decodifica un token JWT."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def hash_password(password: str) -> str:
    """Hashea contraseña usando PBKDF2-HMAC-SHA256 con salt aleatorio."""
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    salt_b64 = base64.urlsafe_b64encode(salt).decode("utf-8")
    hash_b64 = base64.urlsafe_b64encode(derived).decode("utf-8")
    return f"{PASSWORD_SCHEME}${PASSWORD_ITERATIONS}${salt_b64}${hash_b64}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    """Verifica contraseña contra hash PBKDF2 almacenado."""
    if not stored_hash:
        return False

    try:
        scheme, iterations_str, salt_b64, hash_b64 = stored_hash.split("$", 3)
        if scheme != PASSWORD_SCHEME:
            return False

        iterations = int(iterations_str)
        salt = base64.urlsafe_b64decode(salt_b64.encode("utf-8"))
        expected = base64.urlsafe_b64decode(hash_b64.encode("utf-8"))

        candidate = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
        )
        return hmac.compare_digest(candidate, expected)
    except Exception:
        return False


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    """
    Dependency para obtener el usuario actual desde el token JWT.
    Retorna el objeto User o lanza 401.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales no proporcionadas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_token(credentials.credentials)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de token inválido",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
        )

    # Importación tardía para evitar ciclos
    from app.models.user import User

    query = select(User).where(User.id == UUID(user_id))
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )

    # Actualizar platform_role desde la DB (siempre usar el actual, no el del token)
    # Esto permite cambios de rol sin necesidad de re-login
    return user


async def get_current_business(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> UUID:
    """
    Dependency para obtener el business_id del usuario actual.
    Por ahora retorna el primer negocio del usuario.
    """
    import logging

    logger = logging.getLogger("uvicorn")

    try:
        from app.models.business import Business
        from app.models.tenant_membership import TenantMembership

        current_user_id = UUID(str(current_user.id))
        logger.info(f"Getting business for user {current_user_id}")

        # Prioridad: membresía explícita de tenant (multitenancy)
        memberships = []
        memberships_query = select(TenantMembership).where(
            TenantMembership.user_id == current_user_id,
        )

        try:
            memberships_result = await db.execute(memberships_query)
            memberships = memberships_result.scalars().all()
        except ProgrammingError as e:
            error_text = str(getattr(e, "orig", e)).lower()
            if "tenant_memberships" in error_text and (
                "does not exist" in error_text or "no such table" in error_text
            ):
                logger.warning(
                    "tenant_memberships no existe en DB; usando fallback legacy owner_id"
                )
                await db.rollback()
                memberships = []
            else:
                raise

        if memberships:
            role_priority = {"owner": 3, "manager": 2, "seller": 1}
            ordered_memberships = sorted(
                memberships,
                key=lambda membership: role_priority.get(membership.role, 0),
                reverse=True,
            )

            first_blocked_detail = None

            for membership in ordered_memberships:
                business = await db.get(Business, membership.business_id)
                if not business or business.deleted_at is not None:
                    first_blocked_detail = "Negocio no encontrado"
                    continue

                # La membresía define pertenencia/rol. El bloqueo por pago vive en el comercio.
                await ensure_business_subscription_active(db, business)
                return UUID(str(membership.business_id))

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=first_blocked_detail
                or "No tenés acceso activo a ningún negocio. Contactá al administrador.",
            )

        # Fallback legacy: owner_id en Business (compatibilidad)
        query = select(Business).where(
            Business.owner_id == current_user_id,
            Business.deleted_at.is_(None),
        )
        result = await db.execute(query)
        business = result.scalar_one_or_none()

        if not business:
            logger.error(f"No business access for user {current_user_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tenés acceso a ningún negocio. Contactá al administrador.",
            )

        business_id = business.id
        await ensure_business_subscription_active(db, business)
        logger.info(f"Business found: {business_id}, type: {type(business_id)}")

        # SIEMPRE convertir a Python UUID para evitar problemas con asyncpg
        from uuid import UUID as PyUUID

        business_id = PyUUID(str(business_id))

        logger.info(f"Converted business_id: {business_id}, type: {type(business_id)}")
        return business_id
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_current_business: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error obteniendo negocio: {str(e)}",
        )


async def get_current_business_with_ai_enabled(
    current_business: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> UUID:
    """
    Dependency que exige feature flag del Agente IA activa para el tenant actual.
    """
    from app.models.business import Business

    result = await db.execute(
        select(Business).where(
            Business.id == current_business,
            Business.deleted_at.is_(None),
        )
    )
    business = result.scalar_one_or_none()

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Negocio no encontrado",
        )

    if not business.ai_agent_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El Agente IA no está habilitado para este tenant",
        )

    return UUID(str(business.id))


def require_module_access(module_key: str):
    """
    Dependency factory para enforcement ACL por módulo.
    Valida permisos en backend (no solo ocultar UI).
    """

    async def _dependency(
        db: AsyncSession = Depends(get_db),
        current_user=Depends(get_current_user),
        current_business: UUID = Depends(get_current_business),
    ) -> UUID:
        # Superadmin siempre tiene acceso total
        if getattr(current_user, "platform_role", None) == "superadmin":
            return current_business

        from app.models.tenant_membership import TenantMembership

        result = await db.execute(
            select(TenantMembership).where(
                TenantMembership.user_id == current_user.id,
                TenantMembership.business_id == current_business,
                TenantMembership.deleted_at.is_(None),
            )
        )
        membership = result.scalar_one_or_none()

        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tenés membresía activa para este negocio.",
            )

        module_permissions = parse_module_permissions(
            membership.module_permissions,
            membership.role,
        )

        if not module_permissions.get(module_key, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No tenés permiso para acceder al módulo '{module_key}'.",
            )

        feature_by_module = {
            "products": "inventory_enabled",
            "categories": "inventory_enabled",
            "suppliers": "inventory_enabled",
            "reports": "reports_enabled",
            "price_update": "price_update_enabled",
            "sql_backup": "sql_backup_enabled",
            "inventory": "inventory_enabled",
        }
        feature_field = feature_by_module.get(module_key)
        if feature_field:
            from app.models.business import Business

            business_result = await db.execute(
                select(Business).where(
                    Business.id == current_business,
                    Business.deleted_at.is_(None),
                )
            )
            business = business_result.scalar_one_or_none()
            if not business:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Negocio no encontrado",
                )

            if not bool(getattr(business, feature_field, True)):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Funcionalidad deshabilitada para este tenant desde CMS.",
                )

        return current_business

    return _dependency


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    """
    Dependency que retorna el usuario si hay token, None si no.
    Útil para endpoints que funcionan con o sin autenticación.
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None
