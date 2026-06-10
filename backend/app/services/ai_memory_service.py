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


async def save_aggregate_memory(
    title: str,
    new_entry: str,
    *,
    topic_key: str,
    business_id: str,
    strategy: str,
    cap: int = 20,
) -> bool:
    """
    Read-merge-write upsert for aggregated per-business memory observations.

    strategy="merge"      — dedup by entry key (text left of "->"), replace/insert.
    strategy="append_cap" — append new_entry, keep last `cap` lines FIFO.

    Returns False if ENGRAM_ENABLED is False, topic_key is None, or write fails.
    """
    settings = get_settings()
    if not settings.ENGRAM_ENABLED:
        return False

    if topic_key is None:
        return False

    # Step 1: Read existing content for this topic_key
    existing_lines: list[str] = []
    try:
        async with httpx.AsyncClient(
            base_url=settings.ENGRAM_BASE_URL.rstrip("/"),
            timeout=settings.ENGRAM_TIMEOUT_SECONDS,
        ) as client:
            resp = await client.get(
                "/search",
                params={
                    "q": f"business_id: {business_id}",
                    "project": settings.ENGRAM_PROJECT,
                    "scope": "project",
                    "limit": 5,
                },
            )
            if resp.status_code == 200:
                obs_list = _extract_observations(resp.json())
                for obs in obs_list:
                    obs_key = obs.get("topic_key") or obs.get("topicKey") or ""
                    if obs_key == topic_key:
                        raw_content = (
                            obs.get("content") or obs.get("text") or obs.get("body") or ""
                        )
                        existing_lines = [
                            line
                            for line in raw_content.splitlines()
                            if line.strip() and not line.startswith("business_id:")
                        ]
                        break
    except Exception as exc:
        logger.info("[Luci/Engram] read-for-aggregate failed, starting fresh: %s", exc)
        existing_lines = []

    # Step 2: Apply strategy
    if strategy == "merge":
        def _entry_key(line: str) -> str:
            return line.split("->")[0].strip().lower()

        new_key = _entry_key(new_entry)
        merged = [line for line in existing_lines if _entry_key(line) != new_key]
        merged.append(new_entry)
        final_lines = merged
    elif strategy == "append_cap":
        final_lines = existing_lines + [new_entry]
        if len(final_lines) > cap:
            final_lines = final_lines[-cap:]
    else:
        logger.warning("[Luci/Engram] unknown strategy %r, falling back to append", strategy)
        final_lines = existing_lines + [new_entry]

    # Step 3: Compose content with business_id header (multi-tenancy boundary)
    content = f"business_id: {business_id}\n" + "\n".join(final_lines)

    # Step 4: Delegate to save_business_memory (handles Engram POST)
    return await save_business_memory(
        title=title,
        content=content,
        topic_key=topic_key,
        business_id=business_id,
    )


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
