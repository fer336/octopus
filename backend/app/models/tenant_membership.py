"""
Modelo de membresías de tenant.
Conecta usuarios con negocios y define su rol dentro de cada tenant.
"""

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class MembershipRole:
    """Roles dentro de un tenant."""

    OWNER = "owner"
    MANAGER = "manager"
    SELLER = "seller"

    ALL = [OWNER, MANAGER, SELLER]


class MembershipAccessStatus:
    """Estados de acceso de una membresía de tenant."""

    ACTIVE = "active"
    TRIAL = "trial"
    SUSPENDED = "suspended"
    EXPIRED = "expired"

    ALL = [ACTIVE, TRIAL, SUSPENDED, EXPIRED]


class TenantMembership(BaseModel):
    """
    Vincula un usuario con un negocio (tenant) y define su rol.
    Un usuario puede tener membresías en múltiples tenants.
    """

    __tablename__ = "tenant_memberships"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role = Column(
        String(20),
        nullable=False,
        default=MembershipRole.OWNER,
    )
    # Valores: "owner", "manager", "seller"

    access_starts_at = Column(DateTime, nullable=True)
    access_ends_at = Column(DateTime, nullable=True)
    access_status = Column(
        String(20),
        nullable=False,
        default=MembershipAccessStatus.ACTIVE,
    )
    blocked_reason = Column(String(255), nullable=True)

    # Relaciones
    user = relationship("User", back_populates="memberships")
    business = relationship("Business", back_populates="memberships")

    # Un usuario solo puede tener una membresía por negocio
    __table_args__ = (
        UniqueConstraint("user_id", "business_id", name="uq_user_business_membership"),
    )

    def __repr__(self) -> str:
        return (
            f"<TenantMembership user={self.user_id} business={self.business_id} "
            f"role={self.role} access_status={self.access_status}>"
        )
