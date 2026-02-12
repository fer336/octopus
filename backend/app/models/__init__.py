"""
Modelos SQLAlchemy del sistema.
Exporta todos los modelos para facilitar las importaciones.
"""
from app.models.base import BaseModel
from app.models.business import Business
from app.models.category import Category
from app.models.client import Client
from app.models.client_account import ClientAccount, MovementType
from app.models.payment import Payment, PaymentMethod
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.supplier import Supplier
from app.models.supplier_category import supplier_category
from app.models.supplier_category_discount import SupplierCategoryDiscount
from app.models.user import User
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem

__all__ = [
    # Base
    "BaseModel",
    # Usuarios y negocios
    "User",
    "Business",
    # Entidades principales
    "Category",
    "Supplier",
    "supplier_category",
    "SupplierCategoryDiscount",
    "Client",
    "Product",
    # Historial
    "PriceHistory",
    # Comprobantes
    "Voucher",
    "VoucherType",
    "VoucherStatus",
    "VoucherItem",
    # Pagos y cuenta corriente
    "Payment",
    "PaymentMethod",
    "ClientAccount",
    "MovementType",
]
