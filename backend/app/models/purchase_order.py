"""
Modelos de Orden de Pedido y sus ítems.
Registra las órdenes generadas a proveedores tras un control de inventario físico.
"""
import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, Numeric, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PurchaseOrderStatus(str, enum.Enum):
    """Estados posibles de una orden de pedido."""

    DRAFT = "draft"          # Borrador — editable
    CONFIRMED = "confirmed"  # Confirmada — solo lectura


class PurchaseOrder(BaseModel):
    """
    Orden de pedido a un proveedor.
    Se genera tras cargar el conteo físico de un control de inventario.
    Puede filtrarse por proveedor, categoría o ambos.
    """

    __tablename__ = "purchase_orders"

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
    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("categories.id"),
        nullable=True,
        index=True,
    )
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    status = Column(
        Enum(PurchaseOrderStatus),
        default=PurchaseOrderStatus.DRAFT,
        nullable=False,
        index=True,
    )

    # Totales calculados
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)   # Sin IVA
    total_iva = Column(Numeric(14, 2), default=0, nullable=False)  # IVA total
    total = Column(Numeric(14, 2), default=0, nullable=False)      # subtotal + IVA

    notes = Column(Text, nullable=True)

    confirmed_at = Column(DateTime, nullable=True)

    # Relaciones
    business = relationship("Business")
    supplier = relationship("Supplier")
    category = relationship("Category")
    created_by_user = relationship("User")
    items = relationship(
        "PurchaseOrderItem",
        back_populates="purchase_order",
        cascade="all, delete-orphan",
    )

    def recalculate_totals(self) -> None:
        """Recalcula subtotal, total_iva y total a partir de los ítems."""
        subtotal = sum(item.subtotal or 0 for item in self.items)
        total_iva = sum(item.iva_amount or 0 for item in self.items)
        self.subtotal = round(subtotal, 2)
        self.total_iva = round(total_iva, 2)
        self.total = round(subtotal + total_iva, 2)

    def __repr__(self) -> str:
        return f"<PurchaseOrder {self.id} status={self.status}>"


class PurchaseOrderItem(BaseModel):
    """
    Ítem de una orden de pedido.
    Registra el conteo físico, la cantidad a pedir y el costo unitario.
    El precio de costo es editable manualmente por el operador.
    """

    __tablename__ = "purchase_order_items"

    purchase_order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purchase_orders.id"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id"),
        nullable=False,
        index=True,
    )

    # Datos del conteo físico
    system_stock = Column(Integer, default=0, nullable=False)   # Stock del sistema al momento del conteo
    counted_stock = Column(Integer, nullable=True)              # Stock físico contado por el operador

    # Cantidad a pedir
    quantity_to_order = Column(Integer, default=0, nullable=False)

    # Precio de costo unitario (con bonificaciones aplicadas, sin IVA)
    # Editable manualmente si el proveedor actualizó precios
    unit_cost = Column(Numeric(12, 2), default=0, nullable=False)

    # IVA del producto
    iva_rate = Column(Numeric(5, 2), default=21.00, nullable=False)

    # Totales por ítem
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)    # unit_cost × quantity_to_order
    iva_amount = Column(Numeric(14, 2), default=0, nullable=False)  # subtotal × iva_rate / 100
    total = Column(Numeric(14, 2), default=0, nullable=False)       # subtotal + iva_amount

    # Relaciones
    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product")

    def recalculate(self) -> None:
        """Recalcula subtotal, iva_amount y total para este ítem."""
        from decimal import Decimal
        unit_cost = Decimal(str(self.unit_cost or 0))
        qty = Decimal(str(self.quantity_to_order or 0))
        iva_rate = Decimal(str(self.iva_rate or 0))

        subtotal = unit_cost * qty
        iva_amount = subtotal * iva_rate / 100

        self.subtotal = round(subtotal, 2)
        self.iva_amount = round(iva_amount, 2)
        self.total = round(subtotal + iva_amount, 2)

    def __repr__(self) -> str:
        return f"<PurchaseOrderItem product={self.product_id} qty={self.quantity_to_order}>"
