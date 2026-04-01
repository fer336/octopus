"""
Modelo de conversaciones del agente Luci.

Guarda el historial de chat por usuario+negocio para que Luci
recuerde el contexto entre sesiones (persistencia en PostgreSQL).

Diseño:
- Una `ChatConversation` agrupa los mensajes de un usuario en un negocio.
- Por defecto hay una conversación activa por (user_id, business_id).
- Cada `ChatMessage` es un turno: rol (user/assistant), texto, tipo de respuesta
  y los datos estructurados (productos, quote, cart_items) como JSON.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ChatConversation(Base):
    """
    Agrupa los mensajes de un usuario en un negocio.
    Una sola conversación activa por (user_id, business_id).
    """

    __tablename__ = "chat_conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    business_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    messages = relationship(
        "ChatMessage",
        back_populates="conversation",
        order_by="ChatMessage.created_at",
        lazy="selectin",
    )


class ChatMessage(Base):
    """
    Un turno del chat — mensaje del usuario o respuesta del asistente.
    Los datos estructurados (productos, quote, cart_items) se guardan como JSON en `data_json`.
    """

    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # "user" o "assistant"
    role = Column(String(20), nullable=False)

    # Texto visible del mensaje (puede incluir marcadores internos como [MULTI_CONTEXT])
    content = Column(Text, nullable=False, default="")

    # Tipo de respuesta del asistente: "text", "products", "quote", "cart_action"
    response_type = Column(String(30), nullable=True)

    # Datos estructurados serializados como JSON:
    # Para products: [{"id":..., "code":..., "description":..., "sale_price":..., "unit":...}]
    # Para quote:    {"draft":..., "needs_review":...}
    # Para cart_action: [{"product":{...}, "qty":...}]
    data_json = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    conversation = relationship("ChatConversation", back_populates="messages")
