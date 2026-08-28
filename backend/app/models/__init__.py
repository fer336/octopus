"""
Modelos SQLAlchemy del sistema.
Exporta todos los modelos para facilitar las importaciones.
"""

from app.models.ai_provider_config import AIProvider, AIProviderConfig
from app.models.agent_credential import AgentCredential, AgentCredentialStatus, AgentSurface
from app.models.audit_log import AuditLog
from app.models.authorization import AuthorizationRequest, AuthorizationStatus, AuthorizationType
from app.models.base import BaseModel
from app.models.business import Business
from app.models.brand import Brand
from app.models.cash_register import (
    CashMovement,
    CashMovementType,
    CashPaymentMethod,
    CashRegister,
    CashRegisterStatus,
)
from app.models.category import Category
from app.models.client import Client
from app.models.client_account import ClientAccount, MovementType
from app.models.client_authorization import ClientAuthorization
from app.models.client_type import ClientType
from app.models.draft import Draft
from app.models.expense import Expense, ExpenseCategory
from app.models.lot_consumption import LotConsumption
from app.models.feedback_ticket import FeedbackTicket
from app.models.payment import Payment, PaymentMethod
from app.models.payment_receipt import PaymentReceipt
from app.models.payment_method import PaymentMethodCatalog
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.purchase_invoice import (
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseInvoiceSource,
    PurchaseInvoiceStatus,
)
from app.models.purchase_order import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
)
from app.models.purchase_receipt import (
    PurchaseReceipt,
    PurchaseReceiptItem,
    PurchaseReceiptStatus,
)
from app.models.supplier import Supplier
from app.models.supplier_category import supplier_category
from app.models.supplier_category_discount import SupplierCategoryDiscount
from app.models.tenant_membership import (
    MembershipAccessStatus,
    MembershipRole,
    TenantMembership,
)
from app.models.tenant_secret import TenantSecret
from app.models.user import User
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.models.voucher_payment import VoucherPayment
from app.models.product_lot import ProductLot
from app.models.stockpile import Stockpile, StockpileItem, StockpilePriceSnapshot, StockpileStatus
from app.models.price_list import PriceList, PriceListItem, PriceListSendLog
from app.models.cc_draft import CCDraft
from app.models.meli import (
    MeliCredentialStatus,
    MeliCredentials,
    MeliListing,
    MeliOrder,
    MeliSyncKind,
    MeliSyncQueue,
    MeliSyncStatus,
)

__all__ = [
    # Base
    "BaseModel",
    # Usuarios y negocios
    "User",
    "Business",
    "Brand",
    "AgentCredential",
    "AgentCredentialStatus",
    "AgentSurface",
    "TenantSecret",
    "TenantMembership",
    "MembershipRole",
    "MembershipAccessStatus",
    "AuditLog",
    "FeedbackTicket",
    # Autorizaciones
    "AuthorizationRequest",
    "AuthorizationStatus",
    "AuthorizationType",
    # Gastos
    "Expense",
    "ExpenseCategory",
    # Entidades principales
    "Category",
    "Supplier",
    "supplier_category",
    "SupplierCategoryDiscount",
    "Client",
    "ClientAuthorization",
    "ClientType",
    "Draft",
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
    "PaymentReceipt",
    "PaymentMethodCatalog",
    "VoucherPayment",
    "ClientAccount",
    "MovementType",
    # Caja
    "CashRegister",
    "CashMovement",
    "CashRegisterStatus",
    "CashMovementType",
    "CashPaymentMethod",
    # Órdenes de pedido
    "PurchaseOrder",
    "PurchaseOrderItem",
    "PurchaseOrderStatus",
    # Facturas de compra (Compras)
    "PurchaseInvoice",
    "PurchaseInvoiceItem",
    "PurchaseInvoiceStatus",
    "PurchaseInvoiceSource",
    # Remitos de proveedor (Compras)
    "PurchaseReceipt",
    "PurchaseReceiptItem",
    "PurchaseReceiptStatus",
    # Acopio
    "Stockpile",
    "StockpileItem",
    "StockpilePriceSnapshot",
    "StockpileStatus",
    # Lotes
    "ProductLot",
    "LotConsumption",
    # IA
    "AIProviderConfig",
    "AIProvider",
    # Price Lists
    "PriceList",
    "PriceListItem",
    "PriceListSendLog",
    # CC Drafts
    "CCDraft",
    # Mercado Libre
    "MeliCredentials",
    "MeliCredentialStatus",
    "MeliListing",
    "MeliSyncQueue",
    "MeliSyncKind",
    "MeliSyncStatus",
    "MeliOrder",
]
