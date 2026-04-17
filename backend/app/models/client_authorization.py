"""
Modelo de autorización de subcliente para Cuenta Corriente.

Relaciona un cliente titular (pagador) con un cliente autorizado para retirar
mercadería a su nombre, con sublímite opcional.
"""

from sqlalchemy import Boolean, Column, ForeignKey, Numeric, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class ClientAuthorization(BaseModel):
    """Vínculo titular/subcliente para operaciones de cuenta corriente."""

    __tablename__ = "client_authorizations"
    __table_args__ = (
        UniqueConstraint(
            "business_id",
            "billing_client_id",
            "operating_client_id",
            name="uq_client_authorizations_triplet",
        ),
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )
    billing_client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=False,
        index=True,
    )
    operating_client_id = Column(
        UUID(as_uuid=True),
        ForeignKey("clients.id"),
        nullable=False,
        index=True,
    )

    # Sublímite opcional para el subcliente en esta relación puntual.
    operating_credit_limit = Column(Numeric(12, 2), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)

    business = relationship("Business")
    billing_client = relationship(
        "Client",
        foreign_keys=[billing_client_id],
        back_populates="authorizations_as_billing",
    )
    operating_client = relationship(
        "Client",
        foreign_keys=[operating_client_id],
        back_populates="authorizations_as_operating",
    )

    def __repr__(self) -> str:
        return (
            f"<ClientAuthorization billing={self.billing_client_id} "
            f"operating={self.operating_client_id} active={self.is_active}>"
        )
