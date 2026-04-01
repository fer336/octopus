"""
Schemas Pydantic para el endpoint de chat del Agente IA.
POST /api/tenant/ai/chat
"""

from typing import Literal
from pydantic import BaseModel, Field


class ChatHistoryMessage(BaseModel):
    """Mensaje individual del historial de conversación."""

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=10_000)


class AIChatResponse(BaseModel):
    """
    Respuesta tipada del agente IA al frontend.

    response_type determina qué campos adicionales están presentes:
    - "text"     → solo text (respuesta conversacional general)
    - "products" → text + products (lista de productos matcheados)
    - "quote"    → text + quote (draft de cotización completo)
    """

    response_type: Literal["text", "products", "quote"]
    text: str = Field(..., description="Texto principal de la respuesta")
    products: list[dict] | None = Field(
        default=None,
        description="Productos encontrados (para response_type='products')",
    )
    quote: dict | None = Field(
        default=None,
        description="Draft de cotización (para response_type='quote')",
    )
