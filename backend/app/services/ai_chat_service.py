"""
Agente IA de Chat — OctopusTrack
==================================
Implementa un grafo LangGraph que recibe un mensaje de chat con historial
y lo rutea a uno de tres handlers según la intención detectada:

  START → intent_classifier → [route_by_intent]
                                    ├── "product_query" → product_lookup
                                    ├── "quote_request" → quote_request
                                    └── "general"       → chat_general
                                              └── format_response → END

Reutiliza el grafo existente _quote_graph de ai_quote_service.py para
procesar solicitudes de cotización sin duplicar lógica.

El grafo corre en el mismo ThreadPoolExecutor del módulo de presupuestos.
"""

import json
import logging
import re
from typing import Literal, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai_quote_service import (
    _ai_executor,
    _thread_local,
    _get_ai_client,
    _get_ai_model,
    _load_catalog_products,
    _search_candidates_in_memory,
    _quote_graph,
)
from app.services.llm_factory import LLMFactory

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Importaciones de LangGraph
# ─────────────────────────────────────────────────────────────
try:
    from langgraph.graph import StateGraph, START, END
except ImportError as e:
    raise ImportError(
        "LangGraph no está instalado. Ejecutá: pip install langgraph"
    ) from e

# ─────────────────────────────────────────────────────────────
# System prompt del asistente — personalidad y alcance
# ─────────────────────────────────────────────────────────────
ASSISTANT_SYSTEM_PROMPT = """Sos un asistente inteligente para un negocio (puede ser ferretería, sanitarios, corralón, o cualquier rubro comercial).
Tu nombre es Octo y hablás en español rioplatense, de manera amigable y directa.

Tus capacidades principales:
- Consultar precios y stock de productos del catálogo del negocio
- Crear presupuestos/cotizaciones a partir de listas de productos
- Responder preguntas generales sobre el negocio y sus productos

Reglas:
- Respondé SOLO lo que el usuario pregunta (si pide precio, solo el precio; si pide stock, solo el stock)
- Si encontrás productos similares, mostralos para que el usuario elija
- Cuando el usuario elige un producto, ofrecé crear una cotización con él
- Si no entendés algo, preguntá de forma amigable
- Respondé siempre en español rioplatense
- Sé conciso y útil, sin rodeos innecesarios
- No inventés precios ni stock — solo usá los datos del catálogo

Cuando el usuario pide un presupuesto con lista de productos, procesalo automáticamente.
Cuando el usuario pregunta por un producto específico, buscalo en el catálogo y mostrá lo solicitado."""


# ─────────────────────────────────────────────────────────────
# Heurísticas de fallback (sin LLM)
# ─────────────────────────────────────────────────────────────
PRICE_KEYWORDS = {
    "precio",
    "sale",
    "sale?",
    "sale??",
    "sale?",
    "sale",
    "cuanto",
    "cuánto",
    "valor",
    "costo",
}

STOCK_KEYWORDS = {
    "stock",
    "disponible",
    "tenes",
    "tenés",
    "hay",
    "queda",
    "quedan",
}

QUOTE_KEYWORDS = {
    "presupuesto",
    "cotiza",
    "cotizar",
    "cotizacion",
    "cotización",
    "armame",
    "haceme",
    "lista",
}

GREETING_KEYWORDS = {
    "hola",
    "buenas",
    "buen dia",
    "buen día",
    "que tal",
    "cómo va",
    "como va",
    "hey",
}

# Frases que siempre deben ir a chat_general independientemente de otras heurísticas
GENERAL_PHRASES = {
    "que podes hacer",
    "qué podés hacer",
    "que podés hacer",
    "qué podes hacer",
    "que sabes hacer",
    "qué sabés hacer",
    "para que sirves",
    "para qué servís",
    "ayuda",
    "help",
    "que sos",
    "qué sos",
    "quien sos",
    "quién sos",
}

REFINEMENT_KEYWORDS = {
    "mas barato",
    "más barato",
    "mas baratos",
    "más baratos",
    "barato",
    "baratos",
    "economico",
    "económico",
    "economicos",
    "económicos",
    "mostrame",
    "mostrame",
    "mostrame",
    "mostra",
    "solo",
    "de esos",
    "de esas",
    "de esos productos",
}


def _extract_search_terms_fallback(message: str) -> list[str]:
    """Extrae un término de búsqueda razonable cuando no hay clasificador LLM."""
    cleaned = message.strip()
    if not cleaned:
        return []

    cleaned = re.sub(r"[?¡!.,;:]", " ", cleaned.lower())
    cleaned = re.sub(
        r"\b(cuanto|cuánto|sale|precio|stock|tenes|tenés|hay|de|del|la|el|un|una)\b",
        " ",
        cleaned,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if cleaned:
        return [cleaned]

    return [message.strip()]


def _fallback_intent_classifier(message: str) -> tuple[str, dict]:
    """
    Clasificador heurístico para usar cuando falla el LLM.
    Prioriza responder consultas operativas (precio/stock/presupuesto)
    en lugar de devolver un error genérico.
    """
    text = message.lower().strip()

    # 1. Frases generales explícitas — siempre van a general, sin importar nada más
    if any(phrase in text for phrase in GENERAL_PHRASES):
        return "general", {}

    # 2. Saludos simples => general
    if any(g in text for g in GREETING_KEYWORDS):
        return "general", {}

    # 3. Refinamiento conversacional ("los más baratos", "mostrame 2", etc.)
    # Debe ir por product_query para poder reutilizar contexto previo.
    if _is_refinement_query(message):
        return "product_query", {
            "search_terms": [],
            "fields": "price",
        }

    # 4. Detectar intención de presupuesto (keywords muy específicos)
    if any(k in text for k in QUOTE_KEYWORDS):
        return "quote_request", {"raw_text": message.strip()}

    has_price = any(k in text for k in PRICE_KEYWORDS)
    has_stock = any(k in text for k in STOCK_KEYWORDS)

    # 5. Si consulta precio/stock, tratar como búsqueda de producto
    if has_price or has_stock:
        fields = (
            "both" if has_price and has_stock else "stock" if has_stock else "price"
        )
        return "product_query", {
            "search_terms": _extract_search_terms_fallback(message),
            "fields": fields,
        }

    # 6. Preguntas cortas de 1-5 palabras que parecen nombres de producto
    #    Excluimos frases interrogativas abiertas (qué, cómo, cuál, quién, etc.)
    question_words = {
        "que",
        "qué",
        "como",
        "cómo",
        "cual",
        "cuál",
        "quien",
        "quién",
        "donde",
        "dónde",
        "para",
        "podes",
        "podés",
        "sabes",
        "sabés",
    }
    words = [w for w in re.split(r"\s+", text) if w]
    first_word = words[0] if words else ""
    is_open_question = first_word in question_words or "?" in text

    if not is_open_question and 1 <= len(words) <= 5:
        return "product_query", {
            "search_terms": _extract_search_terms_fallback(message),
            "fields": "price",
        }

    # 7. Todo lo demás => general (LLM responde con contexto)
    return "general", {}


def _extract_limit_from_message(message: str, default: int = 5) -> int:
    match = re.search(r"\b(\d{1,2})\b", message)
    if not match:
        return default
    try:
        limit = int(match.group(1))
        return max(1, min(limit, 10))
    except Exception:
        return default


def _is_refinement_query(message: str) -> bool:
    msg = message.lower()
    return any(k in msg for k in REFINEMENT_KEYWORDS)


def _extract_products_from_history_context(
    history: list[dict], db_products: list[dict]
) -> list[dict]:
    """
    Busca marcador [PRODUCT_CONTEXT] en mensajes del asistente y reconstruye
    candidatos desde el catálogo actual.
    """
    if not history:
        return []

    by_code = {str(p.get("code", "")).strip().lower(): p for p in db_products}
    context_products: list[dict] = []
    seen: set[str] = set()

    for h in reversed(history):
        if h.get("role") != "assistant":
            continue

        content = str(h.get("content", ""))
        if "[PRODUCT_CONTEXT]" not in content:
            continue

        marker = content.split("[PRODUCT_CONTEXT]", 1)[1].strip()
        parts = [p.strip() for p in marker.split("||") if p.strip()]

        for part in parts:
            # Formato esperado: code:description:sale_price
            chunks = part.split(":")
            if not chunks:
                continue
            code = chunks[0].strip().lower()
            if not code:
                continue
            prod = by_code.get(code)
            if not prod:
                continue
            pid = str(prod.get("id", ""))
            if pid and pid not in seen:
                seen.add(pid)
                context_products.append(prod)

        if context_products:
            break

    return context_products


def _get_previous_user_query(history: list[dict], current_message: str) -> str:
    """Devuelve el último mensaje de usuario anterior al mensaje actual."""
    current_norm = (current_message or "").strip().lower()
    for h in reversed(history):
        if h.get("role") != "user":
            continue
        content = str(h.get("content", "")).strip()
        if not content:
            continue
        if content.lower() == current_norm:
            continue
        return content
    return ""


def _apply_refinement_over_products(message: str, products: list[dict]) -> list[dict]:
    if not products:
        return []

    msg = message.lower()
    limit = _extract_limit_from_message(message, default=5)

    ordered = list(products)
    if any(k in msg for k in ["barato", "baratos", "económico", "economico"]):
        ordered.sort(key=lambda p: float(p.get("sale_price") or 0))
    elif any(k in msg for k in ["caro", "caros", "premium"]):
        ordered.sort(key=lambda p: float(p.get("sale_price") or 0), reverse=True)

    return ordered[:limit]


# ─────────────────────────────────────────────────────────────
# Estado del grafo de chat
# ─────────────────────────────────────────────────────────────
class ChatAgentState(dict):
    """
    Estado compartido entre todos los nodos del grafo de chat.

    Entrada:
        message         — Mensaje actual del usuario
        history         — Últimos 10 mensajes [{role, content}]
        input_file      — Bytes de archivo adjunto (opcional)
        input_file_type — Tipo del archivo adjunto (opcional)
        business_id     — UUID del negocio
        db_products     — Catálogo en memoria (cargado antes del grafo)

    Clasificación:
        intent          — "product_query" | "quote_request" | "general"
        intent_params   — {"search_terms": [...], "fields": ["price","stock"]}

    Resultados (uno se rellena según intención):
        product_results — Lista de productos encontrados
        quote_draft     — Draft de cotización del grafo existente
        quote_guidance  — Sugerencias y preguntas para completar el presupuesto
        chat_response   — Texto de respuesta general

    Salida:
        response_type   — "text" | "products" | "quote"
        final_response  — Dict con la respuesta formateada
        errors          — Lista de errores no fatales
    """

    pass


def _build_quote_guidance(
    message: str,
    history: list[dict],
    quote_draft: dict,
) -> dict:
    """
    Construye una guía conversacional para iterar el presupuesto.
    No reemplaza el draft: agrega contexto para que el usuario complete datos faltantes.
    """
    draft = quote_draft.get("draft", {}) if isinstance(quote_draft, dict) else {}
    summary = draft.get("summary", {}) if isinstance(draft, dict) else {}
    items = draft.get("items", []) if isinstance(draft, dict) else []

    missing_fields: list[str] = []
    questions: list[str] = []

    user_context = " ".join(
        [message]
        + [str(h.get("content", "")) for h in history if h.get("role") == "user"]
    ).lower()

    # Cliente: detectamos señales básicas en el texto de la conversación.
    has_client_hint = bool(
        re.search(
            r"\b(cliente|raz[oó]n social|cuit|dni|consumidor final|empresa)\b",
            user_context,
        )
    )
    if not has_client_hint:
        missing_fields.append("client")
        questions.append("¿Para qué cliente querés armar la cotización?")

    # Cantidades: si hay items sin qty válida, pedir confirmación.
    has_invalid_qty = False
    for item in items:
        qty = item.get("qty")
        try:
            if qty is None or float(qty) <= 0:
                has_invalid_qty = True
                break
        except Exception:
            has_invalid_qty = True
            break

    if has_invalid_qty:
        missing_fields.append("quantities")
        questions.append("Hay ítems sin cantidad clara. ¿Me confirmás cantidades?")

    none_count = int(summary.get("none", 0) or 0)
    med_count = int(summary.get("med", 0) or 0)
    low_count = int(summary.get("low", 0) or 0)

    if none_count > 0:
        missing_fields.append("unmatched_products")
        questions.append(
            f"Tengo {none_count} ítem{'s' if none_count != 1 else ''} sin coincidencia exacta. "
            "¿Querés que te muestre alternativas por marca/medida?"
        )

    if med_count + low_count > 0:
        missing_fields.append("variant_confirmation")
        questions.append(
            f"Hay {med_count + low_count} ítem{'s' if med_count + low_count != 1 else ''} para revisar. "
            "¿Confirmamos variante (marca/línea/medida)?"
        )

    if not items:
        missing_fields.append("items")
        questions.append(
            "No pude extraer ítems válidos. ¿Me pasás la lista en formato 'cantidad + producto'?"
        )

    return {
        "missing_fields": missing_fields,
        "questions": questions,
        "is_complete": len(missing_fields) == 0,
    }


# ─────────────────────────────────────────────────────────────
# NODO 1: Clasificador de intención
# ─────────────────────────────────────────────────────────────
def node_intent_classifier(state: ChatAgentState) -> dict:
    """
    Nodo 1 — Intent Classifier.
    Usa el LLM con temperatura 0 para clasificar la intención del mensaje
    y extraer los parámetros necesarios para el handler correspondiente.

    Intenciones posibles:
    - "product_query"  → el usuario quiere precio, stock, o info de uno o más productos
    - "quote_request"  → el usuario quiere armar un presupuesto con lista de ítems
    - "general"        → cualquier otra consulta o conversación

    Devuelve:
        intent: str
        intent_params: dict con search_terms y fields según la intención
    """
    message = state.get("message", "")
    history = state.get("history", [])
    errors = list(state.get("errors", []))

    logger.info(f"[IntentClassifier] Clasificando: '{message[:80]}...'")

    # Heurística previa: evita depender del LLM para casos obvios
    heuristic_intent, heuristic_params = _fallback_intent_classifier(message)
    if heuristic_intent in {"product_query", "quote_request"}:
        logger.info(
            f"[IntentClassifier] Heurística directa → {heuristic_intent}, params={heuristic_params}"
        )
        return {
            "intent": heuristic_intent,
            "intent_params": heuristic_params,
            "errors": errors,
        }

    client = _get_ai_client()

    # Construir historial para contexto (últimos 5 mensajes)
    history_text = ""
    if history:
        recent = history[-5:]
        history_text = "\n".join(
            f"{m['role'].upper()}: {m['content'][:200]}" for m in recent
        )
        history_text = f"\nHistorial reciente:\n{history_text}\n"

    system_prompt = f"""Sos un clasificador de intenciones para un asistente de negocio.
Analizá el mensaje del usuario y clasificá su intención.{history_text}

Intenciones posibles:
1. "product_query"  — Quiere saber precio, stock, o información de uno o más productos
   Ejemplos: "precio de caño 1/2", "stock del codo 90", "cuánto sale la llave de paso", "tenés rosca 3/4?"
2. "quote_request"  — Quiere crear un presupuesto con una lista de ítems
   Ejemplos: "hacé un presupuesto con 5 caños y 2 roscas", "necesito cotizar: 3 codos, 1 llave"
3. "general"        — Saludo, pregunta general, consulta sobre el negocio, o cualquier otra cosa

Para "product_query", extraé los términos de búsqueda y qué campos mostrar.
fields posibles: "price" (precio), "stock" (stock disponible), "both" (precio y stock)
Si el usuario no especifica, asumí "price".

Respondé ÚNICAMENTE con JSON válido, sin markdown:
{{
  "intent": "product_query",
  "params": {{
    "search_terms": ["caño pp 1/2", "rosca 3/4"],
    "fields": "price"
  }}
}}

Para "quote_request":
{{
  "intent": "quote_request",
  "params": {{
    "raw_text": "5 caños pp 1/2, 2 roscas 3/4"
  }}
}}

Para "general":
{{
  "intent": "general",
  "params": {{}}
}}"""

    try:
        response = client.chat.completions.create(
            model=_get_ai_model(),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            max_tokens=300,
            temperature=0,  # Temperatura 0 para clasificación determinista
        )

        content = response.choices[0].message.content or "{}"
        content = re.sub(r"```json?\s*|\s*```", "", content).strip()
        result = json.loads(content)

        intent = result.get("intent", "general")
        intent_params = result.get("params", {})

        logger.info(f"[IntentClassifier] Intent: {intent}, params: {intent_params}")
        return {"intent": intent, "intent_params": intent_params, "errors": errors}

    except Exception as e:
        logger.error(f"[IntentClassifier] Error: {e}")
        errors.append(f"Error al clasificar intención: {str(e)}")
        fallback_intent, fallback_params = _fallback_intent_classifier(message)
        logger.info(
            f"[IntentClassifier] Fallback heurístico → {fallback_intent}, params={fallback_params}"
        )
        return {
            "intent": fallback_intent,
            "intent_params": fallback_params,
            "errors": errors,
        }


# ─────────────────────────────────────────────────────────────
# Edge condicional: rutea según la intención detectada
# ─────────────────────────────────────────────────────────────
def route_by_intent(
    state: ChatAgentState,
) -> Literal["product_lookup", "quote_request", "chat_general"]:
    """
    Edge condicional post-classifier.
    Mapea la intención a uno de los tres nodos handlers.
    Cualquier intención desconocida va a chat_general.
    """
    mapping = {
        "product_query": "product_lookup",
        "quote_request": "quote_request",
        "general": "chat_general",
    }
    intent = state.get("intent", "general")
    destination = mapping.get(intent, "chat_general")
    logger.info(f"[Router] {intent} → {destination}")
    return destination


# ─────────────────────────────────────────────────────────────
# NODO 2a: Product Lookup
# Busca productos en el catálogo según los términos extraídos
# ─────────────────────────────────────────────────────────────
def node_product_lookup(state: ChatAgentState) -> dict:
    """
    Nodo 2a — Product Lookup.
    Busca en el catálogo en memoria usando los search_terms del clasificador.
    Retorna hasta 5 productos ordenados por relevancia.
    Incluye solo los campos pedidos (price, stock, o ambos).

    Reutiliza _search_candidates_in_memory() del grafo de presupuestos.
    """
    intent_params = state.get("intent_params", {})
    db_products = state.get("db_products", [])
    history = state.get("history", [])
    message = state.get("message", "")
    errors = list(state.get("errors", []))

    search_terms = intent_params.get("search_terms", [])
    fields = intent_params.get("fields", "price")

    if not search_terms:
        # Si no hay términos, usar el mensaje completo como búsqueda
        search_terms = [message]

    logger.info(f"[ProductLookup] Buscando: {search_terms}, campos: {fields}")

    # Buscar candidatos para cada término y unificar por score
    all_candidates: dict[str, tuple[int, dict]] = {}

    for term in search_terms:
        candidates = _search_candidates_in_memory(term, db_products, limit=10)
        for i, candidate in enumerate(candidates):
            pid = candidate["id"]
            # Score inversamente proporcional al índice (mejor match = índice menor)
            score = len(candidates) - i
            if pid not in all_candidates or all_candidates[pid][0] < score:
                all_candidates[pid] = (score, candidate)

    # Ordenar por score y tomar los 5 mejores
    sorted_candidates = sorted(
        all_candidates.values(), key=lambda x: x[0], reverse=True
    )
    top_products = [c for _, c in sorted_candidates[:5]]

    # Si la búsqueda vino vacía pero parece refinamiento conversacional,
    # intentar sobre el contexto de productos previos.
    if not top_products and _is_refinement_query(message):
        context_products = _extract_products_from_history_context(history, db_products)
        top_products = _apply_refinement_over_products(message, context_products)

        # Fallback adicional: usar la última consulta del usuario como contexto.
        if not top_products:
            previous_query = _get_previous_user_query(history, message)
            if previous_query:
                prev_candidates = _search_candidates_in_memory(
                    previous_query, db_products, limit=20
                )
                top_products = _apply_refinement_over_products(message, prev_candidates)

    # Si sí hubo resultados pero el usuario pidió refinamiento (ej: "los más baratos, 2"),
    # aplicar orden y límite sobre esos candidatos.
    elif top_products and _is_refinement_query(message):
        top_products = _apply_refinement_over_products(message, top_products)

    # Filtrar campos según lo pedido
    product_results = []
    for p in top_products:
        result = {
            "id": p["id"],
            "code": p["code"],
            "description": p["description"],
            "unit": p["unit"],
        }
        if fields in ("price", "both"):
            result["sale_price"] = p["sale_price"]
            result["net_price"] = p["net_price"]
            result["iva_rate"] = p["iva_rate"]
        if fields in ("stock", "both"):
            # El catálogo en memoria no incluye stock por defecto
            # Se incluye como None si no está disponible
            result["stock"] = p.get("stock", None)

        product_results.append(result)

    logger.info(f"[ProductLookup] {len(product_results)} productos encontrados.")
    return {"product_results": product_results, "errors": errors}


# ─────────────────────────────────────────────────────────────
# NODO 2b: Quote Request
# Invoca el grafo de presupuestos existente con el texto del usuario
# ─────────────────────────────────────────────────────────────
def node_quote_request(state: ChatAgentState) -> dict:
    """
    Nodo 2b — Quote Request.
    Invoca el grafo existente _quote_graph con el mensaje como texto de entrada.
    Reutiliza TODO el pipeline de presupuestos sin modificarlo:
      ingester → extractor → matcher(fan-out) → validator

    Soporta también archivos adjuntos (imagen, audio, PDF, DOCX).
    """
    intent_params = state.get("intent_params", {})
    db_products = state.get("db_products", [])
    errors = list(state.get("errors", []))

    # Texto para el grafo de presupuestos
    raw_text = intent_params.get("raw_text", state.get("message", ""))

    # Si hay archivo adjunto, usarlo
    input_file = state.get("input_file")
    input_file_type = state.get("input_file_type")

    if input_file and input_file_type:
        input_type = input_file_type
        raw_input = input_file
    else:
        input_type = "text"
        raw_input = raw_text

    logger.info(f"[QuoteRequest] Invocando _quote_graph con type={input_type}")

    # Estado inicial para el grafo de presupuestos
    quote_initial_state = {
        "input_type": input_type,
        "raw_input": raw_input,
        "business_id": state.get("business_id", ""),
        "db_products": db_products,
        "raw_text": "",
        "extracted_items": [],
        "matched_items": [],
        "validated_draft": {},
        "needs_review": False,
        "errors": [],
    }

    try:
        # Invocar el grafo existente directamente (ya estamos en el executor)
        final_state = _quote_graph.invoke(quote_initial_state)
        quote_draft = {
            "draft": final_state.get("validated_draft", {}),
            "needs_review": final_state.get("needs_review", False),
            "errors": final_state.get("errors", []),
            "raw_text": final_state.get("raw_text", ""),
        }

        quote_guidance = _build_quote_guidance(
            message=state.get("message", ""),
            history=state.get("history", []),
            quote_draft=quote_draft,
        )

        quote_draft["guidance"] = quote_guidance

        logger.info("[QuoteRequest] Draft generado correctamente.")
        return {
            "quote_draft": quote_draft,
            "quote_guidance": quote_guidance,
            "errors": errors,
        }

    except Exception as e:
        logger.error(f"[QuoteRequest] Error en _quote_graph: {e}")
        errors.append(f"Error al generar el presupuesto: {str(e)}")
        return {"quote_draft": {}, "errors": errors}


# ─────────────────────────────────────────────────────────────
# NODO 2c: Chat General
# Responde preguntas generales como asistente del negocio
# ─────────────────────────────────────────────────────────────
def node_chat_general(state: ChatAgentState) -> dict:
    """
    Nodo 2c — Chat General.
    Usa el LLM con el historial de conversación para responder
    preguntas generales sobre el negocio o charla libre.
    """
    message = state.get("message", "")
    history = state.get("history", [])
    errors = list(state.get("errors", []))

    logger.info(f"[ChatGeneral] Respondiendo mensaje general.")

    # Respuestas rápidas sin LLM para saludos/preguntas abiertas
    lower = message.lower().strip()
    if any(g in lower for g in GREETING_KEYWORDS):
        return {
            "chat_response": (
                "¡Hola! Soy Octo 👋 Te ayudo con precios, stock y presupuestos. "
                "Probá con: 'precio de aireador de grifería' o 'armame presupuesto con 2 aireadores'."
            ),
            "errors": errors,
        }

    if any(phrase in lower for phrase in GENERAL_PHRASES):
        return {
            "chat_response": (
                "Puedo hacer 3 cosas:\n\n"
                "🔍 **Buscar precios y stock** — escribí el nombre del producto y te digo precio y disponibilidad. "
                "Ej: 'precio caño pp 1/2' o 'stock de válvula esférica'.\n\n"
                "📋 **Armar presupuestos** — dictame la lista y genero el preview automáticamente. "
                "Ej: 'armame presupuesto: 5 caños pp 1/2, 3 codos 90, 2 llaves de paso'.\n\n"
                "🛒 **Pasar a Ventas** — cuando tenés los productos, los mando directo al carrito de ventas.\n\n"
                "¿Por dónde empezamos?"
            ),
            "errors": errors,
        }

    client = _get_ai_client()

    # Construir mensajes con historial completo
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": ASSISTANT_SYSTEM_PROMPT}
    ]

    # Agregar historial (últimos 10 mensajes)
    for h in history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})

    # Agregar mensaje actual
    messages.append({"role": "user", "content": message})

    try:
        response = client.chat.completions.create(
            model=_get_ai_model(),
            messages=messages,
            max_tokens=1000,
            temperature=0.7,
        )

        chat_response = (
            response.choices[0].message.content or "No pude generar una respuesta."
        )
        logger.info("[ChatGeneral] Respuesta generada.")
        return {"chat_response": chat_response, "errors": errors}

    except Exception as e:
        logger.error(f"[ChatGeneral] Error LLM: {e}")
        errors.append(f"Error al generar respuesta: {str(e)}")
        return {
            "chat_response": "Lo siento, no pude procesar tu consulta. Intentá de nuevo.",
            "errors": errors,
        }


# ─────────────────────────────────────────────────────────────
# NODO 3: Format Response
# Normaliza la salida al formato AIChatResponse
# ─────────────────────────────────────────────────────────────
def node_format_response(state: ChatAgentState) -> dict:
    """
    Nodo 3 — Format Response.
    Convierte la salida de cualquiera de los tres handlers al formato
    AIChatResponse unificado que espera el frontend.

    - product_query → response_type="products", text=descripción, products=[...]
    - quote_request → response_type="quote",    text=resumen,     quote={...}
    - general       → response_type="text",     text=respuesta
    """
    intent = state.get("intent", "general")
    errors = list(state.get("errors", []))

    if intent == "product_query":
        product_results = state.get("product_results", [])
        intent_params = state.get("intent_params", {})
        fields = intent_params.get("fields", "price")

        if not product_results:
            final_response = {
                "response_type": "text",
                "text": "No encontré productos que coincidan con tu búsqueda. ¿Podés ser más específico?",
                "products": None,
                "quote": None,
            }
        else:
            # Generar texto descriptivo según la cantidad de resultados
            if len(product_results) == 1:
                p = product_results[0]
                if fields == "price":
                    text = f"Encontré **{p['description']}** (Cód: {p['code']}) a **${p.get('sale_price', 0):,.2f}** la {p['unit']}."
                elif fields == "stock":
                    stock = p.get("stock")
                    stock_txt = (
                        f"{stock} {p['unit']}"
                        if stock is not None
                        else "sin datos de stock"
                    )
                    text = f"**{p['description']}** tiene **{stock_txt}** disponible."
                else:
                    text = f"**{p['description']}** — Precio: ${p.get('sale_price', 0):,.2f} | Stock: {p.get('stock', 'N/D')} {p['unit']}."
            else:
                text = f"Encontré {len(product_results)} productos que pueden ser lo que buscás. ¿Cuál es el que necesitás?"

            final_response = {
                "response_type": "products",
                "text": text,
                "products": product_results,
                "quote": None,
            }

    elif intent == "quote_request":
        quote_draft = state.get("quote_draft", {})
        draft = quote_draft.get("draft", {})
        summary = draft.get("summary", {})
        total_items = draft.get("total_items", 0)
        needs_review = quote_draft.get("needs_review", False)

        if not draft or not draft.get("items"):
            text = "No pude generar el presupuesto. ¿Podés reescribir la lista de productos?"
            final_response = {
                "response_type": "text",
                "text": text,
                "products": None,
                "quote": None,
            }
        else:
            high = summary.get("high", 0)
            med = summary.get("med", 0)
            low = summary.get("low", 0)
            none_count = summary.get("none", 0)

            guidance = quote_draft.get("guidance", {})
            questions = (
                guidance.get("questions", []) if isinstance(guidance, dict) else []
            )

            if needs_review:
                text = (
                    f"Te armé un preview con {total_items} ítem{'s' if total_items != 1 else ''}. "
                    f"{high} con alta confianza, {med + low} para revisar y {none_count} sin coincidencia exacta."
                )
            else:
                text = (
                    f"Te armé el preview del presupuesto: {total_items} ítem"
                    f"{'s' if total_items != 1 else ''} detectado"
                    f"{'s' if total_items != 1 else ''}."
                )

            if questions:
                text += "\n\nPara completarlo bien necesito:"
                for q in questions[:3]:
                    text += f"\n- {q}"
                text += "\n\nSi querés, lo seguimos iterando acá y después lo pasamos a Ventas."
            else:
                text += "\n\nSi querés cambiar algo, lo editamos y después lo pasamos a Ventas."

            final_response = {
                "response_type": "quote",
                "text": text,
                "products": None,
                "quote": quote_draft,
            }

    else:
        # general
        chat_response = state.get("chat_response") or (
            "Estoy para ayudarte con precios, stock y presupuestos. "
            "Si querés, decime el producto exacto y te lo busco ahora."
        )
        final_response = {
            "response_type": "text",
            "text": chat_response,
            "products": None,
            "quote": None,
        }

    logger.info(f"[FormatResponse] response_type={final_response['response_type']}")
    return {"final_response": final_response, "errors": errors}


def _build_product_response_fallback(
    message: str, db_products: list[dict], history: list[dict] | None = None
) -> dict | None:
    """
    Salvataje final cuando el flujo principal termina en respuesta genérica.
    Intenta resolver como consulta de producto usando heurísticas + búsqueda en memoria.
    """
    intent, params = _fallback_intent_classifier(message)
    if intent != "product_query":
        return None

    fields = params.get("fields", "price")
    search_terms = params.get("search_terms") or [message]

    all_candidates: dict[str, tuple[int, dict]] = {}
    for term in search_terms:
        candidates = _search_candidates_in_memory(term, db_products, limit=10)
        for i, candidate in enumerate(candidates):
            pid = candidate["id"]
            score = len(candidates) - i
            if pid not in all_candidates or all_candidates[pid][0] < score:
                all_candidates[pid] = (score, candidate)

    sorted_candidates = sorted(
        all_candidates.values(), key=lambda x: x[0], reverse=True
    )
    top_products = [c for _, c in sorted_candidates[:5]]

    # Refinamiento conversacional sobre contexto previo
    if not top_products and _is_refinement_query(message):
        history = history or []
        context_products = _extract_products_from_history_context(history, db_products)
        top_products = _apply_refinement_over_products(message, context_products)

        if not top_products:
            previous_query = _get_previous_user_query(history, message)
            if previous_query:
                prev_candidates = _search_candidates_in_memory(
                    previous_query, db_products, limit=20
                )
                top_products = _apply_refinement_over_products(message, prev_candidates)

    elif top_products and _is_refinement_query(message):
        top_products = _apply_refinement_over_products(message, top_products)

    if not top_products:
        return {
            "response_type": "text",
            "text": "No encontré ese producto en el catálogo. Si querés, probá con otra descripción o código.",
            "products": None,
            "quote": None,
        }

    product_results = []
    for p in top_products:
        item = {
            "id": p["id"],
            "code": p["code"],
            "description": p["description"],
            "unit": p["unit"],
        }
        if fields in ("price", "both"):
            item["sale_price"] = p["sale_price"]
            item["net_price"] = p["net_price"]
            item["iva_rate"] = p["iva_rate"]
        if fields in ("stock", "both"):
            item["stock"] = p.get("stock", None)
        product_results.append(item)

    if len(product_results) == 1:
        p = product_results[0]
        if fields == "stock":
            stock = p.get("stock")
            stock_txt = (
                f"{stock} {p['unit']}" if stock is not None else "sin datos de stock"
            )
            text = f"Encontré **{p['description']}**. Stock: **{stock_txt}**."
        elif fields == "both":
            text = f"Encontré **{p['description']}**. Precio: **${p.get('sale_price', 0):,.2f}** | Stock: **{p.get('stock', 'N/D')} {p['unit']}**."
        else:
            text = f"Encontré **{p['description']}** a **${p.get('sale_price', 0):,.2f}** la {p['unit']}."
    else:
        text = f"Encontré {len(product_results)} productos parecidos. Elegí el correcto y te ayudo a cotizarlo."

    return {
        "response_type": "products",
        "text": text,
        "products": product_results,
        "quote": None,
    }


def _build_quote_draft_without_llm(message: str, db_products: list[dict]) -> dict:
    """
    Fallback determinístico para armar preview de cotización cuando falla el LLM.
    Extrae patrones simples "cantidad + descripción" y matchea en memoria.
    """
    cleaned = re.sub(
        r"^\s*(presupuesto|cotizaci[oó]n|cotizar)\s*:?\s*",
        "",
        message,
        flags=re.IGNORECASE,
    )
    parts = [p.strip() for p in re.split(r",|\sy\s", cleaned) if p.strip()]

    extracted_items: list[dict] = []
    for p in parts:
        m = re.match(r"^(\d+(?:[\.,]\d+)?)\s+(.+)$", p)
        if m:
            qty = float(m.group(1).replace(",", "."))
            desc = m.group(2).strip()
            extracted_items.append(
                {
                    "qty": qty,
                    "unit": "unidad",
                    "description": desc,
                    "raw_original": p,
                }
            )

    if not extracted_items:
        return {
            "draft": {},
            "needs_review": True,
            "errors": ["No se pudieron extraer ítems"],
        }

    validated_items = []
    subtotal = 0.0

    for item in extracted_items:
        candidates = _search_candidates_in_memory(
            item["description"], db_products, limit=3
        )
        product = candidates[0] if candidates else None
        confidence = "HIGH" if product else "NONE"

        unit_price = float(product.get("sale_price", 0)) if product else 0.0
        total = float(item["qty"]) * unit_price
        subtotal += total

        validated_items.append(
            {
                "item": item,
                "product": product,
                "confidence": confidence,
                "confidence_score": 1.0 if product else 0.0,
                "alternatives": candidates[1:] if len(candidates) > 1 else [],
                "match_reason": "fallback_in_memory_match"
                if product
                else "fallback_no_match",
                "qty": float(item["qty"]),
                "unit_price": unit_price,
                "total": total,
            }
        )

    summary = {
        "high": sum(1 for i in validated_items if i["confidence"] == "HIGH"),
        "med": 0,
        "low": 0,
        "none": sum(1 for i in validated_items if i["confidence"] == "NONE"),
    }

    draft = {
        "items": validated_items,
        "subtotal": round(subtotal, 2),
        "summary": summary,
        "total_items": len(validated_items),
    }
    needs_review = summary["none"] > 0

    return {
        "draft": draft,
        "needs_review": needs_review,
        "errors": [],
        "raw_text": message,
    }


# ─────────────────────────────────────────────────────────────
# Construcción y compilación del grafo de chat
# ─────────────────────────────────────────────────────────────
def _build_chat_graph():
    """
    Construye y compila el grafo LangGraph del asistente de chat.

    Arquitectura:
        START → intent_classifier → [route_by_intent]
                                        ├── product_lookup  ─┐
                                        ├── quote_request   ─┤→ format_response → END
                                        └── chat_general    ─┘
    """
    builder = StateGraph(dict)

    # Registrar nodos
    builder.add_node("intent_classifier", node_intent_classifier)
    builder.add_node("product_lookup", node_product_lookup)
    builder.add_node("quote_request", node_quote_request)
    builder.add_node("chat_general", node_chat_general)
    builder.add_node("format_response", node_format_response)

    # Edge de entrada
    builder.add_edge(START, "intent_classifier")

    # Edge condicional: clasificador → handler
    builder.add_conditional_edges(
        "intent_classifier",
        route_by_intent,
        {
            "product_lookup": "product_lookup",
            "quote_request": "quote_request",
            "chat_general": "chat_general",
        },
    )

    # Todos los handlers van a format_response
    builder.add_edge("product_lookup", "format_response")
    builder.add_edge("quote_request", "format_response")
    builder.add_edge("chat_general", "format_response")

    # Fin del grafo
    builder.add_edge("format_response", END)

    return builder.compile()


# Grafo compilado — singleton, se crea una vez al importar el módulo
_chat_graph = _build_chat_graph()


# ─────────────────────────────────────────────────────────────
# Función principal: corre el grafo de chat en hilo separado
# ─────────────────────────────────────────────────────────────
async def run_chat_agent(
    message: str,
    history: list[dict],
    business_id: str,
    db: AsyncSession,
    input_file: bytes | None = None,
    input_file_type: str | None = None,
) -> dict:
    """
    Punto de entrada del agente de chat.

    1. Carga el catálogo de productos desde la BD (en el event loop de FastAPI)
    2. Resuelve el proveedor IA activo
    3. Lanza el grafo _chat_graph en el ThreadPoolExecutor dedicado
    4. Retorna la respuesta formateada

    Args:
        message         — Mensaje actual del usuario
        history         — Últimos 10 mensajes [{role, content}]
        business_id     — UUID del negocio
        db              — Sesión async de SQLAlchemy
        input_file      — Bytes del archivo adjunto (opcional)
        input_file_type — Tipo del archivo ("image"|"audio"|"pdf"|"docx")

    Returns:
        dict con {response_type, text, products?, quote?}
    """
    import asyncio

    # Cargar catálogo en el event loop principal (acceso seguro a la BD)
    db_products = await _load_catalog_products(db, business_id)

    # Resolver proveedor IA activo para este negocio
    ai_provider, ai_api_key, ai_model = await LLMFactory.resolve(business_id, db)
    ai_client = LLMFactory.build_openai_compatible(ai_api_key, ai_provider)

    # Estado inicial del grafo
    initial_state = {
        "message": message,
        "history": history,
        "input_file": input_file,
        "input_file_type": input_file_type,
        "business_id": business_id,
        "db_products": db_products,
        "intent": "",
        "intent_params": {},
        "product_results": [],
        "quote_draft": {},
        "chat_response": "",
        "response_type": "",
        "final_response": {},
        "errors": [],
    }

    def _run_graph_with_client():
        """Inyecta el cliente IA en el thread local y corre el grafo."""
        _thread_local.client = ai_client
        _thread_local.model = ai_model
        _thread_local.provider = ai_provider
        return _chat_graph.invoke(initial_state)

    loop = asyncio.get_event_loop()
    final_state = await loop.run_in_executor(
        _ai_executor,
        _run_graph_with_client,
    )

    response = final_state.get("final_response", {})
    errors = final_state.get("errors", [])

    # Asegurar que siempre hay una respuesta válida
    if not response:
        response = {
            "response_type": "text",
            "text": "Ocurrió un error procesando tu consulta. Intentá de nuevo.",
            "products": None,
            "quote": None,
        }

    # Salvataje final: evitar respuestas genéricas cuando el usuario pregunta productos
    generic_text = (response.get("text") or "").lower()
    looks_generic = response.get("response_type") == "text" and (
        "no pude responder" in generic_text
        or "estoy para ayudarte" in generic_text
        or "ocurrió un error" in generic_text
        or "no encontré productos" in generic_text
    )

    if looks_generic and message.strip():
        fallback_intent, _fallback_params = _fallback_intent_classifier(message)

        if fallback_intent == "product_query":
            fallback_response = _build_product_response_fallback(
                message, db_products, history
            )
            if fallback_response:
                logger.info("[ChatAgent] Aplicando fallback final de product lookup.")
                response = fallback_response

        elif fallback_intent == "quote_request":
            logger.info("[ChatAgent] Aplicando fallback final de quote request.")

            def _run_quote_fallback():
                _thread_local.client = ai_client
                _thread_local.model = ai_model
                _thread_local.provider = ai_provider

                quote_state = {
                    "input_type": "text",
                    "input_file": None,
                    "raw_text": message,
                    "business_id": business_id,
                    "db_products": db_products,
                    "extracted_items": [],
                    "matched_items": [],
                    "validated_draft": {},
                    "needs_review": False,
                    "errors": [],
                }

                quote_final_state = _quote_graph.invoke(quote_state)
                quote_draft = {
                    "draft": quote_final_state.get("validated_draft", {}),
                    "needs_review": quote_final_state.get("needs_review", False),
                    "errors": quote_final_state.get("errors", []),
                    "raw_text": quote_final_state.get("raw_text", ""),
                }

                guidance = _build_quote_guidance(
                    message=message,
                    history=history,
                    quote_draft=quote_draft,
                )
                quote_draft["guidance"] = guidance

                draft = quote_draft.get("draft", {})
                summary = draft.get("summary", {})
                total_items = draft.get("total_items", 0)
                needs_review = quote_draft.get("needs_review", False)

                if not draft or not draft.get("items"):
                    quote_draft = _build_quote_draft_without_llm(message, db_products)
                    draft = quote_draft.get("draft", {})

                    if not draft or not draft.get("items"):
                        return {
                            "response_type": "text",
                            "text": "No pude generar el presupuesto. ¿Podés reescribir la lista de productos?",
                            "products": None,
                            "quote": None,
                        }

                    guidance = _build_quote_guidance(
                        message=message,
                        history=history,
                        quote_draft=quote_draft,
                    )
                    quote_draft["guidance"] = guidance
                    return {
                        "response_type": "quote",
                        "text": "Te armé un preview inicial con matching automático. Revisemos juntos los datos faltantes.",
                        "products": None,
                        "quote": quote_draft,
                    }

                high = summary.get("high", 0)
                med = summary.get("med", 0)
                low = summary.get("low", 0)
                none_count = summary.get("none", 0)

                if needs_review:
                    text = (
                        f"Te armé un preview con {total_items} ítem{'s' if total_items != 1 else ''}. "
                        f"{high} con alta confianza, {med + low} para revisar y {none_count} sin coincidencia exacta."
                    )
                else:
                    text = (
                        f"Te armé el preview del presupuesto: {total_items} ítem"
                        f"{'s' if total_items != 1 else ''} detectado"
                        f"{'s' if total_items != 1 else ''}."
                    )

                questions = guidance.get("questions", [])
                if questions:
                    text += "\n\nPara completarlo bien necesito:"
                    for q in questions[:3]:
                        text += f"\n- {q}"
                    text += "\n\nSi querés, lo seguimos iterando acá y después lo pasamos a Ventas."

                return {
                    "response_type": "quote",
                    "text": text,
                    "products": None,
                    "quote": quote_draft,
                }

            response = await loop.run_in_executor(_ai_executor, _run_quote_fallback)

    if errors:
        logger.warning(f"[ChatAgent] Errores no fatales: {errors}")

    return response
