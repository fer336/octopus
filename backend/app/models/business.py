"""
Modelo del Negocio/Empresa.
Contiene los datos del comercio para el membrete y facturación.
"""
from sqlalchemy import Column, ForeignKey, String, Text
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
        nullable=False,
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

    # Configuración de facturación
    sale_point = Column(String(5), default="0001")  # Punto de venta ARCA
    last_quotation_number = Column(String(8), default="00000000")
    last_receipt_number = Column(String(8), default="00000000")
    last_invoice_a_number = Column(String(8), default="00000000")
    last_invoice_b_number = Column(String(8), default="00000000")
    last_invoice_c_number = Column(String(8), default="00000000")
    
    # Configuración ARCA/AFIP
    arca_token = Column(Text, nullable=True)  # Token del WSAA
    arca_sign = Column(Text, nullable=True)  # Sign del WSAA
    arca_token_expiration = Column(String(30), nullable=True)  # Fecha de expiración
    arca_cuit_representante = Column(String(13), nullable=True)  # CUIT representante
    arca_environment = Column(String(20), default="testing")  # testing o production
    
    # Configuración Afip SDK (https://afipsdk.com)
    afipsdk_access_token = Column(String(500), nullable=True)
    afip_cert = Column(Text, nullable=True)  # Contenido del certificado PEM
    afip_key = Column(Text, nullable=True)   # Contenido de la clave privada PEM

    # Relaciones
    owner = relationship("User", back_populates="businesses")
    products = relationship("Product", back_populates="business", lazy="dynamic")
    clients = relationship("Client", back_populates="business", lazy="dynamic")
    suppliers = relationship("Supplier", back_populates="business", lazy="dynamic")
    categories = relationship("Category", back_populates="business", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<Business {self.name}>"
