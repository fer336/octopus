"""
Configuración de la aplicación usando Pydantic Settings.
Lee variables de entorno desde .env
"""
from functools import lru_cache
from typing import Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración principal de la aplicación."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Aplicación
    APP_NAME: str = "OctopusTrack"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # Base de datos
    DATABASE_URL: str = "postgresql+asyncpg://octopustrack:password@localhost:5432/octopustrack"

    # JWT
    JWT_SECRET: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"

    # CORS
    CORS_ORIGINS: Union[list[str], str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8000"]

    # Frontend URLs
    FRONTEND_URL: str = "http://localhost:5173"

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
                    return json.loads(f'[{v_json}]')
                except json.JSONDecodeError:
                    pass
            
            # Dividir por comas y limpiar
            return [origin.strip().strip('"').strip("'") for origin in v.split(",") if origin.strip()]
        return v


@lru_cache()
def get_settings() -> Settings:
    """Obtiene la instancia de configuración (cacheada)."""
    return Settings()
