"""
Utilidades de seguridad: JWT, autenticación y dependencies.
"""
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db

settings = get_settings()
security = HTTPBearer(auto_error=False)


def create_access_token(user_id: UUID, email: str) -> str:
    """Crea un JWT de acceso con expiración de 30 minutos."""
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
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


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
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

        logger.info(f"Getting business for user {current_user.id}")

        query = select(Business).where(
            Business.owner_id == current_user.id,
            Business.deleted_at.is_(None),
        )
        result = await db.execute(query)
        business = result.scalar_one_or_none()

        if not business:
            logger.error(f"No business found for user {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usuario sin negocio configurado",
            )

        business_id = business.id
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
            detail=f"Error obteniendo negocio: {str(e)}"
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
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
