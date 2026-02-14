"""
Modelo de Comprobante.
Representa cotizaciones, remitos y facturas.
"""
import enum

from sqlalchemy import Column, Date, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class VoucherType(str, enum.Enum):
    """Tipos de comprobantes disponibles."""

    QUOTATION = "quotation"  # Cotización
    RECEIPT = "receipt"  # Remito
    INVOICE_A = "invoice_a"  # Factura A
    INVOICE_B = "invoice_b"  # Factura B
    INVOICE_C = "invoice_c"  # Factura C
    CREDIT_NOTE_A = "credit_note_a"  # Nota de Crédito A
    CREDIT_NOTE_B = "credit_note_b"  # Nota de Crédito B
    CREDIT_NOTE_C = "credit_note_c"  # Nota de Crédito C
    DEBIT_NOTE_A = "debit_note_a"  # Nota de Débito A
    DEBIT_NOTE_B = "debit_note_b"  # Nota de Débito B
    DEBIT_NOTE_C = "debit_note_c"  # Nota de Débito C


class VoucherStatus(str, enum.Enum):
    """Estados posibles de un comprobante."""

    DRAFT = "draft"  # Borrador
    CONFIRMED = "confirmed"  # Confirmado
    CANCELLED = "cancelled"  # Anulado


class Voucher(BaseModel):
    """
    Comprobante de venta.
    Puede ser cotización, remito o factura electrónica.
    """

    __tablename__ = "vouchers"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=False,
        index=True,
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    # Tipo y estado
    voucher_type = Column(Enum(VoucherType), nullable=False, index=True)
    status = Column(Enum(VoucherStatus), default=VoucherStatus.DRAFT, nullable=False)

    # Numeración
    sale_point = Column(String(5), nullable=False)  # 0001
    number = Column(String(8), nullable=False)  # 00000001

    # Fechas
    date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=True)  # Vigencia de cotización o vencimiento

    # Totales
    subtotal = Column(Numeric(12, 2), default=0, nullable=False)  # Sin IVA
    iva_amount = Column(Numeric(12, 2), default=0, nullable=False)
    total = Column(Numeric(12, 2), default=0, nullable=False)

    # Datos ARCA (para facturas electrónicas)
    cae = Column(String(20), nullable=True)
    cae_expiration = Column(Date, nullable=True)
    arca_response = Column(Text, nullable=True)  # JSON completo de la respuesta
    barcode = Column(String(100), nullable=True)  # Código de barras
    qr_data = Column(Text, nullable=True)  # Datos para QR

    # Observaciones
    notes = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)  # Notas internas (no salen en PDF)

    # Para remitos
    show_prices = Column(String(1), default="S")  # S/N - Mostrar precios en remito
    
    # Auditoría de eliminación
    deleted_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    deletion_reason = Column(Text, nullable=True)

    # Relaciones
    business = relationship("Business")
    client = relationship("Client", back_populates="vouchers")
    deleted_by_user = relationship("User", foreign_keys=[deleted_by])
    items = relationship(
        "VoucherItem",
        back_populates="voucher",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    payments = relationship("Payment", back_populates="voucher", lazy="dynamic")
    voucher_payments = relationship("VoucherPayment", back_populates="voucher", cascade="all, delete-orphan", lazy="selectin")
    
    # TODO: Descomentar cuando la migración se ejecute correctamente
    # # Relación jerárquica (para Notas de Crédito que apuntan a una Factura)
    # related_voucher_id = Column(UUID(as_uuid=True), ForeignKey("vouchers.id"), nullable=True)
    # 
    # # Relación con comprobante padre (ej: NC -> Factura original)
    # related_voucher = relationship(
    #     "Voucher",
    #     remote_side="Voucher.id",
    #     back_populates="credit_notes",
    #     foreign_keys=[related_voucher_id],
    # )
    # 
    # # Hijos (ej: Factura -> NCs asociadas)
    # credit_notes = relationship(
    #     "Voucher",
    #     back_populates="related_voucher",
    #     foreign_keys=[related_voucher_id],
    #     lazy="selectin",
    # )

    @property
    def full_number(self) -> str:
        """Retorna el número completo del comprobante."""
        return f"{self.sale_point}-{self.number}"

    @property
    def has_credit_note(self) -> bool:
        """Indica si el comprobante tiene notas de crédito asociadas."""
        if not self.credit_notes:
            return False
        # Verificar si alguno de los hijos es una nota de crédito
        # Convertimos enum a string por seguridad
        return any("credit_note" in str(child.voucher_type) for child in self.credit_notes)

    def __repr__(self) -> str:
        return f"<Voucher {self.voucher_type.value} {self.full_number}>"
