"""
Modelo de Usuario del sistema.
Almacena información de usuarios autenticados con Google OAuth.
"""
from sqlalchemy import Boolean, Column, String
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


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

    # Relaciones
    businesses = relationship("Business", back_populates="owner", lazy="selectin")

    def __repr__(self) -> str:
        return f"<User {self.email}>"
