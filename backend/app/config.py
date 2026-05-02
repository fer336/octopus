"""
Configuración de la aplicación usando Pydantic Settings.
Lee variables de entorno desde .env
"""

from typing import Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración principal de la aplicación."""

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),  # busca en raíz del repo Y en backend/
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Aplicación
    APP_NAME: str = "OctopusTrack"
    DEBUG: bool = False
    API_TENANT_PREFIX: str = "/api/tenant"

    # Base de datos
    DATABASE_URL: str = (
        "postgresql+asyncpg://octopustrack:password@localhost:5432/octopustrack"
    )

    # JWT
    JWT_SECRET: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"

    # CORS — incluye los puertos de Vite más comunes para desarrollo local
    CORS_ORIGINS: Union[list[str], str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "http://localhost:8000",
    ]

    # Frontend URLs
    FRONTEND_URL: str = "http://localhost:5173"
    FRONTEND_ADMIN_URL: str = "http://localhost:5174"

    # Login de desarrollo (configurar en .env)
    DEV_LOGIN_EMAIL: str = ""
    DEV_LOGIN_PASSWORD: str = ""
    DEV_LOGIN_TARGET_EMAIL: str = ""

    # OpenAI — Fallback de desarrollo (las keys reales se guardan por negocio en DB)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_WHISPER_MODEL: str = "whisper-1"

    # Cifrado simétrico de API keys en base de datos
    # Generá la tuya con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    APP_ENCRYPTION_KEY: str = ""

    # Seguridad webhook billing (n8n -> backend)
    BILLING_WEBHOOK_SECRET: str = ""

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from comma-separated string or JSON, or return as-is if already a list."""
        if isinstance(v, str):
            # Limpiar corchetes si están presentes (error común en .env)
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                v = v[1:-1]  # Remover corchetes externos

            # Intentar parsear como JSON si tiene formato JSON interno
            if '"' in v or "'" in v:
                import json

                try:
                    # Reemplazar comillas simples por dobles para JSON válido
                    v_json = v.replace("'", '"')
                    return json.loads(f"[{v_json}]")
                except json.JSONDecodeError:
                    pass

            # Dividir por comas y limpiar
            return [
                origin.strip().strip('"').strip("'")
                for origin in v.split(",")
                if origin.strip()
            ]
        return v


def get_settings() -> Settings:
    """Obtiene la instancia de configuración leyendo el .env."""
    return Settings()
