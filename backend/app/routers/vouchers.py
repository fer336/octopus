"""
Router de Comprobantes.
"""
from typing import Optional
from uuid import UUID
import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.voucher import VoucherType, VoucherStatus
from app.schemas.base import PaginatedResponse
from app.schemas.voucher import VoucherCreate, VoucherResponse
from app.services.voucher_service import VoucherService
from app.utils.security import get_current_business, get_current_user

router = APIRouter(prefix="/vouchers", tags=["Ventas"])


@router.get("", response_model=PaginatedResponse[VoucherResponse])
async def list_vouchers(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    voucher_type: Optional[VoucherType] = Query(default=None),
    status: Optional[VoucherStatus] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Lista comprobantes con filtros y paginación."""
    service = VoucherService(db)
    vouchers, total = await service.list(
        business_id=business_id,
        page=page,
        per_page=per_page,
        search=search,
        voucher_type=voucher_type,
        status=status,
    )
    
    pages = (total + per_page - 1) // per_page if per_page else 0
    
    return PaginatedResponse(
        items=[VoucherResponse.model_validate(v) for v in vouchers],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("", response_model=VoucherResponse, status_code=status.HTTP_201_CREATED)
async def create_voucher(
    data: VoucherCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user = Depends(get_current_user),
):
    """
    Crea un nuevo comprobante (Cotización, Remito, Factura).
    Calcula totales y descuenta stock si corresponde.
    """
    service = VoucherService(db)
    try:
        voucher = await service.create(business_id, data, current_user.id)
        return VoucherResponse.model_validate(voucher)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{voucher_id}/pdf")
async def get_voucher_pdf(
    voucher_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Genera y descarga el PDF del comprobante.
    """
    service = VoucherService(db)
    try:
        pdf_bytes = await service.generate_pdf(voucher_id, business_id)
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=voucher_{voucher_id}.pdf"
            }
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.delete("/{voucher_id}/delete")
async def delete_voucher(
    voucher_id: UUID,
    reason: Optional[str] = Query(default=None, description="Motivo de eliminación"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user = Depends(get_current_user),
):
    """
    Elimina un comprobante (soft delete con auditoría).
    El registro queda marcado como eliminado pero visible en el historial.
    """
    service = VoucherService(db)
    success = await service.soft_delete(voucher_id, business_id, current_user.id, reason)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comprobante no encontrado"
        )
    
    return {"message": "Comprobante eliminado correctamente"}
