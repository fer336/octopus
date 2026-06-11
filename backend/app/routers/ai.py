"""
Router del Agente IA — OctopusTrack
=====================================
Expone los endpoints para:
- POST /ai/parse-quote  → Analiza un archivo/texto y retorna draft del presupuesto
- POST /ai/chat         → Chat conversacional con el asistente IA (nuevo)
- POST /ai/create-quote → Crea el voucher (cotización) a partir del draft confirmado
- PATCH /ai/learn-term  → Guarda un término aprendido en customer_terms del producto
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.ai_chat_service import run_chat_agent, run_chat_agent_streaming
from app.services.ai_memory_service import save_aggregate_memory
from app.services.ai_quote_service import add_customer_term, run_quote_agent
from app.services.chat_history_service import (
    clear_history,
    get_history,
    get_or_create_conversation,
    save_turn,
)
from app.utils.security import get_current_business_with_ai_enabled, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["Agente IA"])

# Tipos de archivo aceptados por el endpoint
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_AUDIO_TYPES = {
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
}
ALLOWED_DOC_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

GREETING_TERMS = {
    "hola",
    "buenas",
    "buen dia",
    "buen día",
    "que tal",
    "qué tal",
    "como va",
    "cómo va",
    "hey",
}

HELP_TERMS = {
    "ayuda",
    "help",
    "que podes hacer",
    "qué podés hacer",
}


# ─────────────────────────────────────────────────────────────
# Schemas de entrada/salida
# ─────────────────────────────────────────────────────────────
class LearnTermRequest(BaseModel):
    """Cuerpo para guardar un término aprendido."""

    product_id: UUID = Field(
        ..., description="ID del producto al que se le agrega el término"
    )
    term: str = Field(
        ..., min_length=2, max_length=200, description="Término a guardar"
    )


class CreateQuoteRequest(BaseModel):
    """
    Cuerpo para crear la cotización a partir del draft confirmado por el usuario.
    El frontend envía los ítems ya revisados y corregidos.
    """

    client_id: UUID = Field(..., description="ID del cliente para la cotización")
    items: list[dict] = Field(..., description="Ítems confirmados del draft")
    general_discount: float = Field(default=0.0, ge=0, le=100)
    notes: str = Field(default="", description="Notas adicionales")
    due_date: str | None = Field(
        default=None, description="Fecha de vencimiento YYYY-MM-DD"
    )


class SaveConversationRequest(BaseModel):
    """Cuerpo para guardar la conversación en Engram al cerrar el panel."""

    messages: list[dict] = Field(
        ..., description="Historial completo de la conversación [{role, content}, ...]"
    )


# ─────────────────────────────────────────────────────────────
# POST /ai/parse-quote
# ─────────────────────────────────────────────────────────────
@router.post("/parse-quote", summary="Analizar presupuesto con IA")
async def parse_quote(
    file: UploadFile | None = File(
        default=None, description="Imagen, audio, PDF o DOCX"
    ),
    text: str | None = Form(default=None, description="Texto libre del presupuesto"),
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business_with_ai_enabled),
    current_user=Depends(get_current_user),
):
    """
    Analiza un presupuesto en cualquier formato y retorna un draft con los
    productos del catálogo matcheados y sus niveles de confianza.

    Acepta:
    - **file**: imagen (JPG/PNG), audio (MP3/WAV/OGG/WEBM), PDF, o DOCX
    - **text**: texto libre con los productos a buscar

    Retorna:
    - **draft**: ítems matcheados con confianza HIGH/MED/LOW/NONE
    - **needs_review**: True si hay ítems que requieren revisión manual
    - **errors**: lista de errores no fatales
    """
    business_id = str(current_business)

    # ── Determinar tipo de entrada ───────────────────────────────
    if file and file.filename:
        content_type = file.content_type or ""
        file_bytes = await file.read()

        # Validar tamaño
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"El archivo supera el límite de {MAX_FILE_SIZE_MB}MB.",
            )

        # Determinar tipo de procesamiento
        if content_type in ALLOWED_IMAGE_TYPES:
            input_type = "image"
            raw_input = file_bytes

        elif content_type in ALLOWED_AUDIO_TYPES:
            input_type = "audio"
            raw_input = file_bytes

        elif content_type == "application/pdf":
            input_type = "pdf"
            raw_input = file_bytes

        elif "wordprocessingml" in content_type or file.filename.endswith(".docx"):
            input_type = "docx"
            raw_input = file_bytes

        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=(
                    f"Tipo de archivo '{content_type}' no soportado. "
                    f"Aceptamos: imágenes, audio, PDF y DOCX."
                ),
            )

    elif text and text.strip():
        input_type = "text"
        raw_input = text.strip()

    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debés enviar un archivo (file) o texto (text).",
        )

    # ── Correr el grafo LangGraph (hilo separado) ─────────────────
    logger.info(
        f"[AI Router] Iniciando agente. "
        f"type={input_type}, business={business_id}, user={current_user.id}"
    )

    try:
        result = await run_quote_agent(
            input_type=input_type,
            raw_input=raw_input,
            business_id=business_id,
            db=db,
        )
    except ValueError as e:
        # API key no configurada u otro error de configuración
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"[AI Router] Error en el agente: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del agente de IA. Revisá los logs del servidor.",
        )

    return JSONResponse(content=result)


# ─────────────────────────────────────────────────────────────
# PATCH /ai/learn-term
# ─────────────────────────────────────────────────────────────
@router.patch("/learn-term", summary="Guardar término aprendido en un producto")
async def learn_term(
    body: LearnTermRequest,
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business_with_ai_enabled),
    current_user=Depends(get_current_user),
):
    """
    Agrega un término al campo `customer_terms` de un producto.
    Se llama cuando el usuario corrige un match del agente y confirma
    querer que el sistema recuerde esa asociación para el futuro.

    Evita duplicados automáticamente.
    """
    success = await add_customer_term(
        product_id=str(body.product_id),
        new_term=body.term,
        db=db,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto {body.product_id} no encontrado.",
        )

    return {"message": f"Término '{body.term}' guardado correctamente."}


# ─────────────────────────────────────────────────────────────
# POST /ai/chat
# ─────────────────────────────────────────────────────────────
@router.post("/chat", summary="Chat con el Asistente IA del negocio")
async def chat(
    message: str = Form(..., description="Mensaje del usuario"),
    history: str = Form(
        default="[]",
        description="Historial JSON serializado: [{role, content}, ...]",
    ),
    file: UploadFile | None = File(
        default=None,
        description="Archivo adjunto opcional (imagen, audio, PDF, DOCX)",
    ),
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business_with_ai_enabled),
    current_user=Depends(get_current_user),
):
    """
    Chat conversacional con el asistente IA del negocio.

    El agente clasifica la intención del mensaje y responde de forma apropiada:
    - **Consulta de precio/stock**: busca en el catálogo y muestra los resultados
    - **Solicitud de presupuesto**: corre el grafo de cotización y devuelve el draft
    - **Consulta general**: responde como asistente de negocio en español

    El historial (últimos 10 mensajes) se envía como JSON serializado en el campo `history`.

    Acepta archivo adjunto con los mismos tipos que `/parse-quote`.
    """
    business_id = str(current_business)

    if len(message) > 2000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El mensaje no puede superar los 2000 caracteres.",
        )

    # Solo el primer nombre — Google devuelve nombre completo ("Fernando Cassera")
    full_name = getattr(current_user, "name", "") or ""
    user_name = full_name.strip().split()[0].capitalize() if full_name.strip() else ""

    # Parsear historial
    try:
        parsed_history = json.loads(history)
        if not isinstance(parsed_history, list):
            parsed_history = []
        # Tomar solo los últimos 10 mensajes, validando estructura básica
        parsed_history = [
            h for h in parsed_history[-10:]
            if isinstance(h, dict) and h.get("role") in ("user", "assistant")
        ]
    except (json.JSONDecodeError, ValueError):
        parsed_history = []

    # Procesar archivo adjunto si existe
    input_file: bytes | None = None
    input_file_type: str | None = None

    if file and file.filename:
        content_type = file.content_type or ""
        file_bytes = await file.read()

        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"El archivo supera el límite de {MAX_FILE_SIZE_MB}MB.",
            )

        if content_type in ALLOWED_IMAGE_TYPES:
            input_file = file_bytes
            input_file_type = "image"
        elif content_type in ALLOWED_AUDIO_TYPES:
            input_file = file_bytes
            input_file_type = "audio"
        elif content_type == "application/pdf":
            input_file = file_bytes
            input_file_type = "pdf"
        elif "wordprocessingml" in content_type or (file.filename or "").endswith(
            ".docx"
        ):
            input_file = file_bytes
            input_file_type = "docx"
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Tipo de archivo '{content_type}' no soportado.",
            )

    logger.info(
        f"[AI Chat] message='{message[:60]}...', "
        f"history_len={len(parsed_history)}, "
        f"file={input_file_type or 'none'}, "
        f"business={business_id}"
    )

    # Cargar historial desde PostgreSQL si el frontend no mandó nada
    if not parsed_history:
        parsed_history = await get_history(db, current_user.id, business_id)

    try:
        result = await run_chat_agent(
            message=message,
            history=parsed_history,
            business_id=business_id,
            db=db,
            input_file=input_file,
            input_file_type=input_file_type,
            user_name=user_name,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"[AI Chat] Error en el agente: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del agente de IA. Revisá los logs del servidor.",
        )

    # Guardar el turno en PostgreSQL (fire-and-forget, no bloquea la respuesta)
    try:
        conv = await get_or_create_conversation(db, current_user.id, business_id)
        await save_turn(db, conv.id, message, result)
        await db.commit()
    except Exception as e:
        logger.warning(f"[AI Chat] No se pudo guardar en historial: {e}")

    return JSONResponse(content=result)


# ─────────────────────────────────────────────────────────────
# POST /ai/chat/stream
# Igual que /ai/chat pero devuelve Server-Sent Events (SSE).
# Cada evento tiene formato:  data: {"type": "thinking"|"result"|"error", ...}\n\n
# ─────────────────────────────────────────────────────────────
@router.post("/chat/stream", summary="Chat con el Asistente IA — streaming SSE")
async def chat_stream(
    message: str = Form(..., description="Mensaje del usuario"),
    history: str = Form(
        default="[]",
        description="Historial JSON serializado: [{role, content}, ...]",
    ),
    file: UploadFile | None = File(
        default=None,
        description="Archivo adjunto opcional (imagen, audio, PDF, DOCX)",
    ),
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business_with_ai_enabled),
    current_user=Depends(get_current_user),
):
    """
    Versión streaming de /ai/chat.

    Emite eventos SSE con el progreso del agente a medida que ejecuta cada nodo:

    - ``{"type": "thinking", "text": "Analizando tu consulta..."}``
    - ``{"type": "thinking", "text": "Buscando productos en el catálogo..."}``
    - ``{"type": "result",   "response_type": "...", "text": "...", ...}``

    El frontend muestra los mensajes ``thinking`` en tiempo real y reemplaza
    el placeholder con el contenido de ``result`` al terminar.
    """
    business_id = str(current_business)

    if len(message) > 2000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El mensaje no puede superar los 2000 caracteres.",
        )

    # Solo el primer nombre
    full_name = getattr(current_user, "name", "") or ""
    user_name = full_name.strip().split()[0].capitalize() if full_name.strip() else ""

    # Parsear historial del frontend
    try:
        parsed_history = json.loads(history)
        if not isinstance(parsed_history, list):
            parsed_history = []
        parsed_history = [
            h for h in parsed_history[-10:]
            if isinstance(h, dict) and h.get("role") in ("user", "assistant")
        ]
    except (json.JSONDecodeError, ValueError):
        parsed_history = []

    # Si el frontend no mandó historial, cargar desde PostgreSQL
    if not parsed_history:
        parsed_history = await get_history(db, current_user.id, business_id)

    # Procesar archivo adjunto
    input_file: bytes | None = None
    input_file_type: str | None = None

    if file and file.filename:
        content_type = file.content_type or ""
        file_bytes = await file.read()

        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"El archivo supera el límite de {MAX_FILE_SIZE_MB}MB.",
            )

        if content_type in ALLOWED_IMAGE_TYPES:
            input_file = file_bytes
            input_file_type = "image"
        elif content_type in ALLOWED_AUDIO_TYPES:
            input_file = file_bytes
            input_file_type = "audio"
        elif content_type == "application/pdf":
            input_file = file_bytes
            input_file_type = "pdf"
        elif "wordprocessingml" in content_type or (file.filename or "").endswith(
            ".docx"
        ):
            input_file = file_bytes
            input_file_type = "docx"
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Tipo de archivo '{content_type}' no soportado.",
            )

    logger.info(
        f"[AI ChatStream] message='{message[:60]}...', "
        f"history_len={len(parsed_history)}, "
        f"file={input_file_type or 'none'}, "
        f"business={business_id}"
    )

    async def _stream_and_save():
        """Wrapper que persiste el turno en PostgreSQL al recibir el evento 'result'."""
        async for chunk in run_chat_agent_streaming(
            message=message,
            history=parsed_history,
            business_id=business_id,
            db=db,
            input_file=input_file,
            input_file_type=input_file_type,
            user_name=user_name,
        ):
            yield chunk
            # Detectar el evento result para guardarlo
            if chunk.startswith("data:") and '"type": "result"' in chunk:
                try:
                    payload = json.loads(chunk[5:].strip())
                    result_data = {
                        "response_type": payload.get("response_type", "text"),
                        "text": payload.get("text", ""),
                        "products": payload.get("products"),
                        "quote": payload.get("quote"),
                        "cart_items": payload.get("cart_items"),
                    }
                    conv = await get_or_create_conversation(
                        db, current_user.id, business_id
                    )
                    await save_turn(db, conv.id, message, result_data)
                    await db.commit()
                except Exception as e:
                    logger.warning(f"[AI ChatStream] No se pudo guardar historial: {e}")

    return StreamingResponse(
        _stream_and_save(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Deshabilita buffering en Nginx
        },
    )


# ─────────────────────────────────────────────────────────────
# GET  /ai/history  → carga el historial guardado en PostgreSQL
# DELETE /ai/history → limpia el historial (botón "Limpiar" del chat)
# ─────────────────────────────────────────────────────────────


@router.get("/history", summary="Obtener historial de chat del usuario")
async def get_chat_history(
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business_with_ai_enabled),
    current_user=Depends(get_current_user),
):
    """
    Retorna el historial de conversación del usuario actual en el negocio.
    El frontend lo carga al abrir el panel del asistente para restaurar el contexto.
    """
    business_id = str(current_business)
    history = await get_history(db, current_user.id, business_id, limit=30)
    return JSONResponse(content={"history": history})


@router.delete("/history", summary="Limpiar historial de chat")
async def delete_chat_history(
    db: AsyncSession = Depends(get_db),
    current_business=Depends(get_current_business_with_ai_enabled),
    current_user=Depends(get_current_user),
):
    """
    Elimina todos los mensajes del historial del usuario en el negocio.
    Se llama cuando el usuario toca "Limpiar" en el panel del asistente.
    """
    business_id = str(current_business)
    await clear_history(db, current_user.id, business_id)
    await db.commit()
    return JSONResponse(content={"ok": True})


@router.post(
    "/chat/save-conversation",
    summary="Guardar conversación completa en Engram al cerrar el panel",
)
async def save_conversation(
    body: SaveConversationRequest,
    current_business=Depends(get_current_business_with_ai_enabled),
    current_user=Depends(get_current_user),
):
    """
    Guarda toda la conversación en Engram cuando el usuario cierra el panel.
    Acumula las entradas bajo el topic_key `business/{id}/conversations`.
    """
    business_id = str(current_business)
    user_name = getattr(current_user, "name", "") or ""
    messages = body.messages[-20:]  # últimas 20 entradas

    if not messages:
        return JSONResponse(content={"saved": False, "reason": "empty"})

    # Armar un resumen legible de la conversación
    lines: list[str] = []
    for msg in messages:
        role = "Usuario" if msg.get("role") == "user" else "Luci"
        content = (msg.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content[:200]}")

    summary = "\n".join(lines)
    title = f"Conversación {user_name} — {len(messages)} mensajes"

    saved = await save_aggregate_memory(
        title=title,
        new_entry=summary,
        topic_key=f"business/{business_id}/conversations",
        business_id=business_id,
        strategy="append_cap",
        cap=30,
    )

    return JSONResponse(content={"saved": saved, "messages_count": len(messages)})
