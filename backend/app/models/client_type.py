"""
Modelo de Tipo de Cliente.
Permite clasificar clientes por rol comercial y definir elegibilidad como subcliente.
"""

from sqlalchemy import Boolean, Column, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class ClientType(BaseModel):
    """Catálogo de tipos de cliente por negocio (tenant)."""

    __tablename__ = "client_types"
    __table_args__ = (
        UniqueConstraint("business_id", "name", name="uq_client_types_business_name"),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    name = Column(String(80), nullable=False, index=True)
    is_subclient_eligible = Column(Boolean, nullable=False, default=False)

    business = relationship("Business", back_populates="client_types")
    clients = relationship("Client", back_populates="client_type", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<ClientType {self.name} eligible={self.is_subclient_eligible}>"
