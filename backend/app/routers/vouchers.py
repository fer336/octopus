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
from app.models.voucher import Voucher, VoucherType, VoucherStatus
from app.models.business import Business
from app.models.client import Client
from app.schemas.base import PaginatedResponse
from app.schemas.voucher import VoucherCreate, VoucherResponse, ConvertQuotationToInvoice
from app.schemas.credit_note import CreditNoteCreate
from app.services.voucher_service import VoucherService
from app.services.afip_sdk_service import AfipSdkService
from app.services.cash_register_service import get_open_cash_register
from app.utils.security import get_current_business, get_current_user
from sqlalchemy import select
from sqlalchemy.orm import selectinload

# Tipos de comprobante que requieren caja abierta para emitirse
INVOICE_TYPES = {VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C}

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
    Las facturas (A, B, C) requieren que haya una caja abierta.
    """
    # Validar caja abierta para facturas
    if data.voucher_type in INVOICE_TYPES:
        open_register = await get_open_cash_register(db, business_id)
        if not open_register:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No hay una caja abierta. Debe abrir la caja antes de emitir facturas."
            )

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
    print(f"🔍 [PDF] Solicitud de PDF para voucher: {voucher_id}, business: {business_id}")
    service = VoucherService(db)
    try:
        pdf_bytes = await service.generate_pdf(voucher_id, business_id)
        print(f"✅ [PDF] PDF generado exitosamente. Tamaño: {len(pdf_bytes)} bytes")
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=voucher_{voucher_id}.pdf"
            }
        )
    except ValueError as e:
        print(f"❌ [PDF] Error ValueError: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        print(f"❌ [PDF] Error inesperado: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar PDF: {str(e)}"
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


@router.get("/pending-quotations", response_model=PaginatedResponse[VoucherResponse])
async def list_pending_quotations(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=100, ge=1, le=200),
    search: Optional[str] = Query(default=None),
    voucher_type: Optional[VoucherType] = Query(default=None, description="Filtrar por tipo: quotation o receipt"),
    date_from: Optional[str] = Query(default=None, description="Fecha desde (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(default=None, description="Fecha hasta (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Lista las cotizaciones y remitos pendientes de facturar.
    
    Retorna comprobantes (cotización o remito) que:
    - No tienen factura asociada (invoiced_voucher_id es NULL)
    - No están eliminados
    
    Filtros disponibles: tipo (quotation/receipt), fecha desde/hasta, texto de búsqueda.
    """
    service = VoucherService(db)
    vouchers, total = await service.list_pending_quotations(
        business_id=business_id,
        page=page,
        per_page=per_page,
        search=search,
        voucher_type=voucher_type,
        date_from=date_from,
        date_to=date_to,
    )

    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[VoucherResponse.model_validate(v) for v in vouchers],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("/{quotation_id}/convert-to-invoice", response_model=VoucherResponse, status_code=status.HTTP_201_CREATED)
async def convert_quotation_to_invoice(
    quotation_id: UUID,
    data: ConvertQuotationToInvoice,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user = Depends(get_current_user),
):
    """
    Convierte una cotización en factura electrónica.
    
    - Crea una nueva factura con los mismos items de la cotización.
    - Marca la cotización como 'facturada' (irreversible sin Nota de Crédito).
    - El tipo de factura (A o B) se determina automáticamente según la condición fiscal del cliente.
    - Para revertir: emitir una Nota de Crédito Fiscal desde la factura generada.
    - Requiere caja abierta.
    """
    # Validar caja abierta antes de convertir
    open_register = await get_open_cash_register(db, business_id)
    if not open_register:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay una caja abierta. Debe abrir la caja antes de emitir facturas."
        )

    service = VoucherService(db)
    try:
        payments_raw = None
        if data.payments:
            payments_raw = [p.model_dump() for p in data.payments]

        invoice = await service.convert_quotation_to_invoice(
            business_id=business_id,
            quotation_id=quotation_id,
            payments=payments_raw,
            user_id=current_user.id,
        )
        return VoucherResponse.model_validate(invoice)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al convertir cotización: {str(e)}"
        )


@router.post("/{voucher_id}/credit-note", response_model=VoucherResponse, status_code=status.HTTP_201_CREATED)
async def create_credit_note(
    voucher_id: UUID,
    data: CreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user = Depends(get_current_user),
):
    """
    Crea una Nota de Crédito a partir de una factura.
    
    - **original_voucher_id**: ID de la factura original (debe tener CAE)
    - **reason**: Motivo de la NC (obligatorio)
    - **items**: Lista de productos a devolver (cantidad no puede superar la original)
    
    La NC se emite automáticamente en ARCA/AFIP con referencia a la factura original (CbtesAsoc).
    Requiere caja abierta.
    """
    # Validar caja abierta antes de emitir NC
    open_register = await get_open_cash_register(db, business_id)
    if not open_register:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay una caja abierta. Debe abrir la caja antes de emitir Notas de Crédito."
        )

    service = VoucherService(db)
    
    try:
        # 1. Crear la NC en la base de datos
        items_data = [item.model_dump() for item in data.items]
        
        credit_note = await service.create_credit_note(
            business_id=business_id,
            original_voucher_id=data.original_voucher_id,
            reason=data.reason,
            items_data=items_data,
            user_id=current_user.id,
        )
        
        # 2. Obtener business y cliente para emitir en AFIP
        business = await db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")
        
        client = await db.get(Client, credit_note.client_id)
        if not client:
            raise ValueError("Cliente no encontrado")
        
        # 3. Obtener factura original
        result = await db.execute(
            select(Voucher)
            .where(Voucher.id == data.original_voucher_id)
        )
        original_voucher = result.scalar_one_or_none()
        if not original_voucher:
            raise ValueError("Factura original no encontrada")
        
        # 4. Emitir en ARCA/AFIP
        afip_service = AfipSdkService(business)
        afip_result = await afip_service.emit_credit_note(
            credit_note=credit_note,
            client=client,
            original_voucher=original_voucher,
        )
        
        if not afip_result["success"]:
            # Si falla la emisión, eliminar la NC creada
            await db.delete(credit_note)
            await db.commit()
            raise ValueError(f"Error al emitir NC en AFIP: {afip_result.get('error')}")
        
        # 5. Actualizar la NC con los datos de AFIP
        from datetime import datetime
        
        credit_note.cae = afip_result.get("CAE")
        
        # Convertir CAEFchVto de string a date
        cae_expiration_str = afip_result.get("CAEFchVto")
        if cae_expiration_str:
            # Formato: "2026-02-23" o "20260223"
            if "-" in cae_expiration_str:
                credit_note.cae_expiration = datetime.strptime(cae_expiration_str, "%Y-%m-%d").date()
            else:
                credit_note.cae_expiration = datetime.strptime(cae_expiration_str, "%Y%m%d").date()
        
        credit_note.number = str(afip_result.get("voucherNumber")).zfill(8)
        
        await db.commit()
        await db.refresh(credit_note)
        
        # Cargar relaciones
        result = await db.execute(
            select(Voucher)
            .options(selectinload(Voucher.items))
            .where(Voucher.id == credit_note.id)
        )
        credit_note = result.scalar_one()
        
        return credit_note
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al crear Nota de Crédito: {str(e)}"
        )
