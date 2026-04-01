"""
Modelo de Usuario del sistema.
Almacena información de usuarios autenticados con Google OAuth.
"""

from sqlalchemy import Boolean, Column, String
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PlatformRole:
    """Roles a nivel de plataforma."""

    SUPERADMIN = "superadmin"
    TENANT_USER = "tenant_user"

    ALL = [SUPERADMIN, TENANT_USER]


class User(BaseModel):
    """
    Usuario del sistema.
    Se crea automáticamente en el primer login con Google.
    """

    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    picture = Column(String(500), nullable=True)  # URL del avatar de Google
    google_id = Column(String(255), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Rol a nivel de plataforma: superadmin o tenant_user
    platform_role = Column(
        String(20),
        nullable=False,
        default=PlatformRole.TENANT_USER,
    )

    # Relaciones
    businesses = relationship("Business", back_populates="owner", lazy="selectin")
    memberships = relationship(
        "TenantMembership", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"
