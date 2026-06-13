"""
Configuración de la aplicación usando Pydantic Settings.
Lee variables de entorno desde .env
"""


import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ENV_FILE = os.getenv("BACKEND_ENV_FILE")
ENV_FILES = tuple(
    env_file
    for env_file in (".env", "backend/.env", BACKEND_ENV_FILE)
    if env_file
)


class Settings(BaseSettings):
    """Configuración principal de la aplicación."""

    model_config = SettingsConfigDict(
        env_file=ENV_FILES,  # raíz, backend/ y BACKEND_ENV_FILE con mayor prioridad
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
    CORS_ORIGINS: list[str] | str = [
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

    # Engram — memoria semántica de Luci (PostgreSQL sigue siendo fuente de verdad)
    ENGRAM_ENABLED: bool = False
    ENGRAM_BASE_URL: str = "http://127.0.0.1:7437"
    ENGRAM_PROJECT: str = "octopus"
    ENGRAM_TIMEOUT_SECONDS: float = 2.0
    ENGRAM_SESSION_ID_PREFIX: str = "octopustrack-luci"

    # Cifrado simétrico de API keys en base de datos
    # Generá la tuya con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    APP_ENCRYPTION_KEY: str = ""

    # Seguridad webhook billing (n8n -> backend)
    BILLING_WEBHOOK_SECRET: str = ""

    # Evolution API / WhatsApp (server-side only)
    AUTHENTICATION_API_KEY: str = ""
    EVOLUTION_API_BASE_URL: str = "https://evo.qeva.xyz"

    # n8n webhook para auditoría de logins (Google OAuth)
    N8N_LOGIN_AUDIT_WEBHOOK_URL: str = ""

    # MinIO / S3 compatible (logos branding y snapshots privados de acopio)
    MINIO_ENDPOINT: str = ""
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET_NAME: str = "logos"
    MINIO_SECURE: bool = True
    MINIO_REGION: str = "us-east-1"
    MINIO_PUBLIC_BASE_URL: str = ""
    MINIO_STOCKPILE_SNAPSHOT_BUCKET_NAME: str = "stockpile-snapshots"
    STOCKPILE_SNAPSHOT_PRESIGNED_URL_EXPIRE_SECONDS: int = 1800
    # Configurar lifecycle del bucket privado en MinIO para borrar snapshots en <=24h.

    # Mercado Libre
    MELI_CLIENT_ID: str = ""
    MELI_CLIENT_SECRET: str = ""
    MELI_REDIRECT_URI: str = "http://localhost:8000/api/v1/meli/oauth/callback"
    MELI_SITE_ID: str = "MLA"
    MELI_API_BASE: str = "https://api.mercadolibre.com"
    MELI_AUTH_BASE: str = "https://auth.mercadolibre.com.ar"
    # Generar con: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    MELI_TOKEN_ENCRYPTION_KEY: str = ""
    MELI_WEBHOOK_SECRET: str = ""

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
