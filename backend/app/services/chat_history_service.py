"""
Servicio de persistencia del historial de chat de Luci.

Guarda y recupera los mensajes de conversación por (user_id, business_id).
Una sola conversación activa por usuario/negocio — se reutiliza entre sesiones.

Límite: se guardan los últimos MAX_MESSAGES mensajes por conversación
para evitar que la tabla crezca indefinidamente.
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_conversation import ChatConversation, ChatMessage

logger = logging.getLogger(__name__)

# Máximo de mensajes guardados por conversación (FIFO — se elimina el más viejo)
MAX_MESSAGES = 100

# Máximo de mensajes que se devuelven al frontend para el contexto del agente
HISTORY_LIMIT = 20


async def get_or_create_conversation(
    db: AsyncSession,
    user_id: str | UUID,
    business_id: str | UUID,
) -> ChatConversation:
    """
    Retorna la conversación activa del usuario en el negocio.
    Si no existe, la crea.
    """
    result = await db.execute(
        select(ChatConversation)
        .where(
            ChatConversation.user_id == str(user_id),
            ChatConversation.business_id == str(business_id),
        )
        .order_by(ChatConversation.created_at.desc())
        .limit(1)
    )
    conv = result.scalar_one_or_none()

    if conv is None:
        conv = ChatConversation(
            user_id=str(user_id),
            business_id=str(business_id),
        )
        db.add(conv)
        await db.flush()  # Obtener el id sin commitear todavía
        logger.info(f"[ChatHistory] Nueva conversación {conv.id} para user={user_id}")

    return conv


async def save_turn(
    db: AsyncSession,
    conversation_id: UUID,
    user_message: str,
    assistant_response: dict,
) -> None:
    """
    Guarda un turno completo (mensaje de usuario + respuesta del asistente).

    `assistant_response` tiene la forma:
        {
            "response_type": "text|products|quote|cart_action",
            "text": "...",
            "products": [...] | None,
            "quote": {...} | None,
            "cart_items": [...] | None,
        }
    """
    # Mensaje del usuario
    user_msg = ChatMessage(
        conversation_id=conversation_id,
        role="user",
        content=user_message,
        response_type=None,
        data_json=None,
    )
    db.add(user_msg)

    # Respuesta del asistente
    response_type = assistant_response.get("response_type", "text")
    text = assistant_response.get("text", "")

    # Serializar datos estructurados según el tipo
    data: dict | None = None
    if response_type == "products" and assistant_response.get("products"):
        data = {"products": assistant_response["products"]}
    elif response_type == "quote" and assistant_response.get("quote"):
        data = {"quote": assistant_response["quote"]}
    elif response_type == "cart_action" and assistant_response.get("cart_items"):
        data = {"cart_items": assistant_response["cart_items"]}

    assistant_msg = ChatMessage(
        conversation_id=conversation_id,
        role="assistant",
        content=text,
        response_type=response_type,
        data_json=json.dumps(data, ensure_ascii=False) if data else None,
    )
    db.add(assistant_msg)

    await db.flush()

    # Limpiar mensajes viejos si se excede el límite (FIFO)
    await _trim_conversation(db, conversation_id)


async def _trim_conversation(db: AsyncSession, conversation_id: UUID) -> None:
    """Elimina los mensajes más viejos si se supera MAX_MESSAGES."""
    count_result = await db.execute(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.conversation_id == conversation_id
        )
    )
    total = count_result.scalar_one()

    if total > MAX_MESSAGES:
        excess = total - MAX_MESSAGES
        # Obtener los IDs más viejos
        old_ids_result = await db.execute(
            select(ChatMessage.id)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(excess)
        )
        old_ids = [row[0] for row in old_ids_result]
        if old_ids:
            await db.execute(delete(ChatMessage).where(ChatMessage.id.in_(old_ids)))


async def get_history(
    db: AsyncSession,
    user_id: str | UUID,
    business_id: str | UUID,
    limit: int = HISTORY_LIMIT,
) -> list[dict]:
    """
    Retorna el historial de conversación en el formato que usa el agente:
    [{"role": "user"|"assistant", "content": "...", "products": [...]}]

    Incluye los datos estructurados (products, quote) para que el agente
    pueda leer el contexto de la sesión anterior.
    """
    result = await db.execute(
        select(ChatConversation)
        .where(
            ChatConversation.user_id == str(user_id),
            ChatConversation.business_id == str(business_id),
        )
        .order_by(ChatConversation.created_at.desc())
        .limit(1)
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        return []

    msgs_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    msgs = list(reversed(msgs_result.scalars().all()))

    history: list[dict] = []
    for msg in msgs:
        entry: dict = {
            "role": msg.role,
            "content": msg.content,
        }

        # Incluir datos estructurados si existen
        if msg.data_json:
            try:
                data = json.loads(msg.data_json)
                if "products" in data:
                    entry["products"] = data["products"]
                    # También en el content como [PRODUCT_CONTEXT] para compatibilidad
                    codes = " || ".join(
                        f"{p.get('code', '')}:{p.get('description', '')}:{p.get('sale_price', '')}"
                        for p in data["products"]
                    )
                    if codes:
                        entry["content"] = f"{msg.content}\n[PRODUCT_CONTEXT] {codes}"
                elif "quote" in data:
                    entry["quote"] = data["quote"]
                elif "cart_items" in data:
                    entry["cart_items"] = data["cart_items"]
            except Exception:
                pass

        history.append(entry)

    return history


async def clear_history(
    db: AsyncSession,
    user_id: str | UUID,
    business_id: str | UUID,
) -> None:
    """Elimina todos los mensajes de la conversación activa."""
    result = await db.execute(
        select(ChatConversation).where(
            ChatConversation.user_id == str(user_id),
            ChatConversation.business_id == str(business_id),
        )
    )
    conv = result.scalar_one_or_none()
    if conv:
        await db.execute(
            delete(ChatMessage).where(ChatMessage.conversation_id == conv.id)
        )
        await db.flush()
        logger.info(f"[ChatHistory] Historial limpiado para user={user_id}")
