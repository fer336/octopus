"""
Modelo de Solicitudes de Autorización.
Se usa para operaciones que requieren aprobación de segundo usuario (4-eyes principle).
"""
import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class AuthorizationStatus(str, enum.Enum):
    """Estados de la solicitud de autorización."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AuthorizationType(str, enum.Enum):
    """Tipos de operación que requieren autorización."""

    VOUCHER_RETURN_DELETION = "voucher_return_deletion"  # Eliminar remito de devolución
    VOUCHER_CASCADE_DELETION = "voucher_cascade_deletion"  # Eliminar factura + devolución


class AuthorizationRequest(BaseModel):
    """
    Solicitud de autorización para operaciones sensibles.
    Ej: eliminar un remito de devolución que requiere aprobación.
    """

    __tablename__ = "authorization_requests"

    # Usuario que solicita la autorización (el que quiere hacer la operación)
    requested_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Usuario que autoriza (puede ser null si está pending)
    authorized_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    # Negocio asociado a la operación
    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id"),
        nullable=False,
        index=True,
    )

    # Tipo de operación
    authorization_type: Mapped[AuthorizationType] = mapped_column(
        Enum(AuthorizationType),
        nullable=False,
    )

    # ID del recurso sobre el cual se opera (voucher_id, etc.)
    resource_id = Column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    # Estado de la solicitud
    status: Mapped[AuthorizationStatus] = mapped_column(
        Enum(AuthorizationStatus),
        nullable=False,
        default=AuthorizationStatus.PENDING,
    )

    # Motivo de la operación (required, se muestra al autorizador)
    reason = Column(Text, nullable=False)

    # Si fue rechazada, motivo del rechazo
    rejection_reason = Column(Text, nullable=True)

    # Timestamp de resolución (aprobación o rechazo)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    requester = relationship("User", foreign_keys=[requested_by])
    authorizer = relationship("User", foreign_keys=[authorized_by])
    business = relationship("Business")

    def __repr__(self) -> str:
        return f"<AuthorizationRequest {self.authorization_type.value} status={self.status.value}>"
