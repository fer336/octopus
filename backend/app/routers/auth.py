"""
Router de Autenticación.
Endpoints para login con Google OAuth y gestión de sesiones JWT.
"""

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.audit_log import AuditLog
from app.services.auth_service import AuthService
from app.models.tenant_membership import TenantMembership
from app.utils.security import get_current_user
from app.config import get_settings
from app.utils.acl import parse_module_permissions

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["Autenticación"])

logger = logging.getLogger("uvicorn")


async def _log_audit(
    db: AsyncSession,
    user_id,
    business_id=None,
    action: str = "login",
    resource_type: str = "user",
    resource_id=None,
    details: dict | None = None,
):
    """Log audit entry — separate commit so it never breaks the main operation."""
    try:
        audit_log = AuditLog(
            user_id=user_id,
            business_id=business_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        )
        db.add(audit_log)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
        await db.rollback()


class GoogleLoginRequest(BaseModel):
    """Request para login con Google."""

    token: str  # ID Token de Google


class RefreshTokenRequest(BaseModel):
    """Request para refrescar el access token."""

    refresh_token: str


class CredentialsLoginRequest(BaseModel):
    """Request para login con usuario y contraseña."""

    email: str
    password: str


class TokenResponse(BaseModel):
    """Response con tokens de autenticación."""

    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    user: dict | None = None


class UserResponse(BaseModel):
    """Response con datos del usuario."""

    id: str
    email: str
    name: str
    picture: str | None
    platform_role: str
    membership_role: str | None = None
    module_permissions: dict[str, bool] = Field(default_factory=dict)


def _build_oauth_state(next_target: str) -> str:
    """Construye un state firmado para OAuth y evita tampering."""
    payload = {
        "next": next_target,
        "type": "oauth_state",
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=10),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _resolve_next_target(state_value: str | None) -> str:
    """Resuelve next target desde state firmado. Fallback seguro a tenant."""
    if not state_value:
        return "tenant"

    try:
        payload = jwt.decode(
            state_value,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        return "tenant"

    if payload.get("type") != "oauth_state":
        return "tenant"

    next_target = payload.get("next")
    if next_target not in {"tenant", "admin"}:
        return "tenant"

    return next_target


@router.get("/google/login")
async def google_login(
    request: Request,
    next_target: str = Query("tenant", pattern="^(tenant|admin)$", alias="next"),
):
    """
    Inicia el flujo de autenticación con Google OAuth 2.0.
    Redirige al usuario a la página de autorización de Google.
    """
    from urllib.parse import urlencode

    # Compatibilidad backward: si no llega "next", aceptar "next_target" legacy.
    if "next" not in request.query_params:
        legacy_next_target = request.query_params.get("next_target")
        if legacy_next_target in {"tenant", "admin"}:
            next_target = legacy_next_target

    # Parámetros para el authorization endpoint de Google
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
        "state": _build_oauth_state(next_target),
    }

    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Callback de Google OAuth 2.0.
    Recibe el código de autorización, lo intercambia por tokens
    y crea/actualiza el usuario en la base de datos.
    """
    # Leer el code directamente de los query params para evitar
    # que FastAPI haga un 307 si el param "code" no está declarado como requerido
    code = request.query_params.get("code")
    next_target = _resolve_next_target(request.query_params.get("state"))

    logger.info(f"[OAuth] Callback recibido — URL: {request.url}")
    logger.info(f"[OAuth] Code presente: {bool(code)}")

    if not code:
        frontend_url = (
            settings.FRONTEND_ADMIN_URL
            if next_target == "admin"
            else settings.FRONTEND_URL
        )
        login_path = (
            "/admin.html#/login" if next_target == "admin" else "/tenant.html#/login"
        )
        return RedirectResponse(
            url=f"{frontend_url}{login_path}?error=no_code",
            status_code=303,
        )

    service = AuthService(db)
    result = await service.login_with_google_code(code)

    if not result:
        logger.error("[OAuth] login_with_google_code retornó None")
        frontend_url = (
            settings.FRONTEND_ADMIN_URL
            if next_target == "admin"
            else settings.FRONTEND_URL
        )
        login_path = (
            "/admin.html#/login" if next_target == "admin" else "/tenant.html#/login"
        )
        return RedirectResponse(
            url=f"{frontend_url}{login_path}?error=auth_failed",
            status_code=303,
        )

    # Usar 303 See Other en vez de 307 para evitar que el browser
    # re-envíe el mismo request (con el mismo code) al seguir el redirect
    frontend_url = (
        settings.FRONTEND_ADMIN_URL if next_target == "admin" else settings.FRONTEND_URL
    )
    callback_path = (
        "/admin.html#/auth/callback"
        if next_target == "admin"
        else "/tenant.html#/auth/callback"
    )
    access_token = result["access_token"]
    refresh_token = result["refresh_token"]

    # Log audit for successful login
    user_id = result.get("user", {}).get("id") if result.get("user") else None
    if user_id:
        await _log_audit(
            db=db,
            user_id=user_id,
            action="login",
            resource_type="user",
            resource_id=user_id,
            details={
                "description": "Login exitoso con Google OAuth",
                "method": "google_oauth",
            },
        )

    redirect_url = f"{frontend_url}{callback_path}?access_token={access_token}&refresh_token={refresh_token}"
    logger.info(f"[OAuth] Redirigiendo a frontend: {frontend_url}{callback_path}")
    return RedirectResponse(url=redirect_url, status_code=303)


@router.post("/google", response_model=TokenResponse)
async def login_with_google(
    request: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Login con Google OAuth 2.0.
    Recibe el ID Token de Google y retorna JWT de acceso.
    Si el usuario no existe, lo crea automáticamente.
    """
    service = AuthService(db)
    result = await service.login_with_google(request.token)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de Google inválido",
        )

    # Log audit for successful login
    user_id = result.get("user", {}).get("id") if result.get("user") else None
    if user_id:
        await _log_audit(
            db=db,
            user_id=user_id,
            action="login",
            resource_type="user",
            resource_id=user_id,
            details={
                "description": "Login exitoso con Google OAuth (POST)",
                "method": "google_oauth_post",
            },
        )

    return result


@router.post("/login", response_model=TokenResponse)
async def login_with_credentials(
    request: CredentialsLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login con usuario y contraseña (credenciales locales)."""
    service = AuthService(db)
    result = await service.login_with_password(request.email, request.password)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña inválidos",
        )

    user_id = result.get("user", {}).get("id") if result.get("user") else None
    if user_id:
        await _log_audit(
            db=db,
            user_id=user_id,
            action="login",
            resource_type="user",
            resource_id=user_id,
            details={
                "description": "Login exitoso con usuario y contraseña",
                "method": "credentials",
            },
        )

    return result


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Renueva el access token usando el refresh token.
    El refresh token debe ser válido y no expirado.
    """
    service = AuthService(db)
    result = await service.refresh_access_token(request.refresh_token)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido o expirado",
        )

    return result


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retorna información del usuario autenticado.
    Requiere un access token válido.
    """
    membership_role = None
    module_permissions: dict[str, bool] = {}

    memberships_result = await db.execute(
        select(TenantMembership).where(TenantMembership.user_id == current_user.id)
    )
    memberships = list(memberships_result.scalars().all())
    if memberships:
        role_priority = {"owner": 3, "manager": 2, "seller": 1}
        selected_membership = max(
            memberships,
            key=lambda membership: role_priority.get(membership.role, 0),
        )
        membership_role = selected_membership.role
        module_permissions = parse_module_permissions(
            selected_membership.module_permissions,
            selected_membership.role,
        )

    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
        platform_role=current_user.platform_role,
        membership_role=membership_role,
        module_permissions=module_permissions,
    )


@router.post("/logout")
async def logout():
    """
    Cierra la sesión del usuario.
    En JWT stateless esto es manejado por el frontend
    descartando los tokens almacenados.
    """
    return {"message": "Sesión cerrada correctamente", "success": True}


@router.post("/dev-login", response_model=TokenResponse)
async def dev_login(
    email: str | None = Query(
        None,
        description="Usuario para login de desarrollo.",
    ),
    password: str | None = Query(
        None,
        description="Contraseña del acceso de desarrollo.",
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Login de desarrollo para testing E2E.
    Solo disponible cuando DEBUG=True.
    Obtiene el primer usuario activo de la base de datos y genera tokens JWT.
    """
    if not settings.DEBUG:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint no disponible en producción",
        )

    from sqlalchemy import select
    from app.models.user import User

    user = None
    use_demo_credentials = bool(email and password)

    async def get_first_active_user():
        query = select(User).where(User.is_active.is_(True)).limit(1)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_active_user_by_email(user_email: str):
        query = (
            select(User)
            .where(User.email == user_email, User.is_active.is_(True))
            .limit(1)
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    if use_demo_credentials:
        if not settings.DEV_LOGIN_EMAIL or not settings.DEV_LOGIN_PASSWORD:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Credenciales de desarrollo no configuradas en el servidor",
            )

        if email != settings.DEV_LOGIN_EMAIL or password != settings.DEV_LOGIN_PASSWORD:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciales inválidas",
            )

        if settings.DEV_LOGIN_TARGET_EMAIL:
            user = await get_active_user_by_email(settings.DEV_LOGIN_TARGET_EMAIL)
        else:
            user = await get_first_active_user()

        if not user:
            user = User(
                email=email,
                name=email.split("@")[0] if email else "Usuario",
                picture="",
                google_id=f"dev-{email}",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            from app.models.business import Business

            business = Business(
                owner_id=user.id,
                name="Mi Negocio",
                cuit="00-00000000-0",
                tax_condition="Monotributista",
            )
            db.add(business)
            await db.commit()
    elif email:
        user = await get_active_user_by_email(email)

        # Si no existe, crear usuario dev automáticamente
        if not user:
            user = User(
                email=email,
                name=email.split("@")[0],
                picture="",
                google_id=f"dev-{email}",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

            from app.models.business import Business

            business = Business(
                owner_id=user.id,
                name="Mi Negocio",
                cuit="00-00000000-0",
                tax_condition="Monotributista",
            )
            db.add(business)
            await db.commit()
    else:
        user = await get_first_active_user()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay usuarios en la base de datos",
        )

    from app.utils.security import create_access_token, create_refresh_token
    from uuid import UUID as PyUUID

    user_id = PyUUID(str(user.id))
    user_email = str(user.email)
    user_name = str(user.name)
    user_picture = str(user.picture or "")
    user_platform_role = str(user.platform_role)

    access_token = create_access_token(user_id, user_email, user_platform_role)
    refresh_token = create_refresh_token(user_id)

    # Log audit for dev login
    await _log_audit(
        db=db,
        user_id=user.id,
        action="login",
        resource_type="user",
        resource_id=user.id,
        details={
            "description": "Login de desarrollo (dev-login)",
            "method": "dev_login",
        },
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user_id),
            "email": user_email,
            "name": user_name,
            "picture": user_picture,
        },
    }
