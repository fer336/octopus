"""
Modelo de feedback del tenant.
Registra bugs reportados y solicitudes de funcionalidades.
"""

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class FeedbackTicket(BaseModel):
    """Ticket de feedback creado por usuarios del tenant."""

    __tablename__ = "feedback_tickets"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    feedback_type = Column(String(20), nullable=False, index=True)  # bug | feature
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=False)

    status = Column(String(20), nullable=False, default="new", index=True)
    # new | reviewing | planned | done | rejected

    source = Column(String(30), nullable=False, default="tenant_app")
    admin_note = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    business = relationship("Business", foreign_keys=[business_id])
    user = relationship("User", foreign_keys=[user_id])


Index(
    "ix_feedback_tickets_business_type_status",
    FeedbackTicket.business_id,
    FeedbackTicket.feedback_type,
    FeedbackTicket.status,
)
