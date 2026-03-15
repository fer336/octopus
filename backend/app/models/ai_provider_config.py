"""
Modelo de configuración de proveedores IA por negocio.
Cada negocio puede configurar múltiples proveedores (OpenAI, Gemini, etc.),
pero solo uno estará activo (is_active=True) a la vez.
"""

import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class AIProvider(str, enum.Enum):
    """Proveedores de IA soportados."""

    OPENAI = "openai"
    GEMINI = "gemini"
    OPENROUTER = "openrouter"
    ANTHROPIC = "anthropic"


class AIProviderConfig(BaseModel):
    """
    Configuración de un proveedor IA para un negocio.

    Restricción: un solo registro por (business_id, provider).
    Solo un proveedor puede estar activo (is_active=True) a la vez;
    esa invariante se mantiene en la capa de servicio.
    """

    __tablename__ = "ai_provider_configs"
    __table_args__ = (
        UniqueConstraint("business_id", "provider", name="uq_ai_provider_business"),
    )

    # --- Relación con el negocio ---
    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # --- Proveedor e identificación ---
    provider = Column(String(50), nullable=False)  # Valor del enum AIProvider
    display_name = Column(String(100), nullable=True)  # Ej: "Mi cuenta OpenAI"

    # --- Credenciales (nunca se devuelven al frontend en claro) ---
    api_key_encrypted = Column(Text, nullable=True)  # Cifrado con APP_ENCRYPTION_KEY
    api_key_last4 = Column(
        String(4), nullable=True
    )  # Solo para mostrar en UI: "...sk4F"
    base_url = Column(String(500), nullable=True)  # Para OpenRouter u endpoints custom

    # --- Modelo por defecto ---
    default_model = Column(
        String(100), nullable=True
    )  # Ej: "gpt-4o", "gemini-2.5-flash"

    # --- Estado y validación ---
    is_active = Column(
        Boolean, default=False, nullable=False
    )  # Proveedor actualmente seleccionado
    is_valid = Column(
        Boolean, default=False, nullable=False
    )  # Última validación exitosa
    validated_at = Column(DateTime, nullable=True)  # Timestamp de última validación
    validation_error = Column(Text, nullable=True)  # Mensaje del último error

    # --- Relación ---
    business = relationship("Business", back_populates="ai_provider_configs")

    def __repr__(self) -> str:
        return f"<AIProviderConfig {self.provider} business={self.business_id} active={self.is_active}>"
