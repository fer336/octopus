"""
Modelo de log de auditoría.
Registra todas las operaciones sensibles del sistema para trazabilidad.
"""

from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class AuditLog(BaseModel):
    """
    Registro de auditoría para operaciones sensibles.
    Cada fila representa una acción realizada por un usuario sobre un recurso.
    """

    __tablename__ = "audit_logs"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    agent_id = Column(
        UUID(as_uuid=True),
        ForeignKey("agent_credentials.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    action = Column(String(50), nullable=False, index=True)
    # Valores: "create", "update", "delete", "read", "test_invoice", "validate"

    resource_type = Column(String(50), nullable=False, index=True)
    # Valores: "arca_secret", "branding", "tenant", "user", "voucher"

    resource_id = Column(UUID(as_uuid=True), nullable=True)
    # ID del recurso afectado (si aplica)

    details = Column(JSONB, nullable=True)
    # Metadata adicional: valores antes/después, IP, user agent, etc.

    actor_type = Column(String(20), nullable=True, index=True)
    correlation_id = Column(String(80), nullable=True, index=True)
    outcome = Column(String(20), nullable=True, index=True)
    scopes_evaluated = Column(JSONB, nullable=True)

    # Relaciones
    user = relationship("User", foreign_keys=[user_id])
    agent = relationship("AgentCredential", foreign_keys=[agent_id])
    business = relationship("Business", foreign_keys=[business_id])

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} {self.resource_type}:{self.resource_id} by {self.user_id}>"
