"""
Router para configuración de ARCA/AFIP con Afip SDK.
Permite gestionar el access token, emitir facturas electrónicas y diagnosticar.

Documentación Afip SDK: https://docs.afipsdk.com/integracion/python
"""

import logging
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db
from app.models.business import Business
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.client import Client
from app.models.audit_log import AuditLog
from app.schemas.arca_schemas import (
    AfipSdkConfigUpdate,
    AfipSdkConfigResponse,
    EmitInvoiceRequest,
    EmitInvoiceResponse,
)
from app.services.afip_sdk_service import AfipSdkService
from app.utils.security import get_current_business, get_current_user

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/arca", tags=["arca"])
CMS_SUPERADMIN_MESSAGE = "Gestionado desde CMS superadmin."


async def get_business(
    business_id: str,
    current_business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
) -> Business:
    """Obtiene el negocio por ID validando acceso del tenant actual."""
    try:
        requested_business_id = UUID(str(business_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="business_id inválido",
        )

    if requested_business_id != current_business_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenés acceso al negocio solicitado.",
        )

    result = await db.execute(
        select(Business).where(Business.id == requested_business_id)
    )
    business = result.scalar_one_or_none()

    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Negocio no encontrado",
        )

    return business


# ============================================================================
# Configuración Afip SDK
# ============================================================================


async def _log_audit(
    db: AsyncSession,
    user_id,
    business_id,
    action: str,
    resource_type: str,
    resource_id=None,
    details: dict | None = None,
):
    """Log audit entry — separate commit so it never breaks the main operation."""
    try:
        audit_log = AuditLog(
            user_id=user_id,
            business_id=business_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        )
        db.add(audit_log)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


@router.get("/config/{business_id}", response_model=AfipSdkConfigResponse)
async def get_arca_config(
    business: Business = Depends(get_business),
):
    """
    Obtiene la configuración actual de Afip SDK / ARCA.
    """
    return AfipSdkConfigResponse(
        afipsdk_access_token_configured=bool(business.afipsdk_access_token),
        afip_cert_configured=bool(business.afip_cert),
        afip_key_configured=bool(business.afip_key),
        arca_environment=business.arca_environment or "testing",
        cuit=business.cuit,
        sale_point=business.sale_point,
        business_name=business.name,
        tax_condition=business.tax_condition,
    )


@router.put("/config/{business_id}", response_model=AfipSdkConfigResponse)
async def update_arca_config(
    _config: AfipSdkConfigUpdate,
    _business: Business = Depends(get_business),
    _=Depends(get_current_user),
):
    """
    Superficie tenant bloqueada para cambios sensibles de ARCA.
    La gestión se realiza exclusivamente desde /api/admin.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=CMS_SUPERADMIN_MESSAGE,
    )


# ============================================================================
# Diagnóstico
# ============================================================================


@router.get("/diagnose/{business_id}")
async def diagnose_arca(
    _business: Business = Depends(get_business),
):
    """
    Ejecuta un diagnóstico completo de la integración con ARCA/AFIP.
    Verifica: access token, CUIT, servidor ARCA, autenticación.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=CMS_SUPERADMIN_MESSAGE,
    )


@router.get("/server-status/{business_id}")
async def get_server_status(
    _business: Business = Depends(get_business),
):
    """
    Verifica el estado del servidor ARCA/AFIP.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=CMS_SUPERADMIN_MESSAGE,
    )


# ============================================================================
# Factura de Prueba
# ============================================================================


@router.post("/test-invoice/{business_id}")
async def test_invoice(
    _business: Business = Depends(get_business),
    _db: AsyncSession = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """
    Envía una factura de prueba para verificar que la integración funciona.
    Usa datos mínimos: Factura B, Consumidor Final, 1 producto de $121 ($100 + IVA 21%).
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=CMS_SUPERADMIN_MESSAGE,
    )


# ============================================================================
# Consultas ARCA
# ============================================================================


@router.get("/last-voucher/{business_id}")
async def get_last_voucher(
    business: Business = Depends(get_business),
    sale_point: int = 1,
    voucher_type: int = 6,
):
    """
    Obtiene el último número de comprobante emitido en ARCA.

    Args:
        sale_point: Punto de venta (default 1)
        voucher_type: Tipo de comprobante código AFIP (default 6 = Factura B)
    """
    service = AfipSdkService(business)
    try:
        return await service.get_last_voucher(sale_point, voucher_type)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error al obtener último comprobante: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error: {str(e)}",
        )


@router.get("/voucher-info/{business_id}")
async def get_voucher_info(
    business: Business = Depends(get_business),
    number: int = 1,
    sale_point: int = 1,
    voucher_type: int = 6,
):
    """
    Obtiene información de un comprobante emitido.
    """
    service = AfipSdkService(business)
    try:
        return await service.get_voucher_info(number, sale_point, voucher_type)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error al obtener info del comprobante: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error: {str(e)}",
        )


@router.get("/sales-points/{business_id}")
async def get_sales_points(
    business: Business = Depends(get_business),
):
    """
    Obtiene los puntos de venta habilitados en ARCA.
    """
    service = AfipSdkService(business)
    try:
        return await service.get_sales_points()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error al obtener puntos de venta: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error: {str(e)}",
        )


# ============================================================================
# Emisión de Factura Electrónica Real
# ============================================================================


@router.post("/emit-invoice", response_model=EmitInvoiceResponse)
async def emit_electronic_invoice(
    request: EmitInvoiceRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Emite una factura electrónica en ARCA/AFIP.

    El comprobante debe estar en estado DRAFT o CONFIRMED.
    Solo se pueden emitir facturas (A, B, C) y notas de crédito/débito.
    """
    # Obtener voucher
    result = await db.execute(select(Voucher).where(Voucher.id == request.voucher_id))
    voucher = result.scalar_one_or_none()

    if not voucher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comprobante no encontrado",
        )

    # Validar que sea un tipo facturable
    facturable_types = [
        VoucherType.INVOICE_A,
        VoucherType.INVOICE_B,
        VoucherType.INVOICE_C,
        VoucherType.CREDIT_NOTE_A,
        VoucherType.CREDIT_NOTE_B,
        VoucherType.CREDIT_NOTE_C,
        VoucherType.DEBIT_NOTE_A,
        VoucherType.DEBIT_NOTE_B,
        VoucherType.DEBIT_NOTE_C,
    ]

    if voucher.voucher_type not in facturable_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El tipo de comprobante {voucher.voucher_type.value} no se puede facturar electrónicamente",
        )

    # Validar que no tenga CAE ya asignado
    if voucher.cae:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este comprobante ya tiene CAE asignado. No se puede volver a emitir.",
        )

    # Obtener negocio y cliente
    result = await db.execute(
        select(Business).where(Business.id == voucher.business_id)
    )
    business = result.scalar_one_or_none()

    result = await db.execute(select(Client).where(Client.id == voucher.client_id))
    client = result.scalar_one_or_none()

    if not business or not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Negocio o cliente no encontrado",
        )

    # Crear servicio Afip SDK
    service = AfipSdkService(business)

    try:
        # Emitir factura
        logger.info(f"Emitiendo factura electrónica: {voucher.full_number}")
        arca_response = await service.emit_invoice(voucher, client)

        if arca_response["success"]:
            # Actualizar voucher con datos de ARCA
            voucher.cae = arca_response["CAE"]
            if arca_response.get("CAEFchVto"):
                voucher.cae_expiration = datetime.strptime(
                    arca_response["CAEFchVto"], "%Y-%m-%d"
                ).date()
            voucher.status = VoucherStatus.CONFIRMED

            await db.commit()
            await db.refresh(voucher)

            logger.info(f"Factura emitida exitosamente. CAE: {voucher.cae}")

            await _log_audit(
                db=db,
                user_id=current_user.id,
                business_id=business.id,
                action="create",
                resource_type="arca_secret",
                resource_id=voucher.id,
                details={
                    "description": f"Factura electrónica emitida: {voucher.full_number}",
                    "cae": voucher.cae,
                    "voucher_type": voucher.voucher_type.value,
                },
            )

            return EmitInvoiceResponse(
                success=True,
                message="Factura emitida correctamente",
                cae=voucher.cae,
                cae_expiration=str(voucher.cae_expiration)
                if voucher.cae_expiration
                else None,
                voucher_number=voucher.full_number,
                pdf_url=f"{settings.API_TENANT_PREFIX}/vouchers/{voucher.id}/pdf",
            )
        else:
            await _log_audit(
                db=db,
                user_id=current_user.id,
                business_id=business.id,
                action="create",
                resource_type="arca_secret",
                resource_id=voucher.id,
                details={
                    "description": f"Emisión de factura falló: {voucher.full_number}",
                    "error": arca_response.get("error"),
                },
            )
            return EmitInvoiceResponse(
                success=False,
                message="Error al emitir factura",
                errors=[arca_response.get("error", "Error desconocido")],
            )

    except ValueError as e:
        logger.error(f"Error de validación: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error al emitir factura: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al emitir factura: {str(e)}",
        )
