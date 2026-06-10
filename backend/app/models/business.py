"""
Modelo del Negocio/Empresa.
Contiene los datos del comercio para el membrete y facturación.
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Business(BaseModel):
    """
    Negocio/Empresa del usuario.
    Almacena datos fiscales y de facturación.
    """

    __tablename__ = "businesses"

    owner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    # Datos del negocio
    name = Column(String(255), nullable=False)  # Razón social
    cuit = Column(String(13), nullable=False)  # XX-XXXXXXXX-X
    tax_condition = Column(String(50), nullable=False)  # Condición ante IVA

    # Contacto
    address = Column(String(500), nullable=True)
    city = Column(String(100), nullable=True)
    province = Column(String(100), nullable=True)
    postal_code = Column(String(10), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)

    # Membrete PDF
    logo_url = Column(String(500), nullable=True)
    header_text = Column(Text, nullable=True)  # Texto adicional para el membrete
    hide_business_name_in_pdf = Column(Boolean, nullable=False, default=False)
    logo_position = Column(String(20), nullable=False, default="left")
    logo_display_mode = Column(String(30), nullable=False, default="alongside_text")

    # Configuración de facturación
    sale_point = Column(String(5), default="0001")  # Punto de venta ARCA
    electronic_sale_point = Column(String(5), default="0012")
    alternative_sale_point = Column(String(5), default="5001")
    srx_enabled = Column(Boolean, default=False)
    last_invoice_x_number = Column(String(8), default="00000000")
    last_quotation_number = Column(String(8), default="00000000")
    last_receipt_number = Column(String(8), default="00000000")
    last_invoice_a_number = Column(String(8), default="00000000")
    last_invoice_b_number = Column(String(8), default="00000000")
    last_invoice_c_number = Column(String(8), default="00000000")
    last_purchase_order_number = Column(String(8), default="00000000")

    # Feature flags por tenant (CMS superadmin)
    ai_agent_enabled = Column(Boolean, nullable=False, default=False)
    linear_sync_enabled = Column(Boolean, nullable=False, default=False)
    whatsapp_enabled = Column(Boolean, nullable=False, default=False)
    qr_scanner_enabled = Column(Boolean, nullable=False, default=False)
    current_account_mode = Column(String(20), nullable=False, default="disabled")
    invoicing_enabled = Column(Boolean, nullable=False, default=True)
    receipts_enabled = Column(Boolean, nullable=False, default=True)
    quotation_enabled = Column(Boolean, nullable=False, default=True)
    inventory_enabled = Column(Boolean, nullable=False, default=True)
    stockpile_enabled = Column(Boolean, nullable=False, default=True)
    price_update_enabled = Column(Boolean, nullable=False, default=True)
    reports_enabled = Column(Boolean, nullable=False, default=True)
    sql_backup_enabled = Column(Boolean, nullable=False, default=False)
    invoice_zero_stock_enabled = Column(Boolean, nullable=False, default=False)
    evolution_api_key = Column(String(500), nullable=True)
    whatsapp_instance_name = Column(String(100), nullable=True)

    # Suscripción / bloqueo comercial por tenant
    subscription_starts_at = Column(DateTime, nullable=True)
    subscription_ends_at = Column(DateTime, nullable=True)
    subscription_status = Column(String(20), nullable=False, default="active")
    subscription_blocked_reason = Column(String(255), nullable=True)

    # Configuración ARCA/AFIP
    arca_token = Column(Text, nullable=True)  # Token del WSAA
    arca_sign = Column(Text, nullable=True)  # Sign del WSAA
    arca_token_expiration = Column(String(30), nullable=True)  # Fecha de expiración
    arca_cuit_representante = Column(String(13), nullable=True)  # CUIT representante
    arca_environment = Column(String(20), default="testing")  # testing o production

    # Configuración Afip SDK (https://afipsdk.com)
    afipsdk_access_token = Column(String(500), nullable=True)
    afip_cert = Column(Text, nullable=True)  # Contenido del certificado PEM
    afip_key = Column(Text, nullable=True)  # Contenido de la clave privada PEM

    # Relaciones
    owner = relationship("User", back_populates="businesses")
    products = relationship("Product", back_populates="business", lazy="dynamic")
    clients = relationship("Client", back_populates="business", lazy="dynamic")
    client_types = relationship("ClientType", back_populates="business", lazy="dynamic")
    suppliers = relationship("Supplier", back_populates="business", lazy="dynamic")
    categories = relationship("Category", back_populates="business", lazy="dynamic")
    brands = relationship("Brand", back_populates="business", lazy="dynamic")
    payment_methods_catalog = relationship(
        "PaymentMethodCatalog", back_populates="business", lazy="dynamic"
    )
    ai_provider_configs = relationship(
        "AIProviderConfig", back_populates="business", lazy="dynamic"
    )
    secrets = relationship(
        "TenantSecret", back_populates="business", cascade="all, delete-orphan"
    )
    memberships = relationship(
        "TenantMembership", back_populates="business", cascade="all, delete-orphan"
    )
    drafts = relationship(
        "Draft", back_populates="business", cascade="all, delete-orphan", lazy="dynamic"
    )
    stockpiles = relationship(
        "Stockpile", back_populates="business", cascade="all, delete-orphan", lazy="dynamic"
    )
    product_lots = relationship(
        "ProductLot", back_populates="business", cascade="all, delete-orphan", lazy="dynamic"
    )

    def __repr__(self) -> str:
        return f"<Business {self.name}>"
