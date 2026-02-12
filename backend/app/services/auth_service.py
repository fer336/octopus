"""
Servicio de Autenticación.
Maneja el login con Google OAuth y la gestión de tokens JWT.
"""
from typing import Optional
import httpx

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.business import Business
from app.models.user import User
from app.utils.security import create_access_token, create_refresh_token, verify_token

settings = get_settings()


class AuthService:
    """Servicio para autenticación con Google OAuth."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def verify_google_token(self, token: str) -> Optional[dict]:
        """
        Verifica el ID token de Google.
        Retorna los datos del usuario si es válido.
        """
        try:
            # Verificar el token con Google
            idinfo = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                settings.GOOGLE_CLIENT_ID,
            )

            # Verificar que el token es para nuestra app
            if idinfo["aud"] != settings.GOOGLE_CLIENT_ID:
                return None

            return {
                "google_id": idinfo["sub"],
                "email": idinfo["email"],
                "name": idinfo.get("name", idinfo["email"].split("@")[0]),
                "picture": idinfo.get("picture", ""),
            }
        except ValueError:
            # Token inválido
            return None

    async def get_user_by_google_id(self, google_id: str) -> Optional[User]:
        """Busca un usuario por su Google ID."""
        query = select(User).where(User.google_id == google_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_or_create_user(self, google_data: dict) -> User:
        """
        Obtiene o crea un usuario basado en datos de Google.
        Si es nuevo, también crea un negocio por defecto.
        """
        # Buscar usuario existente
        user = await self.get_user_by_google_id(google_data["google_id"])

        if user:
            # Actualizar datos por si cambiaron en Google
            user.name = google_data["name"]
            user.picture = google_data["picture"]
            await self.db.commit()
        else:
            # Crear nuevo usuario
            user = User(
                email=google_data["email"],
                name=google_data["name"],
                picture=google_data["picture"],
                google_id=google_data["google_id"],
            )
            self.db.add(user)
            await self.db.commit()
            await self.db.refresh(user)

            # Crear negocio por defecto para el nuevo usuario
            business = Business(
                owner_id=user.id,
                name="Mi Negocio",
                cuit="00-00000000-0",
                tax_condition="Monotributista",
            )
            self.db.add(business)
            await self.db.commit()

        return user

    async def exchange_code_for_token(self, code: str) -> Optional[dict]:
        """
        Intercambia el código de autorización por tokens de Google.
        Retorna el access token y la información del usuario.
        """
        try:
            async with httpx.AsyncClient() as client:
                # Intercambiar código por tokens
                token_response = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": code,
                        "client_id": settings.GOOGLE_CLIENT_ID,
                        "client_secret": settings.GOOGLE_CLIENT_SECRET,
                        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                        "grant_type": "authorization_code",
                    },
                )

                if token_response.status_code != 200:
                    return None

                token_data = token_response.json()
                id_token_str = token_data.get("id_token")

                if not id_token_str:
                    return None

                # Verificar y decodificar el ID token
                idinfo = id_token.verify_oauth2_token(
                    id_token_str,
                    google_requests.Request(),
                    settings.GOOGLE_CLIENT_ID,
                )

                return {
                    "google_id": idinfo["sub"],
                    "email": idinfo["email"],
                    "name": idinfo.get("name", idinfo["email"].split("@")[0]),
                    "picture": idinfo.get("picture", ""),
                }
        except Exception as e:
            print(f"Error exchanging code for token: {e}")
            return None

    async def login_with_google_code(self, code: str) -> Optional[dict]:
        """
        Procesa el login con Google usando el código de autorización.
        """
        # Intercambiar código por información del usuario
        google_data = await self.exchange_code_for_token(code)
        if not google_data:
            return None

        # Obtener o crear usuario
        user = await self.get_or_create_user(google_data)

        # Generar tokens
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

    async def login_with_google(self, google_token: str) -> Optional[dict]:
        """
        Procesa el login con Google y retorna los tokens JWT.
        """
        # Verificar token de Google
        google_data = await self.verify_google_token(google_token)
        if not google_data:
            return None

        # Obtener o crear usuario
        user = await self.get_or_create_user(google_data)

        # Generar tokens
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

    async def refresh_access_token(self, refresh_token: str) -> Optional[dict]:
        """
        Genera un nuevo access token usando el refresh token.
        """
        try:
            payload = verify_token(refresh_token)

            # Verificar que es un refresh token
            if payload.get("type") != "refresh":
                return None

            user_id = payload.get("sub")
            if not user_id:
                return None

            # Buscar usuario
            query = select(User).where(User.id == user_id)
            result = await self.db.execute(query)
            user = result.scalar_one_or_none()

            if not user or not user.is_active:
                return None

            # Generar nuevo access token
            new_access_token = create_access_token(user.id, user.email)

            return {
                "access_token": new_access_token,
                "refresh_token": None,  # No rotamos el refresh token
                "token_type": "bearer",
            }
        except Exception:
            return None
