"""
Modelo de Cliente.
Almacena información de clientes y su cuenta corriente.
"""
from sqlalchemy import Column, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Client(BaseModel):
    """
    Cliente del negocio.
    Incluye datos fiscales y saldo de cuenta corriente.
    """

    __tablename__ = "clients"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )

    # Datos del cliente
    name = Column(String(255), nullable=False, index=True)  # Razón social / Nombre
    document_type = Column(String(10), nullable=False)  # CUIT, CUIL, DNI
    document_number = Column(String(20), nullable=False, index=True)
    tax_condition = Column(String(50), nullable=False)  # RI, Monotributista, CF, Exento

    # Dirección
    street = Column(String(255), nullable=True)
    street_number = Column(String(20), nullable=True)
    floor = Column(String(10), nullable=True)
    apartment = Column(String(10), nullable=True)
    city = Column(String(100), nullable=True)
    province = Column(String(100), nullable=True)
    postal_code = Column(String(10), nullable=True)

    # Contacto
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    # Cuenta corriente (saldo cacheado, se actualiza con movimientos)
    current_balance = Column(Numeric(12, 2), default=0, nullable=False)
    credit_limit = Column(Numeric(12, 2), default=0, nullable=True)

    # Relaciones
    business = relationship("Business", back_populates="clients")
    vouchers = relationship("Voucher", back_populates="client", lazy="dynamic")
    account_movements = relationship("ClientAccount", back_populates="client", lazy="dynamic")
    payments = relationship("Payment", back_populates="client", lazy="dynamic")

    @property
    def full_address(self) -> str:
        """Retorna la dirección completa formateada."""
        parts = []
        if self.street:
            addr = self.street
            if self.street_number:
                addr += f" {self.street_number}"
            if self.floor:
                addr += f", Piso {self.floor}"
            if self.apartment:
                addr += f", Depto {self.apartment}"
            parts.append(addr)
        if self.city:
            parts.append(self.city)
        if self.province:
            parts.append(self.province)
        if self.postal_code:
            parts.append(f"CP {self.postal_code}")
        return ", ".join(parts)

    def __repr__(self) -> str:
        return f"<Client {self.name}>"
