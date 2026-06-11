"""
Agente Luci — OctopusTrack
===========================
Arquitectura: LLM como orquestador central con grafo LangGraph.

Flujo:
  START → node_classify → route_by_intent
            ├── "greeting"           → node_respond_static → END
            ├── "about_luci"         → node_respond_static → END
            ├── "no_llm"             → node_respond_static → END
            ├── "product_query"      → node_retrieve → node_respond → END
            ├── "refinement"         → node_retrieve → node_respond → END
            ├── "multi_item_query"   → node_multi_lookup → node_respond → END
            ├── "multi_item_confirm" → node_multi_confirm → node_respond → END
            ├── "quote_intent"       → node_respond_llm → END
            ├── "quote_with_items"   → node_quote_graph → node_respond → END
            ├── "stock_alert"        → node_stock_alert → END
            ├── "stagnant_products"  → node_stagnant_products → END
            ├── "sales_analytics"    → node_sales_analytics → END
            ├── "memory_recall"      → node_memory_recall → END
            └── "general"            → node_respond_llm → END

El clasificador usa el modelo rápido/barato del proveedor (ej: gpt-4o-mini)
independientemente del modelo principal configurado por el usuario.
Si no hay LLM configurado solo responde saludos hardcodeados.

El grafo de presupuestos (ai_quote_service._quote_graph) se invoca
como subrutina dentro de node_quote_graph sin modificaciones.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession
from typing_extensions import TypedDict

from app.services.ai_quote_service import (
    _ai_executor,
    _load_catalog_products,
    _quote_graph,
    _search_candidates_in_memory,
    _thread_local,
)
from app.services.ai_business_tools import (
    get_low_stock_products,
    get_stagnant_products,
    get_sales_summary,
)
from app.config import get_settings
from app.services.ai_memory_service import get_business_memory_context, save_aggregate_memory
from app.services.llm_factory import LLMFactory

logger = logging.getLogger(__name__)

try:
    from langgraph.graph import END, START, StateGraph
except ImportError as e:
    raise ImportError("LangGraph no está instalado. Ejecutá: pip install langgraph") from e

# ─────────────────────────────────────────────────────────────
# Estado del grafo
# ─────────────────────────────────────────────────────────────


class ChatState(TypedDict):
    # Entrada
    message: str
    history: list[dict]
    user_name: str
    memory_context: str
    db_products: list[dict]

    # Clientes IA
    ai_client: Any  # Cliente principal (para respuestas)
    ai_model: str
    ai_provider: str
    classifier_client: Any  # Cliente rápido (para clasificación)
    classifier_model: str
    has_llm: bool  # False → solo respuestas hardcodeadas

    # Contexto del negocio
    business_id: str
    db: Any  # AsyncSession, para queries bajo demanda

    # Precargados al inicio
    low_stock_products: list[dict]
    stagnant_products_list: list[dict]
    sales_summaries: dict  # {month, quarter, year} → summary dict

    # Intent clasificado
    intent: str
    intent_params: dict

    # Resultados intermedios
    retrieved_products: list[dict]
    multi_context: dict | None  # Estado pendiente multi-ítem
    quote_draft: dict | None

    # Respuesta final
    response_type: str
    response_text: str
    response_products: list[dict] | None
    response_quote: dict | None
    response_cart_items: list[dict] | None


# ─────────────────────────────────────────────────────────────
# Keywords y constantes
# ─────────────────────────────────────────────────────────────

_GREETING_KW = frozenset(
    {
        "hola",
        "buenas",
        "buen dia",
        "buen día",
        "que tal",
        "qué tal",
        "como va",
        "cómo va",
        "hey",
        "buenas tardes",
        "buenas noches",
        "todo bien",
        "como estas",
        "cómo estás",
        "como andas",
        "cómo andás",
        "como av",
    }
)

_ABOUT_KW = frozenset(
    {
        "como te llamas",
        "cómo te llamás",
        "como te llamás",
        "quien sos",
        "quién sos",
        "que sos",
        "qué sos",
        "cual es tu nombre",
        "cuál es tu nombre",
        "que podes hacer",
        "qué podés hacer",
        "para que sirves",
        "ayuda",
        "help",
    }
)

_ITEM_SEPARATORS = re.compile(r",\s*|\s+y\s+|\s+e\s+|\n+")

_INTENT_PREFIXES = re.compile(
    r"^\s*(?:quiero|necesito|dame|deme|traeme|trae|busca|buscame|conseguime|"
    r"anotame|anota|agregame|agrega|poneme|pone|poner|agregar|"
    r"quisiera|me gustaria|me gustaría|tenes|tenés|tienen|hay)\s+",
    re.IGNORECASE,
)

_QTY_PATTERN = re.compile(
    r"^(?:(\d+(?:[.,]\d+)?)\s+(?:de\s+|x\s*)?)?(.+?)(?:\s+x\s*(\d+(?:[.,]\d+)?))?$",
    re.IGNORECASE,
)

# Markers internos del protocolo — no deben venir del usuario
_MARKER_INJECTION_RE = re.compile(
    r"\[(?:MULTI_CONTEXT|PRODUCT_CONTEXT|QUOTE_INTENT)\].*",
    re.IGNORECASE | re.DOTALL,
)
_MAX_INPUT_LEN = 2000

# ─────────────────────────────────────────────────────────────
# Sanitización de input
# ─────────────────────────────────────────────────────────────


def _sanitize_user_message(text: str) -> str:
    """Strip protocol markers injected by the user and enforce length cap."""
    return _MARKER_INJECTION_RE.sub("", text)[:_MAX_INPUT_LEN].strip()


def _sanitize_history(history: list[dict]) -> list[dict]:
    """Strip injection markers from user turns and cap content length on all turns."""
    result = []
    for item in history:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", ""))[:_MAX_INPUT_LEN]
        if item.get("role") == "user":
            content = _MARKER_INJECTION_RE.sub("", content)
        result.append({**item, "content": content})
    return result


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


def _normalize(text: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def _is_pure_greeting(text: str) -> bool:
    """
    Evita rutear como saludo mensajes mixtos como:
    - "hola, precio de canilla"
    - "buenas necesito 2 codos"
    """
    if not any(g in text for g in _GREETING_KW):
        return False

    intent_hints = (
        "precio",
        "stock",
        "cuanto",
        "cuánto",
        "sale",
        "presupuesto",
        "cotiza",
        "cotizar",
        "anotame",
        "agrega",
        "agregame",
        "quiero",
        "necesito",
        "dame",
        "busca",
    )

    if any(h in text for h in intent_hints):
        return False

    return len(text.split()) <= 5


def _format_price(value: Any) -> str:
    try:
        return f"${float(value):,.2f}"
    except (TypeError, ValueError):
        return "sin precio"


def _slim_product(p: dict) -> dict:
    return {
        "id": p.get("id", ""),
        "code": p.get("code", ""),
        "description": p.get("description", ""),
        "unit": p.get("unit", "unidad"),
        "sale_price": p.get("sale_price"),
        "net_price": p.get("net_price"),
        "iva_rate": p.get("iva_rate"),
    }


def _enrich_product(slim: dict, db_products: list[dict]) -> dict:
    pid = slim.get("id")
    if pid:
        for p in db_products:
            if str(p.get("id")) == str(pid):
                return p
    return slim


def _parse_item_with_qty(raw: str) -> tuple[float | None, str]:
    raw = _INTENT_PREFIXES.sub("", raw.strip()).strip()
    m = _QTY_PATTERN.match(raw)
    if not m:
        return None, raw
    qty_prefix, term, qty_suffix = m.group(1), m.group(2).strip(), m.group(3)
    qty: float | None = None
    for q in (qty_prefix, qty_suffix):
        if q:
            try:
                qty = float(q.replace(",", "."))
                break
            except ValueError:
                pass
    return qty, term or raw


def _extract_multi_context(history: list[dict]) -> dict | None:
    for h in reversed(history):
        if h.get("role") != "assistant":
            continue
        content = str(h.get("content", ""))
        if "[MULTI_CONTEXT]" not in content:
            continue
        try:
            return json.loads(content.split("[MULTI_CONTEXT]", 1)[1].strip())
        except Exception:
            return None
    return None


def _get_last_single_product(history: list[dict], db_products: list[dict]) -> dict | None:
    """
    Retorna el producto si el último mensaje del asistente mostró exactamente 1 producto.
    Busca en estos formatos (en orden):
      1. Campo 'products' del historial (response_type=products, 1 solo ítem)
      2. Marcador [PRODUCT_CONTEXT] en el texto con 1 solo ítem
      3. [MULTI_CONTEXT] con exactamente 1 ítem resuelto (needs_qty o clear)
    """
    by_id = {str(p.get("id", "")): p for p in db_products}
    by_code = {str(p.get("code", "")).strip().lower(): p for p in db_products}

    for h in reversed(history):
        if h.get("role") != "assistant":
            continue

        # 1. Campo products como lista (enviado por getHistoryForAPI del frontend)
        raw_products = h.get("products") or h.get("product_results")
        if raw_products and isinstance(raw_products, list) and len(raw_products) == 1:
            rp = raw_products[0]
            if isinstance(rp, dict):
                prod = by_id.get(str(rp.get("id", ""))) or by_code.get(
                    str(rp.get("code", "")).lower()
                )
                if prod:
                    return prod

        content = str(h.get("content", ""))

        # 2. [PRODUCT_CONTEXT] con un solo ítem
        if "[PRODUCT_CONTEXT]" in content:
            marker = content.split("[PRODUCT_CONTEXT]", 1)[1].strip()
            parts = [p.strip() for p in marker.split("||") if p.strip()]
            if len(parts) == 1:
                code = parts[0].split(":")[0].strip().lower()
                prod = by_code.get(code)
                if prod:
                    return prod

        # 3. [MULTI_CONTEXT] con exactamente 1 ítem resuelto
        if "[MULTI_CONTEXT]" in content:
            try:
                ctx = json.loads(content.split("[MULTI_CONTEXT]", 1)[1].strip())
                items = ctx.get("items", [])
                resolved = [i for i in items if i.get("chosen") and i.get("status") != "not_found"]
                if len(resolved) == 1:
                    chosen = resolved[0]["chosen"]
                    pid = str(chosen.get("id", ""))
                    code = str(chosen.get("code", "")).lower()
                    return by_id.get(pid) or by_code.get(code) or chosen
            except Exception:
                pass

        break  # Solo miramos el último mensaje del asistente

    return None


def _has_quote_intent_pending(history: list[dict]) -> bool:
    """
    Detecta si el último mensaje del asistente contiene [QUOTE_INTENT],
    lo que indica que Luci pidió al usuario que liste los productos
    para un presupuesto y todavía no los recibió.
    """
    for h in reversed(history):
        role = h.get("role", "")
        if role == "user":
            # Si el usuario ya respondió después del [QUOTE_INTENT], no está pendiente
            return False
        if role == "assistant":
            if "[QUOTE_INTENT]" in str(h.get("content", "")):
                return True
    return False


def _get_products_from_history(history: list[dict], db_products: list[dict]) -> list[dict]:
    by_id = {str(p.get("id", "")): p for p in db_products}
    by_code = {str(p.get("code", "")).strip().lower(): p for p in db_products}
    for h in reversed(history):
        if h.get("role") != "assistant":
            continue
        raw_products = h.get("products") or h.get("product_results")
        if raw_products and isinstance(raw_products, list):
            found, seen = [], set()
            for rp in raw_products:
                if not isinstance(rp, dict):
                    continue
                prod = by_id.get(str(rp.get("id", ""))) or by_code.get(
                    str(rp.get("code", "")).lower()
                )
                if prod and str(prod.get("id")) not in seen:
                    seen.add(str(prod.get("id")))
                    found.append(prod)
            if found:
                return found
        content = str(h.get("content", ""))
        if "[PRODUCT_CONTEXT]" in content:
            marker = content.split("[PRODUCT_CONTEXT]", 1)[1].strip()
            found, seen = [], set()
            for part in marker.split("||"):
                code = part.strip().split(":")[0].strip().lower()
                prod = by_code.get(code)
                if prod and str(prod.get("id")) not in seen:
                    seen.add(str(prod.get("id")))
                    found.append(prod)
            if found:
                return found
    return []


def _get_prev_user_query(history: list[dict], current: str) -> str:
    norm = current.strip().lower()
    for h in reversed(history):
        if h.get("role") != "user":
            continue
        content = str(h.get("content", "")).strip()
        if content and content.lower() != norm:
            return content
    return ""


def _apply_refinement(message: str, products: list[dict]) -> list[dict]:
    if not products:
        return []
    msg = _normalize(message)
    ordered = list(products)

    is_cheap = any(
        k in msg
        for k in (
            "barato",
            "barata",
            "baratos",
            "baratas",
            "economico",
            "economica",
            "mas barato",
            "mas barata",
        )
    )
    is_expensive = any(
        k in msg for k in ("caro", "cara", "caros", "caras", "premium", "mas caro", "mas cara")
    )

    if is_cheap:
        ordered.sort(key=lambda p: float(p.get("sale_price") or 0))
    elif is_expensive:
        ordered.sort(key=lambda p: float(p.get("sale_price") or 0), reverse=True)

    singular_kw = (
        "el mas",
        "la mas",
        "el más",
        "la más",
        "el primero",
        "la primera",
        "el segundo",
        "la segunda",
        "el ultimo",
        "la ultima",
        "ese",
        "esa",
    )
    is_singular = any(k in msg for k in singular_kw)

    if is_singular:
        return ordered[:1]
    limit_m = re.search(r"\b(\d{1,2})\b", message)
    limit = max(1, min(int(limit_m.group(1)), 10)) if limit_m else 5
    return ordered[:limit]


# ─────────────────────────────────────────────────────────────
# Prompt del clasificador
# ─────────────────────────────────────────────────────────────

_CLASSIFIER_SYSTEM = """Sos el clasificador de intenciones de Luci, asistente de ferretería argentina.
Analizá el mensaje del usuario y el historial y devolvé ÚNICAMENTE un JSON válido con el intent.

INTENTS disponibles:
- "greeting"           → saludo, cómo estás, conversación casual
- "about_luci"         → preguntan quién es Luci, qué hace, su nombre, cómo la pueden usar
- "product_query"      → buscar precio/stock de UN producto específico
                         params: {"term": "nombre exacto del producto", "fields": "price|stock|both"}
- "multi_item_query"   → lista de DOS O MÁS productos (con o sin cantidades)
                         params: {"items": [{"term": "...", "qty": null}]}
- "multi_item_confirm" → el usuario responde a opciones/cantidades pendientes
                         SOLO si hay [MULTI_CONTEXT] en el historial del asistente
- "add_to_cart"        → el usuario quiere agregar al carrito un producto que Luci YA mostró
                         Mensajes típicos: "anotame 3", "quiero 2", "dame 1", "x2", "agrego 5"
                         SOLO cuando el último mensaje del asistente mostró UN producto específico
                         params: {"qty": número}
- "refinement"         → refinar resultados previos: "la más barata", "el primero", "dame 2"
                         params: {"filter": "cheapest|most_expensive|first|last|nth", "n": 1}
- "quote_intent"       → quiere hacer un presupuesto pero NO especificó productos todavía
- "quote_with_items"   → quiere presupuesto Y ya listó los productos en el mensaje
                         params: {"raw_text": "texto completo con los productos"}
- "stock_alert"        → quiere saber qué productos tienen stock bajo o agotado
                         params: {}
- "stagnant_products"  → productos que no se vendieron hace mucho tiempo
                         params: {"days": 90}
- "sales_analytics"    → resumen de ventas, qué se vende más/menos, revenue
                          params: {"period": "month|quarter|year"}
- "memory_recall"      → preguntan qué recordás de algo, qué sabe Luci del usuario/negocio,
                          "qué te acordás", "buscá en Engram", "buscá en tu memoria",
                          "qué sabés de...", consultas sobre memoria persistente
                          params: {"query": "texto de la consulta"}
- "general"            → cualquier otra consulta, pregunta libre

Reglas importantes:
- Si el mensaje tiene 2+ productos separados por comas o "y" → SIEMPRE "multi_item_query"
- Si hay [MULTI_CONTEXT] en el historial y el usuario responde con números/opciones → "multi_item_confirm"
- "anotame N", "quiero N", "dame N", "x N" después de ver 1 producto → "add_to_cart"
- "presupuesto", "cotización", "cotizar" sin productos → "quote_intent"
- "presupuesto" con lista de productos → "quote_with_items"
- "precio de X", "cuánto sale X", "tenés X", "hay X", "stock de X", "cuánto stock hay de X" → "product_query"
  (el usuario pregunta por UN producto específico)
- "stock bajo", "qué falta", "productos agotados", "qué hay que reponer", "productos con menos/más/bajo stock", "pasame X productos con (menos|más) stock", "cuáles tienen (menos|más) stock" → "stock_alert"
  (el usuario pregunta por LOS productos en general, no por uno específico)
- "productos parados", "sin movimiento", "no se vendió", "estancados" → "stagnant_products"
- "ventas del mes", "qué se vendió más", "resumen de ventas", "facturación" → "sales_analytics"
- Mensajes MUY CORTOS de 1-2 palabras como "sí", "no", "dale", "ok", "claro", "si", "np" que responden a la pregunta anterior del asistente → "general"
- "guardá en engram", "guardá esto", "anotalo", "acordate", "recordalo", "memoria" SIN preguntar por el contenido → "general" (el sistema guarda automáticamente)

Respondé SOLO con JSON. Ejemplos:
{"intent": "product_query", "params": {"term": "canilla jardín 1/2", "fields": "price"}}
{"intent": "multi_item_query", "params": {"items": [{"term": "canilla jardín", "qty": 2}, {"term": "depósito ferrum", "qty": 1}]}}
{"intent": "add_to_cart", "params": {"qty": 3}}
{"intent": "quote_intent", "params": {}}
{"intent": "refinement", "params": {"filter": "cheapest", "n": 1}}
{"intent": "greeting", "params": {}}
{"intent": "stock_alert", "params": {}}
{"intent": "stagnant_products", "params": {"days": 90}}
{"intent": "sales_analytics", "params": {"period": "month"}}"""


def _classify_with_llm(
    message: str,
    history: list[dict],
    client: Any,
    model: str,
) -> tuple[str, dict]:
    """Clasifica el intent usando el LLM rápido. Retorna (intent, params)."""
    # Preparar historial resumido (últimos 4 mensajes, sin datos pesados)
    history_summary = []
    for h in history[-4:]:
        content = str(h.get("content", ""))
        # Mantener el marcador MULTI_CONTEXT pero truncar el JSON
        if "[MULTI_CONTEXT]" in content:
            content = content.split("[MULTI_CONTEXT]")[0].strip() + "\n[MULTI_CONTEXT] <pendiente>"
        elif len(content) > 200:
            content = content[:200] + "..."
        history_summary.append(f"{h['role']}: {content}")

    history_text = "\n".join(history_summary) if history_summary else "(sin historial)"

    prompt = f'Historial reciente:\n{history_text}\n\nMensaje actual del usuario: "{message}"'

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _CLASSIFIER_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            max_tokens=150,
            temperature=0,
            timeout=4,
        )
        raw = resp.choices[0].message.content or "{}"
        raw = re.sub(r"```json?\s*|\s*```", "", raw).strip()
        data = json.loads(raw)
        intent = data.get("intent", "general")
        params = data.get("params", {}) or {}
        logger.info(f"[Luci/classifier] LLM → intent={intent!r}, params={params}")

        # Validación: si el LLM devuelve quote_with_items pero el mensaje
        # parece solo un ítem o una búsqueda simple, corregir a multi_item_query
        # o product_query según la heurística
        valid_intents = {
            "greeting",
            "about_luci",
            "product_query",
            "multi_item_query",
            "multi_item_confirm",
            "add_to_cart",
            "refinement",
            "quote_intent",
            "quote_with_items",
            "stock_alert",
            "stagnant_products",
            "sales_analytics",
            "memory_recall",
            "general",
        }
        if intent not in valid_intents:
            logger.warning(f"[Luci/classifier] Intent desconocido {intent!r}, usando heurística")
            return _classify_heuristic(message, history)

        # Si dice quote_with_items pero no tiene productos claros → degradar a multi_item_query
        if intent == "quote_with_items":
            raw_text = params.get("raw_text", message)
            # Limpiar keywords de presupuesto/intención y espacios/comas sobrantes
            cleaned = re.sub(
                r"\b(?:presupuesto|cotizaci[oó]n|cotizar|quiero|necesito|haceme|armame|un|una)\b",
                "",
                raw_text,
                flags=re.IGNORECASE,
            )
            cleaned = re.sub(r"[,\s]+", " ", cleaned).strip()
            if cleaned:
                intent = "multi_item_query"
                params = {"raw": cleaned}
                logger.info(
                    f"[Luci/classifier] quote_with_items → multi_item_query, raw={cleaned!r}"
                )

        return intent, params
    except Exception as e:
        logger.warning(f"[Luci/classifier] LLM falló ({e}), usando heurística")
        return _classify_heuristic(message, history)


def _classify_heuristic(message: str, history: list[dict]) -> tuple[str, dict]:
    """Clasificador heurístico de fallback — sin LLM."""
    text = _normalize(message)
    words = text.split()

    if _is_pure_greeting(text):
        return "greeting", {}
    if any(a in text for a in _ABOUT_KW):
        return "about_luci", {}

    # Memory recall — preguntas sobre memoria persistente / Engram
    memory_kw = frozenset(
        {
            "te acordas",
            "te acordás",
            "recordas",
            "recordás",
            "que sabes",
            "qué sabés",
            "que sabe",
            "qué sabe",
            "buscá en engram",
            "busca en engram",
            "busca en tu memoria",
            "buscá en tu memoria",
            "buscar en engram",
            "que me pediste",
            "qué me pediste",
            "que dijiste",
            "qué dijiste",
            "que paso",
            "qué pasó",
            "conversacion",
            "conversación",
        }
    )
    if any(k in text for k in memory_kw):
        return "memory_recall", {"query": message}

    ctx = _extract_multi_context(history)
    if ctx is not None:
        return "multi_item_confirm", {"context": ctx}

    refinement_kw = frozenset(
        {
            "barato",
            "barata",
            "mas barato",
            "mas barata",
            "economico",
            "economica",
            "caro",
            "cara",
            "mas caro",
            "mas cara",
            "el mas",
            "la mas",
            "el primero",
            "la primera",
            "mostrame",
            "mostra",
            "de esos",
            "de esas",
        }
    )
    if any(k in text for k in refinement_kw):
        return "product_query", {
            "term": message,
            "fields": "price",
            "is_refinement": True,
        }

    quote_kw = frozenset(
        {
            "presupuesto",
            "presupuest",
            "cotiza",
            "cotizar",
            "cotizacion",
            "cotización",
            "queria hacer",
            "quería hacer",
        }
    )
    if any(k in text for k in quote_kw):
        parts = [
            p.strip() for p in _ITEM_SEPARATORS.split(message) if p.strip() and len(p.strip()) > 2
        ]
        meaningful = [p for p in parts if len(p.split()) >= 1]
        if len(meaningful) >= 3:
            return "quote_with_items", {"raw_text": message}
        return "quote_intent", {}

    # Multi-ítem por estructura (comas / conjunciones)
    parts = [p.strip() for p in _ITEM_SEPARATORS.split(message) if p.strip() and len(p.strip()) > 2]
    if len([p for p in parts if len(p.split()) >= 1]) >= 2:
        return "multi_item_query", {"items": [{"term": p, "qty": None} for p in parts]}

    # Intentos específicos de negocio (antes que product_query genérico)
    # stock_alert: requiere "stock" + indicador de bajo/falta
    has_stock_alert = any(
        k in text
        for k in {
            "stock bajo",
            "stockbajo",
            "bajo stock",
            "sin stock",
            "poco stock",
            "falta stock",
            "menos stock",
            "productos agotados",
            "productos sin stock",
            "qué falta",
            "qué hay que reponer",
            "que falta",
            "que hay que reponer",
            "reponer",
        }
    ) or ("stock" in words and any(w in words for w in ("bajo", "baja", "poco", "falta", "menos")))
    if has_stock_alert:
        return "stock_alert", {}

    stagnant_kw = frozenset(
        {
            "productos parados",
            "sin movimiento",
            "no se vendio",
            "no se vendió",
            "estancados",
            "estancado",
            "sin ventas",
        }
    )
    if any(k in text for k in stagnant_kw):
        return "stagnant_products", {"days": 90}

    sales_kw = frozenset(
        {
            "ventas del mes",
            "ventas mensuales",
            "resumen de ventas",
            "se vendio mas",
            "se vendió más",
            "se vendio más",
            "se vendió mas",
            "facturacion",
            "facturación",
            "qué se vende",
            "que se vende",
            "producto mas vendido",
            "producto más vendido",
            "mas vendido",
            "más vendido",
            "rendimiento",
            "ventas del",
            "ventas del periodo",
        }
    )
    if any(k in text for k in sales_kw):
        period = "month"
        if any(p in text for p in ("trimestre", "semestre", "año", "anual")):
            period = "quarter" if "trimestre" in text else "year"
        return "sales_analytics", {"period": period}

    price_kw = frozenset({"precio", "cuanto", "cuánto", "valor", "costo", "sale"})
    stock_kw = frozenset({"stock", "disponible", "tenes", "tenés", "hay", "queda", "quedan"})
    has_price = any(k in text for k in price_kw)
    has_stock = any(k in text for k in stock_kw)
    if has_price or has_stock:
        fields = "both" if has_price and has_stock else ("stock" if has_stock else "price")
        return "product_query", {"term": message, "fields": fields}

    open_q = frozenset(
        {
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
        }
    )
    if words and words[0] not in open_q and "?" not in text and 1 <= len(words) <= 5:
        return "product_query", {"term": message, "fields": "price"}

    return "general", {}


# ─────────────────────────────────────────────────────────────
# Prompt del sistema de Luci (para respuestas LLM)
# ─────────────────────────────────────────────────────────────


def _build_catalog_context(db_products: list[dict]) -> str:
    """Build a compact catalog summary for the LLM system prompt.
    Returns product descriptions and codes (no prices/stock — those come from tools).
    """
    if not db_products:
        return ""
    total = len(db_products)
    # Take top 50 as reference
    sample = db_products[:50]
    lines = [f"Total de productos en el catálogo: {total}"]
    for p in sample:
        desc = (p.get("description") or "").strip()
        code = (p.get("code") or "").strip()
        if desc:
            lines.append(f"- {desc}" + (f" (código: {code})" if code else ""))
    if total > 50:
        lines.append(f"... y {total - 50} productos más.")
    return "\n".join(lines)


def _build_business_data_context(
    low_stock: list[dict] | None = None,
    stagnant: list[dict] | None = None,
    sales: dict | None = None,
) -> str:
    """Build a business-data summary for the LLM system prompt."""
    parts = []

    if low_stock:
        lines = [f"📉 PRODUCTOS CON STOCK BAJO ({len(low_stock)}):"]
        for p in low_stock[:10]:
            desc = (p.get("description") or "").strip()
            stock = p.get("stock", "?")
            lines.append(f"  - {desc} — stock: {stock}")
        if len(low_stock) > 10:
            lines.append(f"  ... y {len(low_stock) - 10} más.")
        parts.append("\n".join(lines))

    if stagnant:
        lines = [f"🗄️ PRODUCTOS ESTANCADOS (sin venta, {len(stagnant)}):"]
        for p in stagnant[:10]:
            desc = (p.get("description") or "").strip()
            lines.append(f"  - {desc}")
        if len(stagnant) > 10:
            lines.append(f"  ... y {len(stagnant) - 10} más.")
        parts.append("\n".join(lines))

    if sales:
        for period, summary in sales.items():
            if not summary or not summary.get("total_amount"):
                continue
            lines = [
                f"💰 VENTAS {period.upper()}:",
                f"  Total: ${summary.get('total_amount', 0):,.2f}",
            ]
            top = (summary.get("top_by_revenue") or [])[:5]
            if top:
                lines.append("  Top productos por facturación:")
                for p in top:
                    lines.append(f"    - {p.get('description', '?')} — ${p.get('amount', 0):,.2f}")
            parts.append("\n".join(lines))

    return "\n\n".join(parts) if parts else ""


def _build_system_prompt(
    user_name: str = "",
    memory_context: str = "",
    catalog_context: str = "",
    business_data_context: str = "",
) -> str:
    name_ctx = (
        (
            f"El nombre del usuario es {user_name}. "
            "Usalo naturalmente en la conversación (no en cada oración)."
        )
        if user_name
        else ""
    )
    catalog_ctx = (
        f"\n📦 CATÁLOGO DEL NEGOCIO (datos reales):\n{catalog_context}\n" if catalog_context else ""
    )
    biz_ctx = (
        f"\n📊 DATOS DEL NEGOCIO (actualizados):\n{business_data_context}\n"
        if business_data_context
        else ""
    )
    memory_ctx = (
        f"\n🧠 MEMORIA DE CONVERSACIONES (NO son datos del catálogo):\n{memory_context}\n"
        if memory_context
        else ""
    )
    return f"""Sos Luci, la asistente del negocio en OctopusTrack. Hablás como una secretaria argentina: amigable, directa y eficiente.

{name_ctx}
{catalog_ctx}
{biz_ctx}
{memory_ctx}

━━━ SISTEMA — DATOS DISPONIBLES ━━━

Tenés los siguientes datasets del negocio pre-cargados en esta conversación. Usalos para responder cualquier consulta:

📦 CATÁLOGO — lista de productos del negocio (descripción, código). NO tiene precios ni stock actualizados.
📉 STOCK BAJO — productos con poco stock (descripción + cantidad actual).
🗄️ ESTANCADOS — productos sin ventas recientes (solo descripción).
💰 VENTAS — total facturado y top productos por período.

El sistema carga estos datos AL INICIO de la conversación y se mantienen actualizados.

HERRAMIENTAS ADICIONALES (se activan según el intent):
• Búsqueda de productos por nombre → busca en el catálogo real y devuelve precios + stock exactos
• Multi-ítem → búsqueda de varios productos a la vez con confirmación interactiva
• Carrito → agrega productos confirmados
• Presupuesto → arma cotización con los productos seleccionados

REGLAS ESTRICTAS — LEÉLAS SIEMPRE:
1. NUNCA inventes productos, precios, stock ni datos. Usá ÚNICAMENTE los datasets y herramientas que el sistema te provee.
2. Si un dataset está vacío o no contiene lo que el usuario pregunta, decí que no tenés esa información. No inventes.
3. 📦 CATÁLOGO: solo contiene descripción y código. Para precios o stock exactos, esperá a que el sistema ejecute la herramienta de búsqueda.
4. 📊 DATOS DEL NEGOCIO: son reales y actualizados. Stock bajo, estancados y ventas están disponibles acá arriba.
5. 🧠 MEMORIA: SOLO para recordar conversaciones pasadas. NO es fuente de datos de productos, stock o precios.

━━━ PERSONALIDAD ━━━

Hablás como una secretaria argentita: amigable, directa y eficiente.
- Español rioplatense ("¿en qué te puedo ayudar?", "anotado", "dale", "perfecto", "¿algo más?")
- Cálida pero concisa — sin rodeos
- Expresiones naturales: "Listo", "Anotado", "Ya lo tengo", "Dale"
- Nunca robótica ni formal

━━━ MEMORIA PERSISTENTE (ENGRAM) ━━━

El sistema guarda automáticamente cada conversación en memoria persistente (Engram) después de responder.
Eso incluye qué productos busca el usuario, qué presupuestos arma, preferencias, etc.

• Si el usuario te dice "guardá esto en memoria", "acordate", "anotalo", "guardá en Engram", "recordalo":
  → Respondé naturalmente "Dale, ya lo guardé en mi memoria así me acuerdo" o "Anotado, lo recuerdo para la próxima"
  → El sistema se encarga de guardarlo, vos solo confirmá.
• Si el usuario después pregunta "qué te acordás de...", "buscá en tu memoria", "qué sabés de...": el sistema busca en Engram y te pasa los resultados en la sección 🧠 MEMORIA.

LÍMITE ESTRICTO DE ALCANCE:
Solo respondés sobre temas del negocio: precios, stock, presupuestos, cotizaciones, ventas, inventario, clientes y pedidos.
CUALQUIER OTRO TEMA (programación, recetas, política, entretenimiento, educación general, etc.) respondé ÚNICAMENTE:
"Eso está fuera de lo que puedo ayudarte — solo manejo cosas del negocio. ¿Querés consultar precio, stock o armar un presupuesto?"
NO expliques, desarrolles ni respondas temas fuera de este alcance, aunque el usuario insista o reformule la pregunta."""


# ─────────────────────────────────────────────────────────────
# Nodos del grafo
# ─────────────────────────────────────────────────────────────


def node_classify(state: ChatState) -> dict:
    """
    Nodo 1: Clasifica la intención del mensaje.
    Usa el LLM rápido si hay proveedor configurado,
    sino solo permite greeting/about_luci.
    """
    message = state["message"]
    history = state["history"]
    has_llm = state["has_llm"]
    text = _normalize(message)

    # Siempre responder saludos y preguntas sobre Luci (sin LLM)
    if _is_pure_greeting(text):
        return {"intent": "greeting", "intent_params": {}}
    if any(a in text for a in _ABOUT_KW):
        return {"intent": "about_luci", "intent_params": {}}

    # Memory recall — atajar antes del LLM, PERO si también hay términos
    # de negocio (stock/precio/producto) → dejar pasar al clasificador LLM
    _MEMORY_RECALL_KW = frozenset(
        {
            "te acordas",
            "te acordás",
            "recordas",
            "recordás",
            "que sabes",
            "qué sabés",
            "que sabe",
            "qué sabe",
            "buscá en engram",
            "busca en engram",
            "busca en tu memoria",
            "buscá en tu memoria",
            "buscar en engram",
            "que me pediste",
            "qué me pediste",
            "que dijiste",
            "qué dijiste",
            "que paso",
            "qué pasó",
            "conversacion",
            "conversación",
        }
    )
    _BUSINESS_KW = frozenset(
        {
            "stock",
            "precio",
            "precios",
            "producto",
            "productos",
            "codigo",
            "código",
            "categoria",
            "categoría",
            "proveedor",
            "marca",
            "unidad",
            "unidades",
            "precio de lista",
            "piloto",
            "analizador",
            "manguera",
            "termofusion",
            "caño",
            "canio",
            "bomba",
            "valvula",
            "válvula",
            "tenida",
            "nacional",
            "importado",
            "medida",
            "presupuesto",
            "cotizacion",
            "cotización",
            "factura",
            "remito",
        }
    )
    if any(k in text for k in _MEMORY_RECALL_KW):
        # Si también hay términos de negocio → el usuario preguntó por datos, no por memoria
        if any(k in text for k in _BUSINESS_KW):
            pass  # dejar pasar al LLM classifier
        else:
            return {"intent": "memory_recall", "intent_params": {"query": message}}

    # Sin LLM → bloquear todo lo demás
    if not has_llm:
        return {"intent": "no_llm", "intent_params": {}}

    # Detección rápida de "anotame N" / "quiero N" / número solo
    # cuando el último mensaje del asistente mostró exactamente 1 producto
    _ADD_CART_PATTERN = re.compile(
        r"^\s*(?:(?:anotame|anota|agrego|agregar|quiero|dame|deme)\s+)?(?:x\s*)?(\d+(?:[.,]\d+)?)\s*(?:unidades?|unid\.?)?\s*$",
        re.IGNORECASE,
    )
    m_cart = _ADD_CART_PATTERN.match(message.strip())
    if m_cart:
        qty_str = m_cart.group(1).replace(",", ".")
        try:
            qty = float(qty_str)
            if qty > 0:
                return {"intent": "add_to_cart", "intent_params": {"qty": qty}}
        except ValueError:
            pass

    # Si Luci pidió la lista de productos para un presupuesto en el turno anterior,
    # el mensaje actual ES esa lista — rutearlo como multi_item_query directamente
    if _has_quote_intent_pending(history):
        # Limpiar prefijos afirmativos del inicio ("si, ", "claro, ", etc.)
        cleaned = (
            re.sub(
                r"^\s*(?:si|sí|claro|dale|bueno|ok|obvio)[,\s]+",
                "",
                message,
                flags=re.IGNORECASE,
            ).strip()
            or message
        )
        return {"intent": "multi_item_query", "intent_params": {"raw": cleaned}}

    # Con LLM → clasificar
    client = state["classifier_client"]
    model = state["classifier_model"]

    intent, params = _classify_with_llm(message, history, client, model)

    # Si el LLM dice multi_item_confirm pero no hay contexto → degradar
    if intent == "multi_item_confirm":
        ctx = _extract_multi_context(history)
        if ctx is None:
            intent, params = _classify_heuristic(message, history)
        else:
            params["context"] = ctx

    return {"intent": intent, "intent_params": params}


def node_retrieve(state: ChatState) -> dict:
    """
    Nodo 2a: Recupera productos del catálogo según el intent.
    Usado para product_query y refinement.
    """
    intent = state["intent"]
    params = state["intent_params"]
    message = state["message"]
    history = state["history"]
    db_prods = state["db_products"]

    is_refinement = (
        intent == "refinement"
        or params.get("is_refinement", False)
        or params.get("filter") is not None
    )

    if is_refinement:
        candidates = _get_products_from_history(history, db_prods)
        if not candidates:
            prev = _get_prev_user_query(history, message)
            if prev:
                candidates = _search_candidates_in_memory(prev, db_prods, limit=20)
        if candidates:
            candidates = _apply_refinement(message, candidates)
        else:
            term = params.get("term", message)
            candidates = _search_candidates_in_memory(term, db_prods, limit=5)
    else:
        term = params.get("term", message)
        candidates = _search_candidates_in_memory(term, db_prods, limit=10)

    return {"retrieved_products": candidates[:5]}


def node_respond(state: ChatState) -> dict:
    """
    Nodo 3: Genera la respuesta final para product_query / refinement.
    Texto natural con markdown, sin cards a menos que sean necesarias.
    """
    products = state["retrieved_products"]
    params = state["intent_params"]
    message = state["message"]
    name = state["user_name"]
    fields = params.get("fields", "price")

    if not products:
        text = "No encontré ese producto en el catálogo."
        if name:
            text += f" ¿Tenés más detalles, {name}?"
        else:
            text += " ¿Podés darme más detalles o el código?"
        return {
            "response_type": "text",
            "response_text": text,
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }

    # Construir lista de productos con campos correctos
    product_results = []
    for p in products:
        item: dict = {
            "id": p["id"],
            "code": p["code"],
            "description": p["description"],
            "unit": p["unit"],
        }
        if fields in ("price", "both"):
            item["sale_price"] = p.get("sale_price")
            item["net_price"] = p.get("net_price")
            item["iva_rate"] = p.get("iva_rate")
        if fields in ("stock", "both"):
            item["stock"] = p.get("stock")
        if p.get("customer_terms"):
            item["customer_terms"] = p["customer_terms"]
        product_results.append(item)

    # Texto natural según cantidad de resultados
    if len(product_results) == 1:
        p = product_results[0]
        ct = p.get("customer_terms", "")
        synonym = ""
        if ct:
            terms = [t.strip() for t in ct.split(",") if t.strip()]
            if terms:
                synonym = f" (también llamado *{terms[0]}*)"

        if fields == "price":
            text = f"Te encontré **{p['description']}**{synonym} a **{_format_price(p.get('sale_price'))}** la {p['unit']}."
        elif fields == "stock":
            stock = p.get("stock")
            s = f"{stock} {p['unit']}" if stock is not None else "sin datos de stock"
            text = f"**{p['description']}**{synonym} tiene **{s}** disponible."
        else:
            text = f"**{p['description']}**{synonym} — Precio: **{_format_price(p.get('sale_price'))}** | Stock: {p.get('stock', 'N/D')} {p['unit']}."
    else:
        lines = [f"Encontré {len(product_results)} opciones:"]
        for p in product_results:
            if fields != "stock":
                lines.append(
                    f"- **{p['description']}** (Cód: {p['code']}) — {_format_price(p.get('sale_price'))}"
                )
            else:
                lines.append(
                    f"- **{p['description']}** — Stock: {p.get('stock', 'N/D')} {p['unit']}"
                )
        lines.append("\n¿Cuál es el que necesitás?")
        text = "\n".join(lines)

    # Siempre devolvemos response_type=products para que el frontend
    # incluya los productos en el historial y _get_last_single_product los encuentre
    return {
        "response_type": "products",
        "response_text": text,
        "response_products": product_results,
        "response_quote": None,
        "response_cart_items": None,
    }


def node_respond_static(state: ChatState) -> dict:
    """
    Nodo para respuestas hardcodeadas sin LLM:
    greeting, about_luci, no_llm, quote_intent.
    """
    import random

    intent = state["intent"]
    name = state["user_name"]
    n = f", {name}" if name else ""

    if intent == "greeting":
        opciones = [
            f"¡Hola{n}! ¿En qué te puedo ayudar?",
            f"¡Buenas{n}! ¿Qué necesitás?",
            f"¡Hola{n}! ¿Cómo te puedo ayudar hoy?",
        ]
        text = random.choice(opciones)

    elif intent == "about_luci":
        text = (
            f"Soy Luci{n}, la asistente del negocio. "
            "Puedo buscarte precios y stock, armar listas de productos y pasarte todo a Ventas.\n\n"
            "Por ejemplo podés decirme:\n"
            '- *"precio de canilla jardín"*\n'
            '- *"anotame 2 codos, 1 depósito ferrum y 3 aros goma"*'
        )

    elif intent == "no_llm":
        text = (
            "Para poder ayudarte necesito tener un proveedor de IA configurado. "
            "Configuralo en **Ajustes → Inteligencia Artificial**."
        )

    elif intent == "quote_intent":
        text = (
            f"¡Dale{n}! ¿Qué productos querés incluir en el presupuesto? "
            "Podés dictarme la lista así:\n"
            '*"canilla jardín x2, depósito ferrum x1, aro goma x3"*'
            "\n\n[QUOTE_INTENT]"
        )

    else:
        text = f"¡Hola{n}! ¿En qué te puedo ayudar?"

    return {
        "response_type": "text",
        "response_text": text,
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }


def node_multi_lookup(state: ChatState) -> dict:
    """
    Nodo: búsqueda multi-ítem — igual que handle_multi_item_lookup anterior.
    """
    message = state["message"]
    params = state["intent_params"]
    db_prods = state["db_products"]
    name = state["user_name"]

    # Extraer ítems del params (LLM) o parsear del mensaje (heurístico)
    raw_items = params.get("items")
    if raw_items and isinstance(raw_items, list):
        parsed_items = raw_items
    else:
        # Fallback: parsear desde el mensaje
        raw = re.sub(
            r"^\s*(presupuesto|cotizaci[oó]n|cotizar|anotame|armame|haceme)\s*:?\s*",
            "",
            message,
            flags=re.IGNORECASE,
        ).strip()
        parts = [p.strip() for p in _ITEM_SEPARATORS.split(raw) if p.strip() and len(p.strip()) > 1]
        parsed_items = []
        for part in parts:
            qty, term = _parse_item_with_qty(part)
            parsed_items.append({"term": term, "qty": qty})

    items_state = []
    for pi in parsed_items:
        term = str(pi.get("term", "")).strip()
        qty = pi.get("qty")
        if not term:
            continue
        candidates = _search_candidates_in_memory(term, db_prods, limit=4)
        if not candidates:
            items_state.append(
                {
                    "term": term,
                    "qty": qty,
                    "status": "not_found",
                    "candidates": [],
                    "chosen": None,
                }
            )
        elif len(candidates) == 1:
            status = "clear" if qty is not None else "needs_qty"
            items_state.append(
                {
                    "term": term,
                    "qty": qty,
                    "status": status,
                    "candidates": [_slim_product(candidates[0])],
                    "chosen": _slim_product(candidates[0]),
                }
            )
        else:
            top, second = candidates[0], candidates[1]
            exact = (
                top.get("description", "").lower() == term.lower()
                or top.get("code", "").lower() == term.lower()
            )
            if exact:
                status = "clear" if qty is not None else "needs_qty"
                items_state.append(
                    {
                        "term": term,
                        "qty": qty,
                        "status": status,
                        "candidates": [_slim_product(top)],
                        "chosen": _slim_product(top),
                    }
                )
            else:
                items_state.append(
                    {
                        "term": term,
                        "qty": qty,
                        "status": "ambiguous",
                        "candidates": [_slim_product(c) for c in candidates[:4]],
                        "chosen": None,
                    }
                )

    # Construir respuesta en texto natural
    n = f", {name}" if name else ""
    lines: list[str] = []

    found_clear = [
        i for i in items_state if i["status"] in ("clear", "needs_qty") and i.get("chosen")
    ]
    ambiguous = [i for i in items_state if i["status"] == "ambiguous"]
    not_found = [i for i in items_state if i["status"] == "not_found"]

    if found_clear:
        lines.append(f"Dale{n}, encontré esto:")
        for item in found_clear:
            p = item["chosen"]
            price_txt = (
                _format_price(p.get("sale_price"))
                if p.get("sale_price") is not None
                else "sin precio"
            )
            qty_txt = f" x{int(item['qty'])}" if item.get("qty") else ""
            lines.append(f"- **{p['description']}**{qty_txt} — {price_txt} c/u")

    if ambiguous:
        if found_clear:
            lines.append("")
        lines.append("Para estos ítems tengo varias opciones, decime cuál querés:")
        for item in ambiguous:
            lines.append(f"\n**{item['term']}:**")
            for j, c in enumerate(item["candidates"], 1):
                price_txt = (
                    _format_price(c.get("sale_price"))
                    if c.get("sale_price") is not None
                    else "sin precio"
                )
                lines.append(f"  {j}. {c['description']} — {price_txt}")

    if not_found:
        if found_clear or ambiguous:
            lines.append("")
        nf_names = ", ".join(f"**{i['term']}**" for i in not_found)
        lines.append(f"No encontré en el catálogo: {nf_names}. ¿Tienen otro nombre o código?")

    needs_qty = [i for i in found_clear if i["status"] == "needs_qty"]
    if needs_qty or ambiguous:
        lines.append("")
        if needs_qty and not ambiguous:
            qty_names = ", ".join(f"**{i['chosen']['description']}**" for i in needs_qty)
            lines.append(f"¿Con cuántas unidades vas de {qty_names}?")
        elif needs_qty and ambiguous:
            lines.append(
                "Cuando me digas cuál querés de las opciones, también decime las cantidades de todo."
            )
        else:
            lines.append(
                "Cuando me digas cuál querés de las opciones, decime también las cantidades."
            )
    elif (
        found_clear
        and all(i["status"] == "clear" for i in found_clear)
        and not ambiguous
        and not not_found
    ):
        lines.append("")
        lines.append(
            "¿Las cantidades están bien o querés cambiar algo? Si está todo ok, agrego todo al carrito."
        )

    text = "\n".join(lines)
    ctx_json = json.dumps({"items": items_state, "user_name": name}, ensure_ascii=False)

    return {
        "response_type": "text",
        "response_text": f"{text}\n\n[MULTI_CONTEXT]{ctx_json}",
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
        "multi_context": {"items": items_state, "user_name": name},
    }


def node_multi_confirm(state: ChatState) -> dict:
    """
    Nodo: confirmación multi-ítem — resuelve variantes y cantidades.
    """
    message = state["message"]
    params = state["intent_params"]
    db_prods = state["db_products"]
    name = state["user_name"]
    client = state["ai_client"]
    model = state["ai_model"]

    ctx = params.get("context") or _extract_multi_context(state["history"])
    if not ctx:
        return {
            "response_type": "text",
            "response_text": "No encontré el contexto de la lista anterior. ¿Podés repetirla?",
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }

    items_state: list[dict] = ctx.get("items", [])
    stored_name = ctx.get("user_name", name) or name

    updated = _resolve_confirm_with_llm(message, items_state, client, model)
    if updated is None:
        updated = _resolve_confirm_heuristic(message, items_state)

    all_resolved = all(
        item.get("chosen") is not None
        and item.get("qty") is not None
        and float(item.get("qty", 0)) > 0
        for item in updated
        if item.get("status") != "not_found"
    )

    n = f", {stored_name}" if stored_name else ""

    if all_resolved:
        cart_items = []
        lines = [f"¡Dale{n}! Agrego todo al carrito:"]
        total = 0.0
        for item in updated:
            if item.get("status") == "not_found" or not item.get("chosen"):
                continue
            chosen = item["chosen"]
            qty = float(item.get("qty", 1))
            price = float(chosen.get("sale_price") or 0)
            subtotal = qty * price
            total += subtotal
            full_product = _enrich_product(chosen, db_prods)
            cart_items.append({"product": full_product, "qty": qty})
            lines.append(f"- {chosen['description']} x{int(qty)} — {_format_price(subtotal)}")

        lines.append(f"\nTotal estimado: **{_format_price(total)}**")
        lines.append("\n¿Querés agregar algo más o pasamos a Ventas?")

        return {
            "response_type": "cart_action",
            "response_text": "\n".join(lines),
            "response_products": None,
            "response_quote": None,
            "response_cart_items": cart_items,
        }

    # Todavía hay pendientes
    still_ambiguous = [i for i in updated if i.get("status") == "ambiguous"]
    still_needs_qty = [i for i in updated if i.get("chosen") and not i.get("qty")]
    lines = []

    if still_ambiguous:
        lines.append("Todavía me falta que elijas:")
        for item in still_ambiguous:
            lines.append(f"\n**{item['term']}:**")
            for j, c in enumerate(item["candidates"], 1):
                price_txt = (
                    _format_price(c.get("sale_price"))
                    if c.get("sale_price") is not None
                    else "sin precio"
                )
                lines.append(f"  {j}. {c['description']} — {price_txt}")

    if still_needs_qty:
        if still_ambiguous:
            lines.append("")
        qty_names = ", ".join(f"**{i['chosen']['description']}**" for i in still_needs_qty)
        lines.append(f"¿Cuántas unidades de {qty_names}?")

    new_ctx = {"items": updated, "user_name": stored_name}
    ctx_json = json.dumps(new_ctx, ensure_ascii=False)
    text = "\n".join(lines)

    return {
        "response_type": "text",
        "response_text": f"{text}\n\n[MULTI_CONTEXT]{ctx_json}",
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }


def node_quote_graph(state: ChatState) -> dict:
    """
    Nodo: invoca el grafo LangGraph de presupuestos existente (ai_quote_service).
    """
    message = state["message"]
    params = state["intent_params"]
    db_prods = state["db_products"]
    name = state["user_name"]
    input_file = state.get("input_file")  # type: ignore[attr-defined]
    input_file_type = state.get("input_file_type")  # type: ignore[attr-defined]

    raw_text = params.get("raw_text", message)

    if input_file and input_file_type:
        input_type, raw_input = input_file_type, input_file
    else:
        input_type, raw_input = "text", raw_text

    quote_state = {
        "input_type": input_type,
        "raw_input": raw_input,
        "business_id": "",
        "db_products": db_prods,
        "raw_text": "",
        "extracted_items": [],
        "matched_items": [],
        "validated_draft": {},
        "needs_review": False,
        "errors": [],
    }

    try:
        final = _quote_graph.invoke(quote_state)
        draft = final.get("validated_draft", {})
        needs_review = final.get("needs_review", False)
        errors = final.get("errors", [])
        n = f", {name}" if name else ""

        if not draft or not draft.get("items"):
            return {
                "response_type": "text",
                "response_text": "No pude generar el presupuesto. ¿Podés reescribir la lista de productos?",
                "response_products": None,
                "response_quote": None,
                "response_cart_items": None,
            }

        total_items = draft.get("total_items", 0)
        summary = draft.get("summary", {})
        text = (
            (
                f"Te armé el presupuesto{n} con {total_items} ítem{'s' if total_items != 1 else ''}. "
                f"{summary.get('high', 0)} con alta confianza"
            )
            if needs_review
            else (
                f"¡Listo{n}! Presupuesto con {total_items} ítem{'s' if total_items != 1 else ''}. "
                "Revisalo y cuando confirmes pasamos a Ventas."
            )
        )

        return {
            "response_type": "quote",
            "response_text": text,
            "response_products": None,
            "response_quote": {
                "draft": draft,
                "needs_review": needs_review,
                "errors": errors,
            },
            "response_cart_items": None,
        }
    except Exception as e:
        logger.error(f"[Luci] quote_graph error: {e}", exc_info=True)
        return {
            "response_type": "text",
            "response_text": "No pude procesar el presupuesto. Intentá de nuevo.",
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }


def node_add_to_cart(state: ChatState) -> dict:
    """
    Nodo: agrega al carrito el último producto mostrado por Luci con la cantidad indicada.
    Se activa cuando el usuario dice "anotame 3", "quiero 2", etc. después de ver 1 producto.
    """
    params = state["intent_params"]
    history = state["history"]
    db_prods = state["db_products"]
    name = state["user_name"]
    message = state["message"]
    n = f", {name}" if name else ""

    qty = float(params.get("qty", 1))

    # Recuperar el producto del historial
    product = _get_last_single_product(history, db_prods)

    if not product:
        # No hay producto previo — intentar buscar en el mensaje
        return {
            "response_type": "text",
            "response_text": (
                f"No encontré el producto al que te referís{n}. "
                "¿Podés decirme el nombre del producto también?"
            ),
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }

    subtotal = qty * float(product.get("sale_price") or 0)

    return {
        "response_type": "cart_action",
        "response_text": (
            f"¡Anotado{n}! Agrego al carrito:\n"
            f"- **{product['description']}** x{int(qty)} — {_format_price(subtotal)}\n\n"
            "¿Querés agregar algo más o pasamos a Ventas?"
        ),
        "response_products": None,
        "response_quote": None,
        "response_cart_items": [{"product": product, "qty": qty}],
    }


def node_stock_alert(state: ChatState) -> dict:
    products = state["low_stock_products"]

    if not products:
        return {
            "response_type": "text",
            "response_text": "¡Todo en orden! No hay productos con stock bajo en este momento.",
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }

    lines = [
        f"Encontré **{len(products)}** producto{'s' if len(products) != 1 else ''} con stock bajo:\n"
    ]
    for p in products:
        deficit = p["minimum_stock"] - p["current_stock"]
        lines.append(
            f"- **{p['description']}** (Cód: {p['code']}) — "
            f"Stock: {p['current_stock']} / Mínimo: {p['minimum_stock']} "
            f"*(faltan {deficit} {p['unit']})*"
        )
    lines.append("\n¿Querés que te ayude a armar un pedido de reposición?")

    return {
        "response_type": "text",
        "response_text": "\n".join(lines),
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }


def node_stagnant_products(state: ChatState) -> dict:
    params = state["intent_params"]
    try:
        days = max(1, min(int(params.get("days", 90) or 90), 365))
    except (TypeError, ValueError):
        days = 90
    products = state["stagnant_products_list"]

    if not products:
        return {
            "response_type": "text",
            "response_text": f"¡Buenas noticias! Todos los productos se movieron en los últimos {days} días.",
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }

    lines = [f"Productos sin ventas hace más de **{days} días** (con stock disponible):\n"]
    for p in products[:15]:
        days_txt = f"{p['days_without_sale']} días" if p["days_without_sale"] else "Nunca vendido"
        lines.append(
            f"- **{p['description']}** (Cód: {p['code']}) — "
            f"Stock: {p['current_stock']} {p['unit']} · Última venta: {p['last_sale_date']} *({days_txt})*"
        )
    if len(products) > 15:
        lines.append(f"\n…y {len(products) - 15} productos más.")
    lines.append("\n¿Querés analizar alguno en particular o armar una promoción?")

    return {
        "response_type": "text",
        "response_text": "\n".join(lines),
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }


def node_sales_analytics(state: ChatState) -> dict:
    params = state["intent_params"]
    period = params.get("period", "month")
    if period not in ("month", "quarter", "year"):
        period = "month"

    summaries = state.get("sales_summaries") or {}  # type: ignore[attr-defined]
    summary = summaries.get(period)
    if not summary:
        return {
            "response_type": "text",
            "response_text": "No pude obtener los datos de ventas en este momento.",
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }

    if not summary["top_by_revenue"]:
        return {
            "response_type": "text",
            "response_text": f"No encontré ventas registradas para {summary['period']}.",
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }

    lines = [f"**Ventas — {summary['period']}** ({summary['date_from']} al {summary['date_to']})\n"]
    lines.append(f"💰 **Total:** ${summary['total_amount']:,.2f}\n")

    lines.append("**Top 5 por facturación:**")
    for i, p in enumerate(summary["top_by_revenue"], 1):
        lines.append(f"{i}. {p['description']} — ${p['amount']:,.2f} ({p['quantity']:.0f} u.)")

    if (
        summary["top_by_qty"]
        and summary["top_by_qty"][0]["description"] != summary["top_by_revenue"][0]["description"]
    ):
        lines.append("\n**Top 5 por cantidad:**")
        for i, p in enumerate(summary["top_by_qty"], 1):
            lines.append(f"{i}. {p['description']} — {p['quantity']:.0f} u. (${p['amount']:,.2f})")

    return {
        "response_type": "text",
        "response_text": "\n".join(lines),
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }


def node_memory_recall(state: ChatState) -> dict:
    """
    Nodo: responde con el contenido de la memoria de Engram.
    El memory_context ya fue pre-buscado con la consulta del usuario.
    """
    memory = state.get("memory_context", "")
    if not memory or not memory.strip():
        return {
            "response_type": "text",
            "response_text": "No encontré nada en mi memoria sobre eso. ¿Qué más te puedo ayudar?",
            "response_products": None,
            "response_quote": None,
            "response_cart_items": None,
        }

    return {
        "response_type": "text",
        "response_text": f"Esto es lo que encontré en mi memoria:\n\n{memory}",
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }


def node_respond_llm(state: ChatState) -> dict:
    """
    Nodo: respuesta conversacional libre con el LLM principal.
    Pasa catálogo + datos del negocio para que el LLM pueda responder
    cualquier consulta sin inventar.
    """
    message = state["message"]
    history = state["history"]
    name = state["user_name"]
    memory_context = state["memory_context"]
    db_products = state.get("db_products", [])
    client = state["ai_client"]
    model = state["ai_model"]
    n = f", {name}" if name else ""

    catalog_context = _build_catalog_context(db_products)
    business_data_context = _build_business_data_context(
        low_stock=state.get("low_stock_products"),
        stagnant=state.get("stagnant_products_list"),
        sales=state.get("sales_summaries"),
    )
    system = _build_system_prompt(
        user_name=name,
        memory_context=memory_context,
        catalog_context=catalog_context,
        business_data_context=business_data_context,
    )
    msgs: list[dict] = [{"role": "system", "content": system}]
    for h in history[-10:]:
        content = str(h.get("content", ""))
        if "[MULTI_CONTEXT]" in content:
            content = content.split("[MULTI_CONTEXT]")[0].strip()
        elif len(content) > 500:
            content = content[:500] + "..."
        msgs.append({"role": h["role"], "content": content})
    msgs.append({"role": "user", "content": message})

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=msgs,
            max_tokens=600,
            temperature=0.4,
        )
        text = resp.choices[0].message.content or "No pude generar una respuesta."
    except Exception as e:
        logger.error(f"[Luci] LLM general error: {e}")
        text = f"Perdoná{n}, tuve un problema técnico. Igual puedo ayudarte con precios y stock — escribí el nombre del producto."

    return {
        "response_type": "text",
        "response_text": text,
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }


# ─────────────────────────────────────────────────────────────
# Helpers de confirmación multi-ítem (sin cambios de lógica)
# ─────────────────────────────────────────────────────────────


def _resolve_confirm_with_llm(
    message: str,
    items_state: list[dict],
    client: Any,
    model: str,
) -> list[dict] | None:
    if client is None:
        return None
    items_summary = []
    for idx, item in enumerate(items_state):
        status = item.get("status", "")
        term = item.get("term", "")
        qty = item.get("qty")
        chosen = item.get("chosen")
        candidates = item.get("candidates", [])
        if status == "not_found":
            items_summary.append(f"{idx}: '{term}' — NO ENCONTRADO")
        elif status == "ambiguous":
            opts = "; ".join(f"{j + 1}={c['description']}" for j, c in enumerate(candidates))
            items_summary.append(f"{idx}: '{term}' — AMBIGUO [{opts}], qty={qty}")
        else:
            desc = chosen["description"] if chosen else "?"
            items_summary.append(f"{idx}: '{term}' → '{desc}', qty={qty}")

    prompt = (
        f"Ítems pendientes:\n{chr(10).join(items_summary)}\n\n"
        f'Respuesta del usuario: "{message}"\n\n'
        "Respondé SOLO con un JSON array (mismo largo que los ítems) con "
        '{"chosen_idx": null|número, "qty": null|número} por ítem.'
    )
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0,
        )
        content = resp.choices[0].message.content or "[]"
        content = re.sub(r"```json?\s*|\s*```", "", content).strip()
        parsed = json.loads(content)
        if not isinstance(parsed, list) or len(parsed) != len(items_state):
            return None
        updated = []
        for item, res in zip(items_state, parsed):
            item = dict(item)
            if not isinstance(res, dict):
                updated.append(item)
                continue
            if res.get("qty") is not None:
                try:
                    item["qty"] = float(res["qty"])
                except (TypeError, ValueError):
                    pass
            if item.get("status") == "ambiguous" and res.get("chosen_idx") is not None:
                cands = item.get("candidates", [])
                idx = int(res["chosen_idx"]) - 1
                if 0 <= idx < len(cands):
                    item["chosen"] = cands[idx]
                    item["status"] = "clear" if item.get("qty") else "needs_qty"
            updated.append(item)
        return updated
    except Exception as e:
        logger.warning(f"[Luci] confirm LLM parse failed: {e}")
        return None


_ORDINAL_MAP = {
    "primero": 1,
    "primer": 1,
    "1ro": 1,
    "1er": 1,
    "segundo": 2,
    "segund": 2,
    "2do": 2,
    "2nd": 2,
    "tercero": 3,
    "tercer": 3,
    "3ro": 3,
    "3er": 3,
    "cuarto": 4,
    "4to": 4,
    "quinto": 5,
    "5to": 5,
    "sexto": 6,
    "6to": 6,
    "septimo": 7,
    "7mo": 7,
    "octavo": 8,
    "8vo": 8,
    "noveno": 9,
    "9no": 9,
    "decimo": 10,
    "10mo": 10,
    "ultimo": 999,
    "último": 999,
    "ultim": 999,
    "últim": 999,
    "el": None,
    "la": None,
    "del": None,
    "de": None,
    "un": None,
    "una": None,
}


def _resolve_confirm_heuristic(message: str, items_state: list[dict]) -> list[dict]:
    lower_msg = _normalize(message)
    msg_words = set(lower_msg.split())
    numbers = re.findall(r"\b(\d+(?:[.,]\d+)?)\b", message)
    num_iter = iter(numbers)
    updated = []
    for item in items_state:
        item = dict(item)
        status = item.get("status", "")

        if status == "ambiguous":
            cands = item.get("candidates", [])
            chosen = None

            # 1. Text matching: score each candidate, pick if unique, filter if tie
            scored: list[tuple[int, dict]] = []
            for c in cands:
                desc_words = set(_normalize(c.get("description", "")).split())
                sig = desc_words & msg_words
                score = sum(1 for w in sig if len(w) >= 3 and w not in _ORDINAL_MAP)
                scored.append((score, c))

            best_score = max(s for s, _ in scored)
            if best_score > 0:
                best_candidates = [c for s, c in scored if s == best_score]
                if len(best_candidates) == 1:
                    chosen = best_candidates[0]
                else:
                    # Tie — filter candidates to tied ones and re-ask
                    item["candidates"] = best_candidates

            # 2. Ordinal word match: "primero", "segundo", etc.
            if chosen is None:
                for w in sorted(msg_words, key=lambda x: len(x), reverse=True):
                    ord_idx = _ORDINAL_MAP.get(w)
                    if ord_idx is not None and 1 <= ord_idx <= len(cands):
                        chosen = cands[ord_idx - 1]
                        break

            # 3. Fallback: number-based selection
            if chosen is None:
                try:
                    n = int(float(next(num_iter).replace(",", ".")))
                    if 1 <= n <= len(cands):
                        chosen = cands[n - 1]
                except (StopIteration, ValueError):
                    pass

            if chosen is not None:
                item["chosen"] = chosen
                item["status"] = "needs_qty"

        if not item.get("qty"):
            try:
                n = float(next(num_iter).replace(",", "."))
                if n > 0:
                    item["qty"] = n
                    if item.get("status") == "needs_qty":
                        item["status"] = "clear"
            except (StopIteration, ValueError):
                pass

        if not item.get("qty") and any(
            w in lower_msg for w in ("todos", "todo", "si", "dale", "ok", "listo")
        ):
            item["qty"] = 1.0
            if item.get("status") == "needs_qty":
                item["status"] = "clear"
        updated.append(item)
    return updated


# ─────────────────────────────────────────────────────────────
# Routing condicional
# ─────────────────────────────────────────────────────────────


def route_by_intent(
    state: ChatState,
) -> Literal[
    "node_respond_static",
    "node_retrieve",
    "node_multi_lookup",
    "node_multi_confirm",
    "node_add_to_cart",
    "node_quote_graph",
    "node_stock_alert",
    "node_stagnant_products",
    "node_sales_analytics",
    "node_memory_recall",
    "node_respond_llm",
]:
    intent = state["intent"]
    if intent in ("greeting", "about_luci", "no_llm"):
        return "node_respond_static"
    if intent == "quote_intent":
        return "node_respond_llm"
    if intent in ("product_query", "refinement"):
        return "node_retrieve"
    if intent == "multi_item_query":
        return "node_multi_lookup"
    if intent == "multi_item_confirm":
        return "node_multi_confirm"
    if intent == "add_to_cart":
        return "node_add_to_cart"
    if intent == "quote_with_items":
        return "node_quote_graph"
    if intent == "stock_alert":
        return "node_stock_alert"
    if intent == "stagnant_products":
        return "node_stagnant_products"
    if intent == "sales_analytics":
        return "node_sales_analytics"
    if intent == "memory_recall":
        return "node_memory_recall"
    return "node_respond_llm"


# ─────────────────────────────────────────────────────────────
# Construcción del grafo
# ─────────────────────────────────────────────────────────────


def _build_chat_graph():
    builder = StateGraph(ChatState)

    builder.add_node("node_classify", node_classify)
    builder.add_node("node_respond_static", node_respond_static)
    builder.add_node("node_retrieve", node_retrieve)
    builder.add_node("node_respond", node_respond)
    builder.add_node("node_multi_lookup", node_multi_lookup)
    builder.add_node("node_multi_confirm", node_multi_confirm)
    builder.add_node("node_add_to_cart", node_add_to_cart)
    builder.add_node("node_quote_graph", node_quote_graph)
    builder.add_node("node_stock_alert", node_stock_alert)
    builder.add_node("node_stagnant_products", node_stagnant_products)
    builder.add_node("node_sales_analytics", node_sales_analytics)
    builder.add_node("node_memory_recall", node_memory_recall)
    builder.add_node("node_respond_llm", node_respond_llm)

    builder.add_edge(START, "node_classify")

    builder.add_conditional_edges(
        "node_classify",
        route_by_intent,
        [
            "node_respond_static",
            "node_retrieve",
            "node_multi_lookup",
            "node_multi_confirm",
            "node_add_to_cart",
            "node_quote_graph",
            "node_stock_alert",
            "node_stagnant_products",
            "node_sales_analytics",
            "node_memory_recall",
            "node_respond_llm",
        ],
    )

    builder.add_edge("node_respond_static", END)
    builder.add_edge("node_retrieve", "node_respond")
    builder.add_edge("node_respond", END)
    builder.add_edge("node_multi_lookup", END)
    builder.add_edge("node_multi_confirm", END)
    builder.add_edge("node_add_to_cart", END)
    builder.add_edge("node_quote_graph", END)
    builder.add_edge("node_stock_alert", END)
    builder.add_edge("node_stagnant_products", END)
    builder.add_edge("node_sales_analytics", END)
    builder.add_edge("node_memory_recall", END)
    builder.add_edge("node_respond_llm", END)

    return builder.compile()


_chat_graph = _build_chat_graph()


# ─────────────────────────────────────────────────────────────
# Etiquetas de progreso por nodo (para SSE streaming)
# ─────────────────────────────────────────────────────────────

_NODE_LABELS: dict[str, str] = {
    "node_classify": "Analizando tu consulta...",
    "node_retrieve": "Buscando en el catálogo...",
    "node_respond": "Preparando respuesta...",
    "node_multi_lookup": "Buscando los productos...",
    "node_multi_confirm": "Procesando tu selección...",
    "node_add_to_cart": "Agregando al carrito...",
    "node_quote_graph": "Armando el presupuesto...",
    "node_stock_alert": "Revisando stock...",
    "node_stagnant_products": "Buscando productos sin movimiento...",
    "node_sales_analytics": "Analizando ventas...",
    "node_memory_recall": "Buscando en mi memoria...",
    "node_respond_llm": "Formulando respuesta...",
    "node_respond_static": "Respondiendo...",
}


# ─────────────────────────────────────────────────────────────
# Memory write helpers (post-graph, fire-and-forget)
# ─────────────────────────────────────────────────────────────


def _build_product_term_entry(state: dict, bid: str) -> str:
    """Build a product-terms entry: '{search_term} -> {description} ({code})'."""
    term = (state.get("intent_params") or {}).get("term", "").strip()
    products = state.get("response_products") or []
    if not term or not products:
        return ""
    p = products[0]
    desc = (p.get("description") or "").strip()
    code = (p.get("code") or "").strip()
    if not desc and not code:
        return ""
    return f"{term} -> {desc} ({code})"


def _build_cart_entry(state: dict, bid: str) -> str:
    """Build a purchase-patterns entry: '{date} | {qty}x {desc}, ...'."""
    items = state.get("response_cart_items") or []
    if not items:
        return ""
    today = date.today().isoformat()
    parts: list[str] = []
    for item in items:
        p = item.get("product") or {}
        qty = item.get("qty", 1)
        desc = (p.get("description") or "").strip()
        if desc:
            parts.append(f"{int(qty)}x {desc}")
    if not parts:
        return ""
    return f"{today} | {', '.join(parts)}"


def _build_quote_entry(state: dict, bid: str) -> str:
    """Build a quote-patterns entry: '{date} | {desc} x{qty}; ...'."""
    quote = state.get("response_quote") or {}
    draft = quote.get("draft") or {}
    items = draft.get("items") or []
    if not items:
        return ""
    today = date.today().isoformat()
    parts: list[str] = []
    for item in items:
        desc = (item.get("description") or "").strip()
        qty = item.get("qty", 1)
        if desc:
            parts.append(f"{desc} x{int(qty)}")
    if not parts:
        return ""


# intent -> (category, expected_response_type, content_builder)
# Intents NOT listed here (greeting, about_luci, no_llm, general, refinement,
# multi_item_query, quote_intent, stock_alert, stagnant_products, sales_analytics)
# produce no memory write — omission is intentional (v1 scope).
_INTENT_MEMORY_DISPATCH: dict[str, tuple[str, str, Any]] = {
    "product_query": ("product-terms", "products", _build_product_term_entry),
    "add_to_cart": ("purchase-patterns", "cart_action", _build_cart_entry),
    "multi_item_confirm": ("purchase-patterns", "cart_action", _build_cart_entry),
    "quote_with_items": ("quote-patterns", "quote", _build_quote_entry),
}


def _build_conversation_entry(state: dict, business_id: str) -> str:
    """Build a general conversation entry: 'msg -> response'."""
    msg = (state.get("message") or "").strip()
    resp = (state.get("response_text") or "").strip()
    if not msg or not resp:
        return ""
    # Truncate long messages
    if len(msg) > 200:
        msg = msg[:200] + "..."
    if len(resp) > 500:
        resp = resp[:500] + "..."
    from datetime import date

    return f"{date.today().isoformat()} | Usuario: {msg} → Luci: {resp}"


_NOISE_INTENTS = frozenset({"greeting", "about_luci", "no_llm"})


def _maybe_save_intent_memory(state: dict, business_id: str) -> bool:
    """Fire-and-forget per-business memory write for high-signal intents
    AND general conversations. Returns True if memory was saved."""
    if not business_id or not get_settings().ENGRAM_ENABLED:
        return False
    intent = state.get("intent", "")
    rtype = state.get("response_type", "text")

    # --- High-signal structured dispatch ---
    spec = _INTENT_MEMORY_DISPATCH.get(intent)
    if spec is not None:
        category, expected_rtype, builder = spec
        if rtype == expected_rtype:
            content = builder(state, business_id)
            if content:
                topic_key = f"business/{business_id}/{category}"
                title = f"[{business_id}] {category}"
                strategy = "merge" if category == "product-terms" else "append_cap"
                try:
                    asyncio.ensure_future(
                        save_aggregate_memory(
                            title=title,
                            new_entry=content,
                            topic_key=topic_key,
                            business_id=business_id,
                            strategy=strategy,
                        )
                    )
                    return True
                except RuntimeError:
                    logger.info(
                        "[Luci/Engram] no running loop, skip memory save for intent=%r", intent
                    )
        return False  # handled — no fallback

    # --- General conversation save (non-noise intents) ---
    if intent in _NOISE_INTENTS:
        return False

    content = _build_conversation_entry(state, business_id)
    if not content:
        return False

    topic_key = f"business/{business_id}/conversations"
    title = f"[{business_id}] conversations"
    try:
        asyncio.ensure_future(
            save_aggregate_memory(
                topic_key=topic_key,
                business_id=business_id,
                strategy="append_cap",
            )
        )
        return True
    except RuntimeError:
        logger.info(
            "[Luci/Engram] no running loop, skip conversation memory save for intent=%r", intent
        )
        return False


# ─────────────────────────────────────────────────────────────
# Punto de entrada — sin streaming
# ─────────────────────────────────────────────────────────────


async def run_chat_agent(
    message: str,
    history: list[dict],
    business_id: str,
    db: AsyncSession,
    input_file: bytes | None = None,
    input_file_type: str | None = None,
    user_name: str = "",
) -> dict:
    import asyncio

    message = _sanitize_user_message(message)
    history = _sanitize_history(history)

    db_products = await _load_catalog_products(db, business_id)
    memory_context = await get_business_memory_context(
        message,
        business_id=business_id,
        limit=5,
    )

    low_stock = []
    stagnant = []
    sales_summaries: dict = {}
    try:
        low_stock = await get_low_stock_products(db, business_id)
        stagnant = await get_stagnant_products(db, business_id, days=90)
        for period in ("month", "quarter", "year"):
            sales_summaries[period] = await get_sales_summary(db, business_id, period)
    except Exception as e:
        logger.warning(f"[Luci] preload business data failed: {e}")

    # Intentar resolver el proveedor IA
    has_llm = True
    ai_provider = ai_api_key = ai_model = ""
    try:
        ai_provider, ai_api_key, ai_model = await LLMFactory.resolve(business_id, db)
    except ValueError:
        has_llm = False

    ai_client = classifier_client = None
    classifier_model = ""
    if has_llm:
        ai_client = LLMFactory.build_openai_compatible(ai_api_key, ai_provider)
        classifier_client, classifier_model = LLMFactory.build_classifier_client(
            ai_api_key, ai_provider
        )

    initial_state: ChatState = {
        "message": message,
        "history": history,
        "user_name": user_name,
        "memory_context": memory_context,
        "db_products": db_products,
        "ai_client": ai_client,
        "ai_model": ai_model,
        "ai_provider": ai_provider,
        "classifier_client": classifier_client,
        "classifier_model": classifier_model,
        "has_llm": has_llm,
        "business_id": business_id,
        "db": db,
        "low_stock_products": low_stock,
        "stagnant_products_list": stagnant,
        "sales_summaries": sales_summaries,
        "intent": "",
        "intent_params": {},
        "retrieved_products": [],
        "multi_context": None,
        "quote_draft": None,
        "response_type": "text",
        "response_text": "",
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }

    # Inyectar campos extra que los nodos necesitan pero TypedDict no declara
    initial_state["input_file"] = input_file  # type: ignore[typeddict-unknown-key]
    initial_state["input_file_type"] = input_file_type  # type: ignore[typeddict-unknown-key]

    def _run():
        _thread_local.client = ai_client
        _thread_local.model = ai_model
        _thread_local.provider = ai_provider
        return _chat_graph.invoke(initial_state)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_ai_executor, _run)

    # Fire-and-forget per-business memory write (Layer 1)
    memory_saved = _maybe_save_intent_memory(result, business_id)
    result_text = result.get("response_text", "")
    if memory_saved and result_text:
        result_text += "\n\n[MEMORIA GUARDADA]"

    return {
        "response_type": result.get("response_type", "text"),
        "text": result_text,
        "products": result.get("response_products"),
        "quote": result.get("response_quote"),
        "cart_items": result.get("response_cart_items"),
    }


# ─────────────────────────────────────────────────────────────
# Punto de entrada — con streaming SSE
# ─────────────────────────────────────────────────────────────


async def run_chat_agent_streaming(
    message: str,
    history: list[dict],
    business_id: str,
    db: AsyncSession,
    input_file: bytes | None = None,
    input_file_type: str | None = None,
    user_name: str = "",
):
    import asyncio
    import queue as _queue

    message = _sanitize_user_message(message)
    history = _sanitize_history(history)

    db_products = await _load_catalog_products(db, business_id)
    memory_context = await get_business_memory_context(
        message,
        business_id=business_id,
        limit=5,
    )

    low_stock = []
    stagnant = []
    sales_summaries: dict = {}
    try:
        low_stock = await get_low_stock_products(db, business_id)
        stagnant = await get_stagnant_products(db, business_id, days=90)
        for period in ("month", "quarter", "year"):
            sales_summaries[period] = await get_sales_summary(db, business_id, period)
    except Exception as e:
        logger.warning(f"[Luci] preload business data failed: {e}")

    has_llm = True
    ai_provider = ai_api_key = ai_model = ""
    try:
        ai_provider, ai_api_key, ai_model = await LLMFactory.resolve(business_id, db)
    except ValueError:
        has_llm = False

    ai_client = classifier_client = None
    classifier_model = ""
    if has_llm:
        ai_client = LLMFactory.build_openai_compatible(ai_api_key, ai_provider)
        classifier_client, classifier_model = LLMFactory.build_classifier_client(
            ai_api_key, ai_provider
        )

    initial_state: ChatState = {
        "message": message,
        "history": history,
        "user_name": user_name,
        "memory_context": memory_context,
        "db_products": db_products,
        "ai_client": ai_client,
        "ai_model": ai_model,
        "ai_provider": ai_provider,
        "classifier_client": classifier_client,
        "classifier_model": classifier_model,
        "has_llm": has_llm,
        "business_id": business_id,
        "db": db,
        "low_stock_products": low_stock,
        "stagnant_products_list": stagnant,
        "sales_summaries": sales_summaries,
        "intent": "",
        "intent_params": {},
        "retrieved_products": [],
        "multi_context": None,
        "quote_draft": None,
        "response_type": "text",
        "response_text": "",
        "response_products": None,
        "response_quote": None,
        "response_cart_items": None,
    }
    initial_state["input_file"] = input_file  # type: ignore[typeddict-unknown-key]
    initial_state["input_file_type"] = input_file_type  # type: ignore[typeddict-unknown-key]

    event_queue: _queue.Queue = _queue.Queue()

    def _run():
        try:
            _thread_local.client = ai_client
            _thread_local.model = ai_model
            _thread_local.provider = ai_provider

            final_state: dict = {}
            for chunk in _chat_graph.stream(initial_state, stream_mode="updates"):
                for node_name, node_update in chunk.items():
                    label = _NODE_LABELS.get(node_name, f"Procesando {node_name}...")
                    event_queue.put(("thinking", label))
                    final_state.update(node_update)

            result = {
                "response_type": final_state.get("response_type", "text"),
                "text": final_state.get("response_text", ""),
                "products": final_state.get("response_products"),
                "quote": final_state.get("response_quote"),
                "cart_items": final_state.get("response_cart_items"),
            }
            # Pass final_state fields needed for memory write through the queue
            # BEFORE "result" so the async consumer can handle it first (Rule B)
            memory_snapshot = {
                "intent": final_state.get("intent", ""),
                "intent_params": final_state.get("intent_params", {}),
                "response_type": final_state.get("response_type", "text"),
                "response_text": final_state.get("response_text", ""),
                "response_products": final_state.get("response_products"),
                "response_quote": final_state.get("response_quote"),
                "response_cart_items": final_state.get("response_cart_items"),
                "retrieved_products": final_state.get("retrieved_products", []),
                "message": final_state.get("message", ""),
            }
            event_queue.put(("memory", memory_snapshot))
            event_queue.put(("result", result))

        except Exception as e:
            logger.error(f"[Luci/stream] Error: {e}", exc_info=True)
            event_queue.put(("error", str(e)))
        finally:
            event_queue.put(("done", None))

    loop = asyncio.get_event_loop()
    loop.run_in_executor(_ai_executor, _run)

    memory_saved = False
    while True:
        try:
            event_type, payload = await loop.run_in_executor(
                None, lambda: event_queue.get(timeout=60)
            )
        except _queue.Empty:
            yield f"data: {json.dumps({'type': 'error', 'text': 'Timeout del agente.'})}\n\n"
            break

        if event_type == "done":
            break
        elif event_type == "thinking":
            yield f"data: {json.dumps({'type': 'thinking', 'text': payload})}\n\n"
        elif event_type == "memory":
            saved = _maybe_save_intent_memory(payload, business_id)
            if saved:
                memory_saved = True
            continue
        elif event_type == "result":
            if memory_saved and payload.get("text"):
                payload["text"] += "\n\n[MEMORIA GUARDADA]"
            yield f"data: {json.dumps({'type': 'result', **payload}, ensure_ascii=False)}\n\n"
            break
        elif event_type == "error":
            yield f"data: {json.dumps({'type': 'error', 'text': payload})}\n\n"
            break
