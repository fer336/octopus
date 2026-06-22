"""
Utilidades ACL para permisos granulares por módulo dentro de tenant.
"""

from __future__ import annotations

import json
from typing import Any

from app.models.tenant_membership import MembershipRole

MODULE_KEYS = [
    "dashboard",
    "sales",
    "vouchers",
    "payment_methods",
    "cash",
    "products",
    "price_update",
    "price_lists",
    "inventory",
    "stockpiles",
    "clients",
    "suppliers",
    "categories",
    "reports",
    "feedback",
    "current_account",
    "settings",
    "sql_backup",
    "srx",
]


DEFAULT_MODULE_PERMISSIONS_BY_ROLE: dict[str, dict[str, bool]] = {
    MembershipRole.OWNER: {key: True for key in MODULE_KEYS},
    MembershipRole.MANAGER: {key: True for key in MODULE_KEYS},
    MembershipRole.SELLER: {
        "dashboard": True,
        "sales": True,
        "vouchers": True,
        "payment_methods": True,
        "cash": True,
        "products": True,
        "price_update": False,
        "price_lists": False,
        "inventory": False,
        "stockpiles": False,
        "clients": True,
        "suppliers": False,
        "categories": False,
        "reports": False,
        "feedback": True,
        "current_account": False,
        "sql_backup": False,
    },
}


def default_module_permissions(role: str) -> dict[str, bool]:
    """Retorna permisos default para un rol de membresía."""
    base = DEFAULT_MODULE_PERMISSIONS_BY_ROLE.get(role)
    if base is None:
        return {key: False for key in MODULE_KEYS}
    return dict(base)


def normalize_module_permissions(
    raw_permissions: dict[str, Any] | None,
    role: str,
) -> dict[str, bool]:
    """Normaliza permisos asegurando todas las claves conocidas."""
    defaults = default_module_permissions(role)
    if not raw_permissions:
        return defaults

    normalized = dict(defaults)
    for key in MODULE_KEYS:
        if key in raw_permissions:
            normalized[key] = bool(raw_permissions[key])
    return normalized


def parse_module_permissions(
    value: str | dict[str, Any] | None,
    role: str,
) -> dict[str, bool]:
    """Parsea permisos desde JSON string o dict y los normaliza."""
    if value is None:
        return default_module_permissions(role)

    if isinstance(value, dict):
        return normalize_module_permissions(value, role)

    try:
        loaded = json.loads(value)
    except Exception:
        return default_module_permissions(role)

    if not isinstance(loaded, dict):
        return default_module_permissions(role)

    return normalize_module_permissions(loaded, role)


def dump_module_permissions(permissions: dict[str, bool], role: str) -> str:
    """Serializa permisos normalizados para persistencia en DB."""
    normalized = normalize_module_permissions(permissions, role)
    return json.dumps(normalized, ensure_ascii=False, sort_keys=True)
