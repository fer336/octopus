"""
Router de Autenticación.
Endpoints para login con Google OAuth y gestión de sesiones JWT.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth_service import AuthService
from app.utils.security import get_current_user
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["Autenticación"])


class GoogleLoginRequest(BaseModel):
    """Request para login con Google."""

    token: str  # ID Token de Google


class RefreshTokenRequest(BaseModel):
    """Request para refrescar el access token."""

    refresh_token: str


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


@router.get("/google/login")
async def google_login():
    """
    Inicia el flujo de autenticación con Google OAuth 2.0.
    Redirige al usuario a la página de autorización de Google.
    """
    from urllib.parse import urlencode

    # Parámetros para el authorization endpoint de Google
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
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
    import logging

    logger = logging.getLogger("uvicorn")

    # Leer el code directamente de los query params para evitar
    # que FastAPI haga un 307 si el param "code" no está declarado como requerido
    code = request.query_params.get("code")

    logger.info(f"[OAuth] Callback recibido — URL: {request.url}")
    logger.info(f"[OAuth] Code presente: {bool(code)}")

    if not code:
        frontend_url = settings.FRONTEND_URL
        return RedirectResponse(
            url=f"{frontend_url}/login?error=no_code",
            status_code=303,
        )

    service = AuthService(db)
    result = await service.login_with_google_code(code)

    if not result:
        logger.error("[OAuth] login_with_google_code retornó None")
        frontend_url = settings.FRONTEND_URL
        return RedirectResponse(
            url=f"{frontend_url}/login?error=auth_failed",
            status_code=303,
        )

    # Usar 303 See Other en vez de 307 para evitar que el browser
    # re-envíe el mismo request (con el mismo code) al seguir el redirect
    frontend_url = settings.FRONTEND_URL
    access_token = result["access_token"]
    refresh_token = result["refresh_token"]

    redirect_url = f"{frontend_url}/auth/callback?access_token={access_token}&refresh_token={refresh_token}"
    logger.info(f"[OAuth] Redirigiendo a frontend: {frontend_url}/auth/callback")
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
):
    """
    Retorna información del usuario autenticado.
    Requiere un access token válido.
    """
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
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
        description="Email para login de desarrollo. Si no se envía, usa el primer usuario activo.",
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

    if email:
        query = (
            select(User).where(User.email == email, User.is_active.is_(True)).limit(1)
        )
        result = await db.execute(query)
        user = result.scalar_one_or_none()

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
        # Obtener el primer usuario activo
        query = select(User).where(User.is_active.is_(True)).limit(1)
        result = await db.execute(query)
        user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay usuarios en la base de datos",
        )

    from app.utils.security import create_access_token, create_refresh_token

    access_token = create_access_token(user.id, user.email)
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
        },
    }
