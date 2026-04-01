"""
Modelo de secretos cifrados por tenant.
Los datos sensibles (ARCA, AFIP, MrBot) se almacenan cifrados aquí
en lugar de en la tabla businesses.
"""

from sqlalchemy import Column, ForeignKey, String, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import BaseModel


class TenantSecret(BaseModel):
    """
    Almacena secretos cifrados por tenant.
    Cada fila es un tipo de secreto (arca_api_key, afip_cert, etc.)
    con su valor cifrado y metadata de masking.
    """

    __tablename__ = "tenant_secrets"

    business_id = Column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    secret_type = Column(String(100), nullable=False, index=True)
    # Valores: "arca_token", "arca_sign", "arca_email", "arca_cuit_representante",
    #          "arca_environment", "mrbot_email", "mrbot_api_key",
    #          "afipsdk_access_token", "afip_cert", "afip_key"

    encrypted_value = Column(Text, nullable=True)
    # Valor cifrado con Fernet. Puede ser None si solo es metadata.

    last4 = Column(String(4), nullable=True)
    # Últimos 4 caracteres para display en UI

    is_configured = Column(Boolean, default=False)
    # Flag: true si este tipo de secreto está configurado

    business = relationship("Business", back_populates="secrets")

    def __repr__(self) -> str:
        return f"<TenantSecret {self.business_id}:{self.secret_type} configured={self.is_configured}>"
