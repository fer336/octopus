"""
Schemas para Logs de Auditoría (AuditLog).
"""

from uuid import UUID

from app.schemas.base import BaseResponse


class AuditLogResponse(BaseResponse):
    """Respuesta de un registro de auditoría."""

    user_id: UUID | None = None
    business_id: UUID | None = None
    action: str
    resource_type: str
    resource_id: UUID | None = None
    details: dict | None = None

    # Información enrichida
    user_name: str | None = None
