"""
Memoria semántica para Luci vía Engram HTTP.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

MAX_MEMORY_CONTEXT_CHARS = 1200


def _trim_text(value: Any, max_chars: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3].rstrip() + "..."


def _extract_observations(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("observations", "results", "items", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    result = payload.get("result")
    if isinstance(result, list):
        return [item for item in result if isinstance(item, dict)]
    if isinstance(result, dict):
        return _extract_observations(result)

    return []


def _format_memory_context(observations: list[dict[str, Any]]) -> str:
    lines: list[str] = []

    for obs in observations:
        title = _trim_text(obs.get("title") or obs.get("name") or "Memoria", 120)
        content = _trim_text(
            obs.get("content")
            or obs.get("text")
            or obs.get("body")
            or obs.get("observation")
            or "",
            360,
        )
        if not title and not content:
            continue

        line = f"- {title}"
        if content:
            line += f": {content}"
        lines.append(line)

        joined = "\n".join(lines)
        if len(joined) >= MAX_MEMORY_CONTEXT_CHARS:
            return _trim_text(joined, MAX_MEMORY_CONTEXT_CHARS)

    return _trim_text("\n".join(lines), MAX_MEMORY_CONTEXT_CHARS)


async def get_business_memory_context(
    query: str,
    *,
    business_id: str,
    user_id: str | None = None,
    limit: int = 5,
) -> str:
    """
    Recupera contexto semántico compacto desde Engram.

    Engram orienta la conversación, pero no reemplaza datos transaccionales de PostgreSQL.
    """
    settings = get_settings()
    if not settings.ENGRAM_ENABLED:
        return ""

    search_query = _trim_text(f"{query} negocio:{business_id}", 500)

    try:
        async with httpx.AsyncClient(
            base_url=settings.ENGRAM_BASE_URL.rstrip("/"),
            timeout=settings.ENGRAM_TIMEOUT_SECONDS,
        ) as client:
            response = await client.get(
                "/search",
                params={
                    "q": search_query,
                    "project": settings.ENGRAM_PROJECT,
                    "scope": "project",
                    "limit": max(1, min(limit, 10)),
                },
            )
            response.raise_for_status()
            return _format_memory_context(_extract_observations(response.json()))
    except Exception as exc:
        logger.info("[Luci/Engram] memoria no disponible: %s", exc)
        return ""


async def save_business_memory(
    title: str,
    content: str,
    *,
    memory_type: str = "learning",
    topic_key: str | None = None,
    business_id: str | None = None,
) -> bool:
    """Guarda una memoria semántica futura para Luci, sin bloquear el chat si falla."""
    settings = get_settings()
    if not settings.ENGRAM_ENABLED:
        return False

    session_parts = [settings.ENGRAM_SESSION_ID_PREFIX]
    if business_id:
        session_parts.append(str(business_id))

    payload: dict[str, Any] = {
        "session_id": "-".join(session_parts),
        "type": memory_type,
        "title": _trim_text(title, 200),
        "content": content,
        "project": settings.ENGRAM_PROJECT,
        "scope": "project",
    }
    if topic_key:
        payload["topic_key"] = topic_key

    try:
        async with httpx.AsyncClient(
            base_url=settings.ENGRAM_BASE_URL.rstrip("/"),
            timeout=settings.ENGRAM_TIMEOUT_SECONDS,
        ) as client:
            response = await client.post("/observations", json=payload)
            response.raise_for_status()
            return True
    except Exception as exc:
        logger.info("[Luci/Engram] no se pudo guardar memoria: %s", exc)
        return False
