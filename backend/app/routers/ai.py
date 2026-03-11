"""
Router del Agente IA de Presupuestos — OctopusTrack
====================================================
Expone los endpoints para:
- POST /ai/parse-quote  → Analiza un archivo/texto y retorna draft del presupuesto
- POST /ai/create-quote → Crea el voucher (cotización) a partir del draft confirmado
- PATCH /ai/learn-term  → Guarda un término aprendido en customer_terms del producto
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.ai_quote_service import add_customer_term, run_quote_agent
from app.utils.security import get_current_business, get_current_user

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
    current_business=Depends(get_current_business),
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
    business_id = str(current_business.id)

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
    current_business=Depends(get_current_business),
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
