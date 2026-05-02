"""
Routers de la API.
"""

from app.routers import (
    auth,
    categories,
    client_authorizations,
    client_types,
    clients,
    feedback,
    products,
    reports,
    suppliers,
)

__all__ = [
    "auth",
    "products",
    "clients",
    "client_authorizations",
    "client_types",
    "suppliers",
    "categories",
    "feedback",
    "reports",
]
