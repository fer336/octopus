"""
Utilidades para registro de auditoría.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog


async def log_audit(
    db: AsyncSession,
    user_id: UUID,
    business_id: UUID,
    action: str,
    resource_type: str,
    resource_id: Optional[UUID] = None,
    details: Optional[dict] = None,
):
    """
    Crea una entrada de auditoría en la base de datos.

    Args:
        db: Sesión de base de datos
        user_id: ID del usuario que realiza la acción
        business_id: ID del negocio afectado
        action: Acción realizada (create, update, delete, etc.)
        resource_type: Tipo de recurso (purchase_order, voucher, etc.)
        resource_id: ID del recurso afectado
        details: Metadata adicional en formato dict
    """
    log = AuditLog(
        user_id=user_id,
        business_id=business_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details or {},
    )
    db.add(log)
    # No hacemos commit aquí para permitir que sea parte de una transacción más grande
    # El llamador es responsable de hacer await db.commit() o db.flush()
    return log
