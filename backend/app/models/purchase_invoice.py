"""
Modelos de Factura de Compra (Compras — carga manual e IA).
Registra facturas de proveedores en estado borrador hasta su confirmación,
momento en el cual pueden impactar stock (ProductLot) y precios (PriceHistory).
"""
import enum

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PurchaseInvoiceStatus(str, enum.Enum):
    """Estados posibles de una factura de compra."""

    DRAFT = "draft"          # Borrador — editable, no impacta stock/precios
    CONFIRMED = "confirmed"  # Confirmada — puede haber creado lotes/price_history


class PurchaseInvoiceSource(str, enum.Enum):
    """Origen de carga de la factura de compra."""

    MANUAL = "manual"  # Cargada manualmente por el usuario
    AI = "ai"           # Generada por extracción IA desde PDF


class PurchaseInvoice(BaseModel):
    """
    Factura de compra de un proveedor.
    Puede cargarse manualmente o generarse por IA a partir de un PDF.
    Queda en estado `draft` hasta que el usuario la confirma; recién ahí
    puede impactar stock (creando ProductLot) y precios (PriceHistory).
    """

    __tablename__ = "purchase_invoices"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    supplier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id"),
        nullable=True,
        index=True,
    )
    purchase_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id"),
        nullable=True,
        index=True,
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    confirmed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )
    deleted_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    status = Column(
        Enum(PurchaseInvoiceStatus),
        default=PurchaseInvoiceStatus.DRAFT,
        nullable=False,
        index=True,
    )
    source = Column(
        Enum(PurchaseInvoiceSource),
        nullable=False,
    )

    # Datos de la factura del proveedor (numeración propia del proveedor)
    invoice_number = Column(String(50), nullable=False, index=True)
    invoice_date = Column(Date, nullable=False)

    # Toggles de confirmación (independientes, aplican a toda la factura)
    update_stock = Column(Boolean, default=True, nullable=False)
    update_prices = Column(Boolean, default=False, nullable=False)

    # Totales calculados
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)    # Sin IVA
    iva_amount = Column(Numeric(14, 2), default=0, nullable=False)  # IVA total
    total = Column(Numeric(14, 2), default=0, nullable=False)       # subtotal + iva_amount

    # Documento fuente (clave del PDF subido en MinIO, si se cargó por IA)
    source_document_key = Column(String(500), nullable=True)

    # Advertencia de duplicado (supplier_id + invoice_number) reconocida por el usuario
    is_duplicate_ack = Column(Boolean, default=False, nullable=False)

    confirmed_at = Column(DateTime, nullable=True)
    deletion_reason = Column(Text, nullable=True)

    # Relaciones
    business = relationship("Business")
    supplier = relationship("Supplier")
    purchase_order = relationship("PurchaseOrder")
    created_by_user = relationship("User", foreign_keys=[created_by])
    confirmed_by_user = relationship("User", foreign_keys=[confirmed_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])
    items = relationship(
        "PurchaseInvoiceItem",
        back_populates="purchase_invoice",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<PurchaseInvoice {self.invoice_number} status={self.status}>"


class PurchaseInvoiceItem(BaseModel):
    """
    Ítem de una factura de compra.
    `product_id` es nulo cuando la IA no pudo matchear el producto contra
    el sistema; en ese caso `description` conserva el texto crudo extraído.
    `lot_id` se completa recién al confirmar (creación del ProductLot).
    """

    __tablename__ = "purchase_invoice_items"

    purchase_invoice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=True,
        index=True,
    )
    lot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("product_lots.id"),
        nullable=True,
        index=True,
    )

    # Texto crudo del ítem (fallback cuando no hay product_id matcheado)
    description = Column(String(500), nullable=False)

    quantity = Column(Numeric(12, 2), nullable=False)
    unit_cost = Column(Numeric(12, 2), default=0, nullable=False)
    iva_rate = Column(Numeric(5, 2), default=21.00, nullable=False)

    expiration_date = Column(Date, nullable=True)

    # Totales por ítem
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)    # unit_cost × quantity
    iva_amount = Column(Numeric(14, 2), default=0, nullable=False)  # subtotal × iva_rate / 100
    total = Column(Numeric(14, 2), default=0, nullable=False)       # subtotal + iva_amount

    # Relaciones
    purchase_invoice = relationship("PurchaseInvoice", back_populates="items")
    product = relationship("Product")
    lot = relationship("ProductLot")

    def recalculate(self) -> None:
        """Recalcula subtotal, iva_amount y total para este ítem."""
        from decimal import Decimal

        unit_cost = Decimal(str(self.unit_cost or 0))
        qty = Decimal(str(self.quantity or 0))
        iva_rate = Decimal(str(self.iva_rate or 0))

        subtotal = unit_cost * qty
        iva_amount = subtotal * iva_rate / 100

        self.subtotal = round(subtotal, 2)
        self.iva_amount = round(iva_amount, 2)
        self.total = round(subtotal + iva_amount, 2)

    def __repr__(self) -> str:
        return f"<PurchaseInvoiceItem {self.description[:30]}: qty={self.quantity}>"
