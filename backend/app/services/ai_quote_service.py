"""
Agente IA de Presupuestos — OctopusTrack
=========================================
Implementa un grafo LangGraph con 4 nodos que procesan cualquier
tipo de entrada (imagen, audio, PDF, DOCX, texto) y devuelven un
borrador de cotización con los productos del catálogo matcheados.

Flujo del grafo:
  START → ingester → extractor → matcher (fan-out paralelo) → validator → END

El grafo corre en un ThreadPoolExecutor separado para no interferir
con el event loop principal de FastAPI.
"""

import asyncio
import base64
import json
import logging
import operator
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from typing import Annotated, Any, Literal

from openai import OpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.services.llm_factory import LLMFactory

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Importaciones de LangGraph con manejo de errores descriptivo
# ─────────────────────────────────────────────────────────────
try:
    from langgraph.graph import END, START, StateGraph
    from langgraph.types import Send
except ImportError as e:
    raise ImportError(
        "LangGraph no está instalado. Ejecutá: pip install langgraph langchain-openai"
    ) from e

# Pool de hilos dedicado para el agente IA (no bloquea el event loop de FastAPI)
_ai_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ai-quote")

# Cliente IA activo para el request en curso — se inyecta antes de correr el grafo
# (threading.local para que cada hilo del executor tenga el suyo)
import threading

_thread_local = threading.local()

# ─────────────────────────────────────────────────────────────
# Tipos de confianza del matching
# ─────────────────────────────────────────────────────────────
CONFIDENCE_HIGH = "HIGH"  # ≥ 85% — match seguro, borde verde
CONFIDENCE_MED = "MED"  # 50–84% — revisar, borde amarillo
CONFIDENCE_LOW = "LOW"  # 20–49% — borde amarillo oscuro
CONFIDENCE_NONE = "NONE"  # < 20% o sin candidatos — borde rojo


# ─────────────────────────────────────────────────────────────
# Estado del grafo
# ─────────────────────────────────────────────────────────────
class QuoteAgentState(dict):
    """
    Estado compartido entre todos los nodos del grafo.
    Usa Annotated con operator.add para acumular listas de manera segura
    cuando los nodos matcher corren en paralelo (fan-out con Send).
    """

    # --- Entrada ---
    input_type: str  # "image" | "audio" | "pdf" | "docx" | "text"
    raw_input: Any  # bytes (archivo) o str (texto directo)
    business_id: str  # Para filtrar productos del negocio correcto
    db_products: (
        list  # Lista de dicts de productos del catálogo (cargada antes del grafo)
    )

    # --- Nodo 1: Ingester ---
    raw_text: str  # Texto extraído de la entrada

    # --- Nodo 2: Extractor ---
    extracted_items: list  # [{qty, unit, description, raw_original}]

    # --- Nodo 3: Matcher (fan-out, se acumula con operator.add) ---
    matched_items: Annotated[list, operator.add]

    # --- Nodo 4: Validator ---
    validated_draft: dict  # Borrador final con ítems, totales y flags
    needs_review: bool  # True si hay items MED/LOW/NONE
    errors: list  # Errores no fatales durante el procesamiento


# ─────────────────────────────────────────────────────────────
# Cliente IA — resuelto desde DB por LLMFactory
# ─────────────────────────────────────────────────────────────
def _get_ai_client() -> OpenAI:
    """
    Retorna el cliente IA del hilo actual (inyectado por run_quote_agent).
    Todos los nodos del grafo usan este getter en vez de crear el cliente directamente.
    """
    client = getattr(_thread_local, "client", None)
    if client is None:
        raise ValueError(
            "No hay proveedor de IA configurado para este negocio. "
            "Configurá uno en Ajustes → Inteligencia Artificial."
        )
    return client


def _get_ai_model() -> str:
    """Retorna el modelo IA del hilo actual."""
    return getattr(_thread_local, "model", "gpt-4o")


def _get_ai_provider() -> str:
    """Retorna el proveedor IA del hilo actual."""
    return getattr(_thread_local, "provider", "openai")


# ─────────────────────────────────────────────────────────────
# NODO 1: Ingester
# Convierte cualquier formato de entrada en texto plano
# ─────────────────────────────────────────────────────────────
def node_ingester(state: QuoteAgentState) -> dict:
    """
    Nodo 1 — Ingester.
    Procesa la entrada según su tipo y produce raw_text.

    - image: Envía a GPT-4o Vision para OCR/descripción
    - audio: Envía a Whisper para transcripción
    - pdf:   Extrae texto con PyMuPDF
    - docx:  Extrae texto con python-docx
    - text:  Pasa directo sin procesamiento
    """
    input_type = state.get("input_type", "text")
    raw_input = state.get("raw_input", "")
    errors = []

    logger.info(f"[Ingester] Procesando entrada tipo: {input_type}")

    try:
        if input_type == "text":
            raw_text = str(raw_input)

        elif input_type == "image":
            raw_text = _ingest_image(raw_input)

        elif input_type == "audio":
            raw_text = _ingest_audio(raw_input)

        elif input_type == "pdf":
            raw_text = _ingest_pdf(raw_input)

        elif input_type == "docx":
            raw_text = _ingest_docx(raw_input)

        else:
            raw_text = str(raw_input)
            errors.append(
                f"Tipo de entrada desconocido '{input_type}', procesado como texto."
            )

    except Exception as e:
        logger.error(f"[Ingester] Error procesando entrada: {e}")
        raw_text = ""
        errors.append(f"Error al procesar el archivo: {str(e)}")

    logger.info(f"[Ingester] Texto extraído: {len(raw_text)} caracteres")
    return {"raw_text": raw_text, "errors": errors}


def _ingest_image(image_bytes: bytes) -> str:
    """
    Usa GPT-4o Vision para extraer texto de una imagen (foto del presupuesto).
    Especialmente útil para fotos de papel manuscrito o impreso.
    """
    client = _get_ai_client()

    # Codificar imagen en base64 para la API de OpenAI
    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    response = client.chat.completions.create(
        model=_get_ai_model(),
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Esta imagen es un presupuesto o pedido de una ferretería/sanitarios argentina. "
                            "Extraé el texto exactamente como aparece, incluyendo cantidades, "
                            "descripciones de productos, códigos y cualquier otra información relevante. "
                            "Mantené el formato original con una línea por ítem. "
                            "Si el texto es manuscrito, interpretaló lo mejor posible. "
                            "Respondé SOLO con el texto extraído, sin explicaciones adicionales."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
                    },
                ],
            }
        ],
        max_tokens=2000,
    )
    return response.choices[0].message.content or ""


def _ingest_audio(audio_bytes: bytes) -> str:
    """
    Usa Whisper para transcribir audio a texto.
    Soporta MP3, MP4, WAV, OGG, WEBM.
    """
    import io

    client = _get_ai_client()

    # Whisper necesita un objeto tipo archivo con nombre
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "audio.webm"  # Formato común de grabación del browser

    from app.services.llm_factory import LLMFactory as _LF

    whisper_model = _LF.get_whisper_model(_get_ai_provider())

    transcript = client.audio.transcriptions.create(
        model=whisper_model,
        file=audio_file,
        language="es",  # Español argentino
        prompt=(
            "Este es un pedido de ferretería o sanitarios en Argentina. "
            "Puede incluir términos técnicos del rubro como: caño, rosca, PP, "
            "entrerosca, codo, niple, llave de paso, etc."
        ),
    )
    return transcript.text


def _ingest_pdf(pdf_bytes: bytes) -> str:
    """
    Extrae texto de un PDF usando PyMuPDF (fitz).
    Si el PDF tiene texto seleccionable lo extrae directamente.
    Si es un PDF escaneado (imagen), usa GPT-4o Vision por página.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise ImportError("PyMuPDF no está instalado. Ejecutá: pip install pymupdf")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages_text = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text().strip()

        if text:
            # PDF con texto seleccionable — extracción directa
            pages_text.append(text)
        else:
            # PDF escaneado — renderizar página y usar Vision
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("jpeg")
            page_text = _ingest_image(img_bytes)
            pages_text.append(page_text)

    doc.close()
    return "\n".join(pages_text)


def _ingest_docx(docx_bytes: bytes) -> str:
    """
    Extrae texto de un archivo .docx usando python-docx.
    """
    try:
        import io

        from docx import Document
    except ImportError:
        raise ImportError(
            "python-docx no está instalado. Ejecutá: pip install python-docx"
        )

    doc = Document(io.BytesIO(docx_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


# ─────────────────────────────────────────────────────────────
# NODO 2: Extractor
# Parsea el raw_text y extrae ítems estructurados
# ─────────────────────────────────────────────────────────────
def node_extractor(state: QuoteAgentState) -> dict:
    """
    Nodo 2 — Extractor.
    Usa GPT-4o para parsear el raw_text y extraer una lista
    estructurada de ítems del presupuesto.

    Retorna: extracted_items = [
        {
            "qty": 5,
            "unit": "u",
            "description": "rosca con tuerca pp 3/4",
            "raw_original": "5 rosca pp 3/4 hembra"
        }, ...
    ]
    """
    raw_text = state.get("raw_text", "")
    errors = list(state.get("errors", []))

    if not raw_text.strip():
        logger.warning("[Extractor] raw_text vacío, no hay ítems para extraer.")
        return {"extracted_items": [], "errors": errors}

    logger.info("[Extractor] Extrayendo ítems del texto...")

    client = _get_ai_client()

    system_prompt = """Sos un asistente especializado en interpretar pedidos de ferreterías y sanitarios argentinas.
Tu tarea es extraer los ítems de un presupuesto o pedido y estructurarlos en JSON.

Reglas:
- Extraé SOLO los productos mencionados, no hagas suposiciones
- Si no hay cantidad explícita, usá 1
- La unidad por defecto es "u" (unidad)
- Normalizá la descripción pero mantenela similar al original
- Incluí el texto original en raw_original

Respondé ÚNICAMENTE con un JSON array válido, sin markdown, sin explicaciones:
[
  {"qty": 5, "unit": "u", "description": "rosca pp 3/4 hembra", "raw_original": "5 roscas pp 3/4"},
  {"qty": 2, "unit": "m", "description": "caño blanco 1/2", "raw_original": "2 mts caño blanc 1/2"}
]"""

    try:
        response = client.chat.completions.create(
            model=_get_ai_model(),
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Extraé los ítems de este pedido:\n\n{raw_text}",
                },
            ],
            max_tokens=2000,
            temperature=0.1,  # Baja temperatura para mayor precisión
        )

        content = response.choices[0].message.content or "[]"
        # Limpiar markdown si GPT lo incluyó igual
        content = re.sub(r"```json?\s*|\s*```", "", content).strip()
        extracted_items = json.loads(content)

        logger.info(f"[Extractor] {len(extracted_items)} ítems extraídos.")
        return {"extracted_items": extracted_items, "errors": errors}

    except json.JSONDecodeError as e:
        logger.error(f"[Extractor] Error parseando JSON: {e}")
        errors.append("No se pudo parsear la respuesta del extractor.")
        return {"extracted_items": [], "errors": errors}

    except Exception as e:
        logger.error(f"[Extractor] Error inesperado: {e}")
        errors.append(f"Error en el extractor: {str(e)}")
        return {"extracted_items": [], "errors": errors}


# ─────────────────────────────────────────────────────────────
# EDGE condicional: fan-out al Matcher con Send API
# Lanza un worker por cada ítem extraído (procesamiento paralelo)
# ─────────────────────────────────────────────────────────────
def route_to_matchers(state: QuoteAgentState):
    """
    Edge condicional después del Extractor.
    Usa Send API para lanzar un nodo matcher por cada ítem en paralelo.
    Si no hay ítems, va directo al validator.
    """
    extracted_items = state.get("extracted_items", [])

    if not extracted_items:
        logger.warning("[Router] Sin ítems, saltando al validator.")
        return "validator"

    logger.info(f"[Router] Fan-out: {len(extracted_items)} matchers en paralelo.")

    # Send crea un worker independiente por cada ítem
    return [
        Send(
            "matcher",
            {
                "item": item,
                "db_products": state.get("db_products", []),
                "matched_items": [],  # Reducer operator.add acumula
            },
        )
        for item in extracted_items
    ]


# ─────────────────────────────────────────────────────────────
# NODO 3: Matcher (corre en paralelo, uno por ítem)
# ─────────────────────────────────────────────────────────────
def node_matcher(state: dict) -> dict:
    """
    Nodo 3 — Matcher (instanciado en paralelo via Send API).
    Para cada ítem, busca en el catálogo de productos del negocio
    usando description + customer_terms, luego usa GPT-4o para
    elegir el mejor match con nivel de confianza.

    Retorna un dict que el reducer operator.add acumula en matched_items.
    """
    item = state.get("item", {})
    db_products = state.get("db_products", [])

    item_description = item.get("description", "")
    logger.info(f"[Matcher] Buscando: '{item_description}'")

    # ── Paso 1: Filtro por texto en el catálogo local ──────────
    # Los db_products ya están cargados en memoria antes de iniciar el grafo
    # Evitamos queries a la BD dentro de threads separados
    candidates = _search_candidates_in_memory(item_description, db_products, limit=20)

    if not candidates:
        logger.info(f"[Matcher] Sin candidatos para '{item_description}'")
        return {
            "matched_items": [
                {
                    "item": item,
                    "product": None,
                    "confidence": CONFIDENCE_NONE,
                    "confidence_score": 0,
                    "alternatives": [],
                    "match_reason": "Sin candidatos en el catálogo",
                }
            ]
        }

    # ── Paso 2: GPT-4o elige el mejor match ────────────────────
    match_result = _llm_choose_best_match(item, candidates)

    return {"matched_items": [match_result]}


def _search_candidates_in_memory(
    description: str, db_products: list, limit: int = 20
) -> list:
    """
    Busca candidatos en la lista de productos en memoria.
    Usa los tokens del ítem para filtrar productos cuya description
    o customer_terms contengan alguna de las palabras clave.
    """
    if not description or not db_products:
        return []

    def _normalize(text: str) -> str:
        normalized = unicodedata.normalize("NFKD", text or "")
        ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
        ascii_text = ascii_text.lower()
        return re.sub(r"\s+", " ", ascii_text).strip()

    def _tokenize(text: str) -> list[str]:
        return [
            token
            for token in re.findall(r"[a-z0-9/\-]+", _normalize(text))
            if len(token) >= 2
        ]

    def _variants(token: str) -> set[str]:
        variants = {token}
        if token.endswith("es") and len(token) > 4:
            variants.add(token[:-2])
        if token.endswith("s") and len(token) > 3:
            variants.add(token[:-1])
        if token.endswith("itas") and len(token) > 5:
            variants.add(token[:-4])
            variants.add(token[:-1])
        if token.endswith("itos") and len(token) > 5:
            variants.add(token[:-4])
            variants.add(token[:-1])
        return {v for v in variants if len(v) >= 2}

    raw_tokens = _tokenize(description)
    if not raw_tokens:
        return []

    stop_tokens = {
        "de",
        "del",
        "la",
        "el",
        "los",
        "las",
        "para",
        "con",
        "sin",
        "por",
        "una",
        "uno",
        "que",
        "quiero",
        "necesito",
        "mostrar",
        "mostrame",
        "solo",
        "precio",
        "stock",
    }
    query_tokens = [t for t in raw_tokens if t not in stop_tokens]
    if not query_tokens:
        query_tokens = raw_tokens

    normalized_query = _normalize(description)
    all_query_variants = set()
    for token in query_tokens:
        all_query_variants.update(_variants(token))

    min_token_hits = 1 if len(all_query_variants) <= 1 else 2

    strict_scored: list[tuple[int, dict]] = []
    loose_scored: list[tuple[int, dict]] = []

    for product in db_products:
        prod_description = (product.get("description") or "").lower()
        prod_details = (product.get("details") or "").lower()
        prod_brand = (product.get("brand") or "").lower()
        prod_line = (product.get("line") or "").lower()
        prod_application = (product.get("application_area") or "").lower()
        prod_finish = (product.get("finish") or "").lower()
        prod_quality = (product.get("quality_tier") or "").lower()
        prod_customer_terms = (product.get("customer_terms") or "").lower()
        prod_code = (product.get("code") or "").lower()
        prod_supplier_code = (product.get("supplier_code") or "").lower()

        normalized_desc = _normalize(prod_description)
        normalized_terms = _normalize(prod_customer_terms)
        normalized_search_text = _normalize(
            f"{prod_description} {prod_details} {prod_brand} {prod_line} "
            f"{prod_application} {prod_finish} {prod_quality} "
            f"{prod_customer_terms} {prod_code} {prod_supplier_code}"
        )

        desc_tokens = set(_tokenize(prod_description))
        terms_tokens = set(_tokenize(prod_customer_terms))
        full_tokens = set(_tokenize(normalized_search_text))

        normalized_code = _normalize(prod_code)
        normalized_supplier_code = _normalize(prod_supplier_code)

        score = 0
        token_hits = 0

        if normalized_query and (
            normalized_query in normalized_desc or normalized_query in normalized_terms
        ):
            score += 15

        if normalized_query and (
            normalized_query == normalized_code
            or normalized_query == normalized_supplier_code
        ):
            score += 25

        for token in all_query_variants:
            in_terms = token in terms_tokens
            in_desc = token in desc_tokens
            in_full = token in full_tokens

            if in_terms:
                score += 5
                token_hits += 1
            elif in_desc:
                score += 4
                token_hits += 1
            elif in_full:
                score += 2
                token_hits += 1
            elif token in normalized_search_text:
                score += 1

        if score <= 0:
            continue

        loose_scored.append((score, product))
        if token_hits >= min_token_hits:
            strict_scored.append((score, product))

    ranked = strict_scored if strict_scored else loose_scored
    ranked.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in ranked[:limit]]


def _llm_choose_best_match(item: dict, candidates: list) -> dict:
    """
    Usa GPT-4o para elegir el mejor match entre los candidatos.
    Retorna el ítem enriquecido con product, confidence y alternatives.
    """
    client = _get_ai_client()

    # Construir representación de candidatos para el prompt
    candidates_text = "\n".join(
        [
            f"{i + 1}. ID:{c['id']} | Código:{c['code']} | "
            f"Desc:{c['description']} | "
            f"Términos cliente:{c.get('customer_terms', '')} | "
            f"Precio: ${c['sale_price']}"
            for i, c in enumerate(candidates)
        ]
    )

    system_prompt = """Sos un experto en ferreterías y sanitarios de Argentina.
Tu tarea es encontrar el mejor match entre un ítem de pedido y un catálogo de productos.

Considerá sinónimos y jerga del rubro:
- "rosca", "tuerca", "racor", "bushing", "niple" pueden referirse a conectores
- "pp" = polipropileno, "blanc" = blanco, "pvc" = PVC, "hg" = hierro galvanizado
- Las medidas pueden estar en pulgadas: 1/2, 3/4, 1", o mm: 15, 20, 25
- "caño" = tubo, "llave" = válvula o grifo según contexto

Respondé ÚNICAMENTE con JSON válido:
{
  "best_match_index": 1,
  "confidence_score": 92,
  "confidence_level": "HIGH",
  "match_reason": "El ítem 'rosca pp 3/4' coincide exactamente con 'Entrerosca PP 3/4' y tiene 'rosca' en customer_terms",
  "alternative_indices": [2, 3]
}

confidence_level: HIGH (≥85), MED (50-84), LOW (20-49), NONE (<20)
Si ningún candidato es bueno, usá NONE y best_match_index: null."""

    try:
        response = client.chat.completions.create(
            model=_get_ai_model(),
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"Ítem buscado: '{item.get('description')}' "
                        f"(original: '{item.get('raw_original')}')\n\n"
                        f"Candidatos del catálogo:\n{candidates_text}"
                    ),
                },
            ],
            max_tokens=500,
            temperature=0.1,
        )

        content = response.choices[0].message.content or "{}"
        content = re.sub(r"```json?\s*|\s*```", "", content).strip()
        result = json.loads(content)

        best_idx = result.get("best_match_index")
        confidence = result.get("confidence_level", CONFIDENCE_NONE)
        confidence_score = result.get("confidence_score", 0)
        alt_indices = result.get("alternative_indices", [])
        match_reason = result.get("match_reason", "")

        # Extraer producto seleccionado
        matched_product = None
        if best_idx is not None and 1 <= best_idx <= len(candidates):
            matched_product = candidates[best_idx - 1]

        # Extraer alternativas (máximo 3)
        alternatives = []
        for alt_idx in alt_indices[:3]:
            if 1 <= alt_idx <= len(candidates) and alt_idx != best_idx:
                alternatives.append(candidates[alt_idx - 1])

        return {
            "item": item,
            "product": matched_product,
            "confidence": confidence,
            "confidence_score": confidence_score,
            "alternatives": alternatives,
            "match_reason": match_reason,
        }

    except Exception as e:
        logger.error(f"[Matcher] Error LLM: {e}")
        # Fallback: retornar primer candidato con baja confianza
        return {
            "item": item,
            "product": candidates[0] if candidates else None,
            "confidence": CONFIDENCE_LOW,
            "confidence_score": 30,
            "alternatives": candidates[1:3] if len(candidates) > 1 else [],
            "match_reason": f"Error en matching IA: {str(e)}",
        }


# ─────────────────────────────────────────────────────────────
# NODO 4: Validator
# Revisa resultados, calcula totales y arma el draft final
# ─────────────────────────────────────────────────────────────
def node_validator(state: QuoteAgentState) -> dict:
    """
    Nodo 4 — Validator.
    Clasifica todos los ítems matcheados, calcula totales preliminares
    y construye el borrador final que se envía al frontend.

    La pantalla de revisión mostrará:
    - 🟢 HIGH: match seguro, listo para crear
    - 🟡 MED/LOW: necesita revisión del usuario
    - 🔴 NONE: no encontrado, buscar manualmente
    """
    matched_items = state.get("matched_items", [])
    errors = list(state.get("errors", []))

    logger.info(f"[Validator] Validando {len(matched_items)} ítems...")

    needs_review = False
    validated_items = []
    subtotal = 0.0

    for match in matched_items:
        item = match.get("item", {})
        product = match.get("product")
        confidence = match.get("confidence", CONFIDENCE_NONE)

        qty = float(item.get("qty", 1))
        unit_price = float(product["sale_price"]) if product else 0.0
        item_total = qty * unit_price

        # Determinar si necesita revisión manual
        if confidence in (CONFIDENCE_MED, CONFIDENCE_LOW, CONFIDENCE_NONE):
            needs_review = True

        # Generar sugerencias adicionales para ítems sin match
        extra_suggestions = []
        if confidence == CONFIDENCE_NONE and match.get("alternatives"):
            extra_suggestions = match["alternatives"][:3]

        validated_item = {
            "item": item,
            "product": product,
            "confidence": confidence,
            "confidence_score": match.get("confidence_score", 0),
            "alternatives": match.get("alternatives", []) + extra_suggestions,
            "match_reason": match.get("match_reason", ""),
            "qty": qty,
            "unit_price": unit_price,
            "total": item_total,
        }

        validated_items.append(validated_item)
        subtotal += item_total

    # Resumen por nivel de confianza para el frontend
    summary = {
        "high": sum(1 for i in validated_items if i["confidence"] == CONFIDENCE_HIGH),
        "med": sum(1 for i in validated_items if i["confidence"] == CONFIDENCE_MED),
        "low": sum(1 for i in validated_items if i["confidence"] == CONFIDENCE_LOW),
        "none": sum(1 for i in validated_items if i["confidence"] == CONFIDENCE_NONE),
    }

    validated_draft = {
        "items": validated_items,
        "subtotal": round(subtotal, 2),
        "summary": summary,
        "total_items": len(validated_items),
    }

    logger.info(
        f"[Validator] Draft listo. needs_review={needs_review}. "
        f"HIGH={summary['high']} MED={summary['med']} "
        f"LOW={summary['low']} NONE={summary['none']}"
    )

    return {
        "validated_draft": validated_draft,
        "needs_review": needs_review,
        "errors": errors,
    }


# ─────────────────────────────────────────────────────────────
# Edge condicional: ¿hay texto para procesar?
# ─────────────────────────────────────────────────────────────
def check_raw_text(state: QuoteAgentState) -> Literal["extractor", "validator"]:
    """Si el ingester no pudo extraer texto, ir directo al validator con error."""
    if state.get("raw_text", "").strip():
        return "extractor"
    return "validator"


# ─────────────────────────────────────────────────────────────
# Construcción y compilación del grafo LangGraph
# ─────────────────────────────────────────────────────────────
def _build_graph():
    """
    Construye y compila el grafo LangGraph del agente de presupuestos.

    Arquitectura:
        START → ingester → [check_raw_text] → extractor → [route_to_matchers]
                                        ↓                         ↓
                                    validator ←── matcher×N (paralelo)
                                        ↓
                                       END
    """
    builder = StateGraph(dict)

    # Registrar nodos
    builder.add_node("ingester", node_ingester)
    builder.add_node("extractor", node_extractor)
    builder.add_node("matcher", node_matcher)
    builder.add_node("validator", node_validator)

    # Edges fijos
    builder.add_edge(START, "ingester")

    # Edge condicional post-ingester: ¿hay texto?
    builder.add_conditional_edges(
        "ingester",
        check_raw_text,
        {"extractor": "extractor", "validator": "validator"},
    )

    # Edge condicional post-extractor: fan-out paralelo con Send API
    builder.add_conditional_edges(
        "extractor",
        route_to_matchers,
        ["matcher", "validator"],  # destinos posibles
    )

    # Cada matcher worker va al validator (reducer acumula los resultados)
    builder.add_edge("matcher", "validator")

    # Fin del grafo
    builder.add_edge("validator", END)

    return builder.compile()


# Grafo compilado (singleton, se crea una sola vez al iniciar el módulo)
_quote_graph = _build_graph()


# ─────────────────────────────────────────────────────────────
# Carga de productos del catálogo (antes de invocar el grafo)
# ─────────────────────────────────────────────────────────────
async def _load_catalog_products(db: AsyncSession, business_id: str) -> list:
    """
    Carga todos los productos activos del negocio desde la BD.
    Se ejecuta ANTES de lanzar el grafo para no necesitar
    acceso a la BD desde los threads del executor.
    """
    result = await db.execute(
        select(
            Product.id,
            Product.code,
            Product.supplier_code,
            Product.description,
            Product.details,
            Product.brand,
            Product.line,
            Product.application_area,
            Product.finish,
            Product.quality_tier,
            Product.attributes_json,
            Product.customer_terms,
            Product.sale_price,
            Product.net_price,
            Product.unit,
            Product.iva_rate,
        ).where(
            Product.business_id == business_id,
            Product.is_active == True,
            Product.deleted_at.is_(None),
        )
    )

    products = []
    for row in result.fetchall():
        products.append(
            {
                "id": str(row.id),
                "code": row.code,
                "supplier_code": row.supplier_code or "",
                "description": row.description,
                "details": row.details or "",
                "brand": row.brand or "",
                "line": row.line or "",
                "application_area": row.application_area or "",
                "finish": row.finish or "",
                "quality_tier": row.quality_tier or "",
                "attributes_json": row.attributes_json or "",
                "customer_terms": row.customer_terms or "",
                "sale_price": float(row.sale_price or 0),
                "net_price": float(row.net_price or 0),
                "unit": row.unit,
                "iva_rate": float(row.iva_rate or 21),
            }
        )

    logger.info(
        f"[Catalog] {len(products)} productos cargados para business {business_id}"
    )
    return products


# ─────────────────────────────────────────────────────────────
# Función principal: corre el grafo en un hilo separado
# ─────────────────────────────────────────────────────────────
async def run_quote_agent(
    input_type: str,
    raw_input: bytes | str,
    business_id: str,
    db: AsyncSession,
) -> dict:
    """
    Punto de entrada principal del agente.

    1. Carga el catálogo de productos desde la BD (en el event loop de FastAPI)
    2. Lanza el grafo LangGraph en el ThreadPoolExecutor dedicado
    3. Retorna el draft validado

    Corre en un hilo separado (executor) para no bloquear el event loop
    de FastAPI ni interferir con otras requests.

    Args:
        input_type: "image" | "audio" | "pdf" | "docx" | "text"
        raw_input:  bytes del archivo o string de texto
        business_id: UUID del negocio para filtrar el catálogo
        db:         Sesión async de SQLAlchemy

    Returns:
        dict con {items, subtotal, summary, needs_review, errors}
    """
    # Paso 1: Cargar catálogo en el event loop principal (acceso seguro a la BD)
    db_products = await _load_catalog_products(db, business_id)

    # Paso 1b: Resolver el proveedor IA activo para este negocio
    ai_provider, ai_api_key, ai_model = await LLMFactory.resolve(business_id, db)
    ai_client = LLMFactory.build_openai_compatible(ai_api_key, ai_provider)

    # Estado inicial del grafo
    initial_state = {
        "input_type": input_type,
        "raw_input": raw_input,
        "business_id": business_id,
        "db_products": db_products,
        "raw_text": "",
        "extracted_items": [],
        "matched_items": [],
        "validated_draft": {},
        "needs_review": False,
        "errors": [],
    }

    # Paso 2: Correr el grafo en el executor dedicado (hilo separado)
    # Se capturan las referencias al cliente/modelo para inyectarlas en el hilo
    def _run_graph_with_client():
        """Inyecta el cliente IA en el thread local y corre el grafo."""
        _thread_local.client = ai_client
        _thread_local.model = ai_model
        _thread_local.provider = ai_provider
        return _quote_graph.invoke(initial_state)

    loop = asyncio.get_event_loop()
    final_state = await loop.run_in_executor(
        _ai_executor,
        _run_graph_with_client,
    )

    # Paso 3: Armar respuesta final
    return {
        "draft": final_state.get("validated_draft", {}),
        "needs_review": final_state.get("needs_review", False),
        "errors": final_state.get("errors", []),
        "raw_text": final_state.get("raw_text", ""),  # Para debugging
    }


# ─────────────────────────────────────────────────────────────
# Función auxiliar: aprender término del cliente
# ─────────────────────────────────────────────────────────────
async def add_customer_term(
    product_id: str,
    new_term: str,
    db: AsyncSession,
) -> bool:
    """
    Agrega un nuevo término a customer_terms de un producto.
    Evita duplicados y normaliza el texto.

    Se llama cuando el usuario corrige un match del agente
    y confirma querer guardar el término para el futuro.
    """
    new_term = new_term.strip().lower()
    if not new_term:
        return False

    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.deleted_at.is_(None),
        )
    )
    product = result.scalar_one_or_none()

    if not product:
        return False

    # Obtener términos existentes y agregar el nuevo sin duplicar
    existing = product.customer_terms or ""
    existing_terms = {t.strip().lower() for t in existing.split(",") if t.strip()}

    if new_term in existing_terms:
        logger.info(
            f"[LearnTerm] Término '{new_term}' ya existe en producto {product_id}"
        )
        return True  # Ya existe, no es un error

    existing_terms.add(new_term)
    product.customer_terms = ", ".join(sorted(existing_terms))

    await db.commit()
    logger.info(f"[LearnTerm] Término '{new_term}' guardado en producto {product_id}")
    return True
