"""External agent credential model."""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class AgentSurface:
    """Allowed external-agent API surfaces."""

    TENANT = "tenant"
    PLATFORM = "platform"


class AgentCredentialStatus:
    """Credential lifecycle statuses."""

    ACTIVE = "active"
    REVOKED = "revoked"


class AgentCredential(BaseModel):
    """Hash-only credential metadata for external agents."""

    __tablename__ = "agent_credentials"
    __table_args__ = (
        CheckConstraint("surface IN ('tenant', 'platform')", name="ck_agent_credentials_surface"),
        CheckConstraint("status IN ('active', 'revoked')", name="ck_agent_credentials_status"),
        CheckConstraint(
            "(surface = 'tenant' AND business_id IS NOT NULL) OR (surface = 'platform' AND business_id IS NULL)",
            name="ck_agent_credentials_business_binding",
        ),
    )

    name = Column(String(120), nullable=False)
    surface = Column(String(20), nullable=False, index=True)
    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    key_id = Column(String(32), nullable=False, unique=True, index=True)
    secret_hash = Column(String(128), nullable=False)
    secret_last4 = Column(String(4), nullable=False)
    scopes = Column(JSONB, nullable=False, default=list)
    status = Column(String(20), nullable=False, default=AgentCredentialStatus.ACTIVE, index=True)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    description = Column(Text, nullable=True)

    business = relationship("Business")

    @property
    def is_usable(self) -> bool:
        """Return whether the credential can authenticate right now."""
        if self.status != AgentCredentialStatus.ACTIVE or not self.is_active:
            return False
        return not (self.expires_at and datetime.utcnow() >= self.expires_at)
