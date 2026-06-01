"""
Modelo de Producto.
Incluye precios, bonificaciones, stock y cálculo automático de precio final.
"""

from datetime import date
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
    brand_id = Column(
        UUID(as_uuid=True),
        ForeignKey("brands.id"),
        nullable=True,
        index=True,
    )

    # Códigos
    code = Column(String(50), nullable=False, index=True)  # Código interno del negocio
    supplier_code = Column(
        String(50), nullable=True, index=True
    )  # Código del proveedor
    photo_url = Column(String(500), nullable=True)

    # Descripción
    description = Column(String(500), nullable=False, index=True)
    details = Column(Text, nullable=True)  # Descripción extendida

    # Facetas comerciales para búsqueda guiada del agente IA
    brand = Column(String(100), nullable=True, index=True)
    line = Column(String(100), nullable=True, index=True)
    application_area = Column(String(100), nullable=True, index=True)
    finish = Column(String(80), nullable=True, index=True)
    quality_tier = Column(String(40), nullable=True, index=True)

    # Atributos específicos por categoría (JSON serializado)
    # Ej: {"installation":"mesada","command":"monocomando"}
    attributes_json = Column(Text, nullable=True)

    # Términos populares / jerga del cliente (para matching con el agente IA)
    # Ej: "rosca tuerca pp, bushing, niple macho, racor plástico 3/4"
    customer_terms = Column(Text, nullable=True)

    # Precios base
    cost_price = Column(Numeric(12, 2), default=0, nullable=False)  # Precio de costo
    list_price = Column(Numeric(12, 2), default=0, nullable=False)  # Precio de lista (siempre ARS)
    price_currency = Column(String(10), nullable=False, server_default="ARS")
    list_price_usd = Column(Numeric(12, 2), nullable=True)

    # Bonificaciones en cadena
    discount_1 = Column(Numeric(5, 2), default=0, nullable=False)
    discount_2 = Column(Numeric(5, 2), default=0, nullable=False)
    discount_3 = Column(Numeric(5, 2), default=0, nullable=False)
    discount_display = Column(String(20), nullable=True)  # "20+30+10"

    # Cargo extra (flete, logística, etc.)
    extra_cost = Column(Numeric(5, 2), default=0, nullable=False)  # Porcentaje extra

    # Ganancia / utilidad del negocio (%)
    profit_margin = Column(Numeric(5, 2), default=0, nullable=False)

    # Precios calculados
    net_price = Column(Numeric(12, 2), default=0, nullable=False)  # Precio sin IVA
    sale_price = Column(Numeric(12, 2), default=0, nullable=False)  # Precio final

    # IVA
    iva_rate = Column(Numeric(5, 2), default=21.00, nullable=False)  # 10.5, 21, 27, 0

    # Stock
    minimum_stock = Column(Integer, default=0, nullable=False)  # Alerta de stock bajo
    unit = Column(
        String(20), default="unidad", nullable=False
    )  # unidad, metro, kg, litro, pack
    units_per_pack = Column(Integer, nullable=True)  # Cantidad por pack
    quantity_per_package = Column(Numeric(12, 2), nullable=True)
    sell_per_unit = Column(Boolean, default=True, nullable=False, server_default="true")

    is_active = Column(Boolean, default=True, nullable=False)

    # Relaciones
    business = relationship("Business", back_populates="products")
    category = relationship("Category", back_populates="products")
    supplier = relationship("Supplier", back_populates="products")
    brand_ref = relationship("Brand", back_populates="products")
    price_history = relationship(
        "PriceHistory", back_populates="product", lazy="dynamic"
    )
    lots = relationship(
        "ProductLot",
        primaryjoin="and_(ProductLot.product_id == Product.id, ProductLot.deleted_at.is_(None))",
        back_populates="product",
    )

    @property
    def current_stock(self) -> int:
        """Retorna el stock actual sumando la cantidad de todos los lotes activos."""
        return sum(lot.quantity for lot in self.lots if not lot.deleted_at)

    @property
    def brand_name(self) -> str | None:
        """Retorna la marca canónica, con fallback al texto legacy."""
        return self.brand_ref.name if self.brand_ref else self.brand

    @property
    def next_expiration(self) -> date | None:
        """Retorna la fecha de vencimiento más próxima entre los lotes con stock > 0."""
        dates = [
            lot.expiration_date
            for lot in self.lots
            if not lot.deleted_at and lot.expiration_date and lot.quantity > 0
        ]
        return min(dates) if dates else None

    def calculate_prices(self) -> None:
        """
        Calcula los precios aplicando bonificaciones en cadena según PRD.
        net_price = precio_lista × bonifs × (1 + extra_cost/100) × (1 + profit_margin/100)
        sale_price = net_price × (1 + IVA/100)
        """
        list_price = Decimal(str(self.list_price or 0))
        d1 = Decimal(str(self.discount_1 or 0))
        d2 = Decimal(str(self.discount_2 or 0))
        d3 = Decimal(str(self.discount_3 or 0))
        extra_cost = Decimal(str(self.extra_cost or 0))
        profit_margin = Decimal(str(self.profit_margin or 0))
        iva_rate = Decimal(str(self.iva_rate or 21))

        # Precio con bonificaciones (neto base)
        net_base = list_price * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)

        # Aplicar cargo extra
        net_with_extra = net_base * (1 + extra_cost / 100)

        # Aplicar ganancia/utilidad
        net_with_profit = net_with_extra * (1 + profit_margin / 100)

        # Precio final con IVA
        sale = net_with_profit * (1 + iva_rate / 100)

        qty = Decimal(str(self.quantity_per_package or 0))
        divide = qty > 0 and (self.sell_per_unit is True or self.sell_per_unit is None)
        if divide:
            self.net_price = round(net_with_profit / qty, 2)
            self.sale_price = round(sale / qty, 2)
        else:
            self.net_price = round(net_with_profit, 2)
            self.sale_price = round(sale, 2)

        # Formato de descuento para mostrar
        discounts = [d for d in [d1, d2, d3] if d > 0]
        self.discount_display = (
            "+".join([str(int(d)) for d in discounts]) if discounts else None
        )

    @property
    def is_low_stock(self) -> bool:
        """Indica si el stock está por debajo del mínimo."""
        return self.current_stock <= self.minimum_stock

    def __repr__(self) -> str:
        return f"<Product {self.code}: {self.description[:30]}>"
