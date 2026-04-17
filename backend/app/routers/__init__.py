"""
Routers de la API.
"""

from app.routers import (
    auth,
    categories,
    clients,
    client_authorizations,
    client_types,
    products,
    suppliers,
    feedback,
    reports,
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
