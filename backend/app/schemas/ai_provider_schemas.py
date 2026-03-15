"""
Schemas Pydantic para configuración de proveedores IA.
NUNCA se expone api_key_encrypted en las respuestas al frontend;
solo se devuelve api_key_last4 para indicar que hay una key configurada.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.ai_provider_config import AIProvider


# ─────────────────────────────────────────────────────────────
# Requests
# ─────────────────────────────────────────────────────────────


class AIProviderUpsertRequest(BaseModel):
    """
    Crea o actualiza la configuración de un proveedor IA.
    La api_key solo se envía cuando el usuario quiere cambiarla;
    si se omite, se mantiene la key ya guardada.
    """

    api_key: Optional[str] = Field(
        default=None,
        min_length=1,
        description="API key en texto plano — se cifra antes de guardar. Omitir para no cambiarla.",
    )
    default_model: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Modelo por defecto. Ej: gpt-4o, gemini-2.5-flash, claude-3-5-sonnet-20241022",
    )
    base_url: Optional[str] = Field(
        default=None,
        max_length=500,
        description="URL base personalizada. Requerida para OpenRouter.",
    )
    display_name: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Nombre descriptivo. Ej: 'Cuenta principal OpenAI'",
    )


class AIProviderActivateRequest(BaseModel):
    """Activa un proveedor como el actualmente seleccionado."""

    provider: AIProvider = Field(..., description="Proveedor a activar")


# ─────────────────────────────────────────────────────────────
# Responses
# ─────────────────────────────────────────────────────────────


class AIProviderConfigResponse(BaseModel):
    """
    Respuesta de la configuración de un proveedor.
    La api_key_encrypted NUNCA aparece aquí.
    """

    id: str
    provider: str
    display_name: Optional[str]
    api_key_last4: Optional[str]  # Ej: "...sk4F"
    api_key_configured: bool  # True si hay una key guardada
    default_model: Optional[str]
    base_url: Optional[str]
    is_active: bool
    is_valid: bool
    validated_at: Optional[datetime]
    validation_error: Optional[str]

    class Config:
        from_attributes = True


class AIConfigSummaryResponse(BaseModel):
    """Resumen de todos los proveedores configurados para el negocio."""

    providers: list[AIProviderConfigResponse]
    active_provider: Optional[str]  # Nombre del proveedor activo, o None
    active_model: Optional[str]  # Modelo activo, o None


class AIProviderValidateResponse(BaseModel):
    """Resultado de validar una API key contra el proveedor."""

    provider: str
    is_valid: bool
    message: str
    validated_at: Optional[datetime]
    suggested_models: list[str]  # Modelos disponibles para mostrar en el selector


# ─────────────────────────────────────────────────────────────
# Modelos disponibles por proveedor (catálogo estático)
# ─────────────────────────────────────────────────────────────

PROVIDER_MODELS: dict[str, list[dict]] = {
    AIProvider.OPENAI: [
        {"id": "gpt-4o", "label": "GPT-4o (recomendado — texto + visión)"},
        {"id": "gpt-4o-mini", "label": "GPT-4o Mini (rápido y económico)"},
        {"id": "gpt-4-turbo", "label": "GPT-4 Turbo"},
        {"id": "o1-mini", "label": "o1 Mini (razonamiento)"},
    ],
    AIProvider.GEMINI: [
        {
            "id": "gemini-2.5-flash",
            "label": "Gemini 2.5 Flash (recomendado — multimodal)",
        },
        {"id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro (más potente)"},
        {"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash"},
        {"id": "gemini-1.5-pro", "label": "Gemini 1.5 Pro"},
    ],
    AIProvider.ANTHROPIC: [
        {"id": "claude-opus-4-5", "label": "Claude Opus 4.5 (más potente)"},
        {
            "id": "claude-sonnet-4-5",
            "label": "Claude Sonnet 4.5 (recomendado — balance)",
        },
        {"id": "claude-3-5-haiku-20241022", "label": "Claude 3.5 Haiku (rápido)"},
    ],
    AIProvider.OPENROUTER: [
        {"id": "openai/gpt-4o", "label": "OpenAI GPT-4o (vía OpenRouter)"},
        {"id": "google/gemini-2.5-flash", "label": "Gemini 2.5 Flash (vía OpenRouter)"},
        {
            "id": "anthropic/claude-sonnet-4-5",
            "label": "Claude Sonnet (vía OpenRouter)",
        },
        {
            "id": "meta-llama/llama-3.3-70b-instruct",
            "label": "Llama 3.3 70B (open source)",
        },
    ],
}
