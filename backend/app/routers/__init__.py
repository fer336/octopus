"""
Routers de la API.
"""

from app.routers import (
    auth,
    categories,
    clients,
    products,
    suppliers,
    feedback,
    reports,
)

__all__ = [
    "auth",
    "products",
    "clients",
    "suppliers",
    "categories",
    "feedback",
    "reports",
]
