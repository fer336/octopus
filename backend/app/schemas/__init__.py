"""
Schemas Pydantic del sistema.
"""
from app.schemas.base import BaseResponse, BaseSchema, MessageResponse, PaginatedResponse
from app.schemas.category import (
    CategoryCreate,
    CategoryListParams,
    CategoryResponse,
    CategoryUpdate,
    CategoryWithChildren,
)
from app.schemas.client import ClientCreate, ClientListParams, ClientResponse, ClientUpdate
from app.schemas.product import ProductCreate, ProductListParams, ProductResponse, ProductUpdate
from app.schemas.supplier import SupplierCreate, SupplierListParams, SupplierResponse, SupplierUpdate

__all__ = [
    # Base
    "BaseSchema",
    "BaseResponse",
    "PaginatedResponse",
    "MessageResponse",
    # Product
    "ProductCreate",
    "ProductUpdate",
    "ProductResponse",
    "ProductListParams",
    # Client
    "ClientCreate",
    "ClientUpdate",
    "ClientResponse",
    "ClientListParams",
    # Supplier
    "SupplierCreate",
    "SupplierUpdate",
    "SupplierResponse",
    "SupplierListParams",
    # Category
    "CategoryCreate",
    "CategoryUpdate",
    "CategoryResponse",
    "CategoryWithChildren",
    "CategoryListParams",
]
