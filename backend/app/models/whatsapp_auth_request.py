import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class WhatsAppAuthRequest(Base):
    __tablename__ = "whatsapp_auth_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.id"), nullable=False, index=True)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    client_name = Column(String(255), nullable=False)
    client_phone = Column(String(50), nullable=False)
    requester_name = Column(String(255), nullable=False)
    description = Column(String(500), nullable=False, default="retiro de materiales")
    token = Column(String(20), unique=True, nullable=False, index=True)
    jwt_token = Column(String(1000), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    whatsapp_instance = Column(String(100), nullable=True)
    evolution_message_id = Column(String(255), nullable=True)
    responded_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
