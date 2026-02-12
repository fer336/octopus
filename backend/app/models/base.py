"""
Modelo base con campos comunes para todos los modelos.
Implementa soft delete y timestamps automáticos.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class BaseModel(Base):
    """
    Modelo abstracto base que proporciona:
    - id: UUID como clave primaria
    - created_at: Timestamp de creación
    - updated_at: Timestamp de última actualización
    - deleted_at: Timestamp de eliminación (soft delete)
    """

    __abstract__ = True

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    deleted_at = Column(
        DateTime,
        nullable=True,
        default=None,
    )

    @property
    def is_deleted(self) -> bool:
        """Indica si el registro está eliminado (soft delete)."""
        return self.deleted_at is not None

    def soft_delete(self) -> None:
        """Marca el registro como eliminado."""
        self.deleted_at = datetime.utcnow()

    def restore(self) -> None:
        """Restaura un registro eliminado."""
        self.deleted_at = None
