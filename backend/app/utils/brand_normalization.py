"""Helpers para normalizar nombres de marcas."""

from __future__ import annotations

import re


def normalize_brand_name(name: str) -> str:
    """Normaliza marcas para evitar duplicados por mayúsculas, puntos o espacios."""
    normalized = name.strip().casefold().replace("_", "")
    normalized = re.sub(r"[^\w\s]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()
