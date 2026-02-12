"""
Modelo de Producto.
Incluye precios, bonificaciones, stock y cálculo automático de precio final.
"""
from decimal import Decimal

from sqlalchemy import Boolean, Column, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Product(BaseModel):
    """
    Producto del inventario.
    Los precios se calculan aplicando bonificaciones en cadena.
    """

    __tablename__ = "products"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("categories.id"),
        nullable=True,
        index=True,
    )
    supplier_id = Column(
        UUID(as_uuid=True),
        ForeignKey("suppliers.id"),
        nullable=True,
        index=True,
    )

    # Códigos
    code = Column(String(50), nullable=False, index=True)  # Código interno del negocio
    supplier_code = Column(String(50), nullable=True, index=True)  # Código del proveedor

    # Descripción
    description = Column(String(500), nullable=False, index=True)
    details = Column(Text, nullable=True)  # Descripción extendida

    # Precios base
    cost_price = Column(Numeric(12, 2), default=0, nullable=False)  # Precio de costo
    list_price = Column(Numeric(12, 2), default=0, nullable=False)  # Precio de lista

    # Bonificaciones en cadena
    discount_1 = Column(Numeric(5, 2), default=0, nullable=False)
    discount_2 = Column(Numeric(5, 2), default=0, nullable=False)
    discount_3 = Column(Numeric(5, 2), default=0, nullable=False)
    discount_display = Column(String(20), nullable=True)  # "20+30+10"
    
    # Cargo extra (flete, logística, etc.)
    extra_cost = Column(Numeric(5, 2), default=0, nullable=False)  # Porcentaje extra

    # Precios calculados
    net_price = Column(Numeric(12, 2), default=0, nullable=False)  # Precio sin IVA
    sale_price = Column(Numeric(12, 2), default=0, nullable=False)  # Precio final

    # IVA
    iva_rate = Column(Numeric(5, 2), default=21.00, nullable=False)  # 10.5, 21, 27, 0

    # Stock
    current_stock = Column(Integer, default=0, nullable=False)
    minimum_stock = Column(Integer, default=0, nullable=False)  # Alerta de stock bajo
    unit = Column(String(20), default="unidad", nullable=False)  # unidad, metro, kg, litro

    is_active = Column(Boolean, default=True, nullable=False)

    # Relaciones
    business = relationship("Business", back_populates="products")
    category = relationship("Category", back_populates="products")
    supplier = relationship("Supplier", back_populates="products")
    price_history = relationship("PriceHistory", back_populates="product", lazy="dynamic")

    def calculate_prices(self) -> None:
        """
        Calcula los precios aplicando bonificaciones en cadena según PRD.
        precio_con_bonif = precio_lista × (1 - bonif1/100) × (1 - bonif2/100) × (1 - bonif3/100)
        precio_venta = precio_con_bonif × (1 + IVA/100)
        """
        list_price = Decimal(str(self.list_price or 0))
        d1 = Decimal(str(self.discount_1 or 0))
        d2 = Decimal(str(self.discount_2 or 0))
        d3 = Decimal(str(self.discount_3 or 0))
        extra_cost = Decimal(str(self.extra_cost or 0))
        iva_rate = Decimal(str(self.iva_rate or 21))

        # Precio con bonificaciones (neto base)
        net_base = list_price * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
        
        # Aplicar cargo extra sobre el neto
        net_with_extra = net_base * (1 + extra_cost / 100)

        # Precio final con IVA
        sale = net_with_extra * (1 + iva_rate / 100)

        self.net_price = round(net_with_extra, 2)
        self.sale_price = round(sale, 2)

        # Formato de descuento para mostrar
        discounts = [d for d in [d1, d2, d3] if d > 0]
        self.discount_display = "+".join([str(int(d)) for d in discounts]) if discounts else None

    @property
    def is_low_stock(self) -> bool:
        """Indica si el stock está por debajo del mínimo."""
        return self.current_stock <= self.minimum_stock

    def __repr__(self) -> str:
        return f"<Product {self.code}: {self.description[:30]}>"
