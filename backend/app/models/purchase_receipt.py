"""
Modelos de Remito de Proveedor (Compras — recepción de mercadería).
Registra la llegada física de mercadería, independiente de cuándo llegue
la factura del proveedor. Puede confirmarse (impactando stock) antes,
después o sin ninguna factura vinculada — ver `purchase_invoice_id`.
"""
import enum
from datetime import date

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PurchaseReceiptStatus(str, enum.Enum):
    """Estados posibles de un remito de proveedor."""

    DRAFT = "draft"          # Borrador — editable, no impacta stock
    CONFIRMED = "confirmed"  # Confirmado — creó lotes de stock (si update_stock=True)


class PurchaseReceipt(BaseModel):
    """
    Remito de un proveedor (recepción de mercadería).
    Registra qué llegó y cuándo, sin datos de costo/precio (eso es
    responsabilidad exclusiva de la factura). `purchase_invoice_id` se
    completa cuando este remito se vincula a la factura real del proveedor,
    ya sea antes o después de confirmarse.
    """

    __tablename__ = "purchase_receipts"

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
    purchase_invoice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_invoices.id"),
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
        Enum(PurchaseReceiptStatus),
        default=PurchaseReceiptStatus.DRAFT,
        nullable=False,
        index=True,
    )

    # Número del remito físico que trae el transportista
    receipt_number = Column(String(50), nullable=False, index=True)
    # Fecha real de llegada de la mercadería — se usa tal cual como
    # ProductLot.received_date al confirmar (no la fecha del servidor).
    received_date = Column(Date, nullable=False, default=date.today)

    # Pista de texto libre: número de la factura que se espera recibir
    # después, útil antes de que esa factura exista en el sistema.
    expected_invoice_number = Column(String(50), nullable=True)

    # Simetría con PurchaseInvoice.update_stock: permite cargar un remito
    # "solo registro" que no impacte stock al confirmarse.
    update_stock = Column(Boolean, default=True, nullable=False)

    notes = Column(Text, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    deletion_reason = Column(Text, nullable=True)

    # Relaciones
    business = relationship("Business")
    supplier = relationship("Supplier")
    purchase_invoice = relationship("PurchaseInvoice")
    created_by_user = relationship("User", foreign_keys=[created_by])
    confirmed_by_user = relationship("User", foreign_keys=[confirmed_by])
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])
    items = relationship(
        "PurchaseReceiptItem",
        back_populates="purchase_receipt",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<PurchaseReceipt {self.receipt_number} status={self.status}>"


class PurchaseReceiptItem(BaseModel):
    """
    Ítem de un remito de proveedor.
    Sin costo/precio: el remito es prueba de recepción física, no
    documento fiscal. `product_id` es obligatorio (a diferencia de
    `PurchaseInvoiceItem.product_id`, que puede quedar sin matchear cuando
    viene de extracción IA) porque el remito siempre es carga manual y su
    único propósito es mover stock. `lot_id` se completa al confirmar.
    """

    __tablename__ = "purchase_receipt_items"

    purchase_receipt_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False,
        index=True,
    )
    lot_id = Column(
        UUID(as_uuid=True),
        ForeignKey("product_lots.id"),
        nullable=True,
        index=True,
    )

    quantity = Column(Numeric(12, 2), nullable=False)
    expiration_date = Column(Date, nullable=True)
    notes = Column(String(500), nullable=True)

    # Relaciones
    purchase_receipt = relationship("PurchaseReceipt", back_populates="items")
    product = relationship("Product")
    lot = relationship("ProductLot")

    def __repr__(self) -> str:
        return f"<PurchaseReceiptItem product_id={self.product_id}: qty={self.quantity}>"
