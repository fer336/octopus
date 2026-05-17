"""
Router de Logs de Auditoría.
Endpoints para consultar el registro de auditoría del sistema.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogResponse
from app.schemas.base import PaginatedResponse
from app.utils.security import get_current_business, get_current_user, require_module_access

router = APIRouter(
    prefix="/audit-logs",
    tags=["Auditoría"],
    dependencies=[Depends(require_module_access("products"))],
)


@router.get("", response_model=PaginatedResponse[AuditLogResponse])
async def list_audit_logs(
    resource_type: str | None = Query(
        None, description="Filtrar por tipo de recurso (ej: lot_operation, stock_adjustment)"
    ),
    action: str | None = Query(
        None, description="Filtrar por acción (ej: create, consume, adjust)"
    ),
    user_id: UUID | None = Query(None, description="Filtrar por usuario"),
    search: str | None = Query(
        None, description="Buscar en detalles (JSON)"
    ),
    page: int = Query(1, ge=1, description="Número de página"),
    per_page: int = Query(50, ge=1, le=200, description="Elementos por página"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Lista los logs de auditoría del negocio con filtros y paginación.
    """
    conditions = [AuditLog.business_id == business_id]

    if resource_type:
        conditions.append(AuditLog.resource_type == resource_type)
    if action:
        conditions.append(AuditLog.action == action)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if search:
        conditions.append(AuditLog.details.cast(str).ilike(f"%{search}%"))

    # Conteo total
    count_query = select(func.count(AuditLog.id)).where(*conditions)
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Query paginada
    offset = (page - 1) * per_page
    query = (
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .where(*conditions)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(query)
    entries = list(result.scalars().all())

    # Convertir a response model
    items = []
    for entry in entries:
        audit_response = AuditLogResponse.model_validate(entry)
        if entry.user:
            audit_response.user_name = entry.user.name
        items.append(audit_response)

    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )
