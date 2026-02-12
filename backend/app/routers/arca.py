"""
Router para configuración de ARCA/AFIP con Afip SDK.
Permite gestionar el access token, emitir facturas electrónicas y diagnosticar.

Documentación Afip SDK: https://docs.afipsdk.com/integracion/python
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.business import Business
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.client import Client
from app.schemas.arca_schemas import (
    AfipSdkConfigUpdate,
    AfipSdkConfigResponse,
    EmitInvoiceRequest,
    EmitInvoiceResponse,
)
from app.services.afip_sdk_service import AfipSdkService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/arca", tags=["arca"])


async def get_business(
    business_id: str,
    db: AsyncSession = Depends(get_db),
) -> Business:
    """Obtiene el negocio por ID."""
    result = await db.execute(
        select(Business).where(Business.id == business_id)
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
    config: AfipSdkConfigUpdate,
    business: Business = Depends(get_business),
    db: AsyncSession = Depends(get_db),
):
    """
    Actualiza la configuración de Afip SDK.
    Acepta access_token, certificado, clave privada y entorno.
    Solo actualiza los campos que se envían (no nulos).
    """
    if config.afipsdk_access_token is not None:
        business.afipsdk_access_token = config.afipsdk_access_token
    if config.afip_cert is not None:
        business.afip_cert = config.afip_cert
    if config.afip_key is not None:
        business.afip_key = config.afip_key
    if config.arca_environment is not None:
        business.arca_environment = config.arca_environment

    await db.commit()
    await db.refresh(business)

    logger.info(f"Configuración Afip SDK actualizada para negocio {business.id}")

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


# ============================================================================
# Diagnóstico
# ============================================================================

@router.get("/diagnose/{business_id}")
async def diagnose_arca(
    business: Business = Depends(get_business),
):
    """
    Ejecuta un diagnóstico completo de la integración con ARCA/AFIP.
    Verifica: access token, CUIT, servidor ARCA, autenticación.
    """
    service = AfipSdkService(business)
    try:
        result = await service.diagnose()
        return result
    except Exception as e:
        logger.error(f"Error en diagnóstico ARCA: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en diagnóstico: {str(e)}",
        )


@router.get("/server-status/{business_id}")
async def get_server_status(
    business: Business = Depends(get_business),
):
    """
    Verifica el estado del servidor ARCA/AFIP.
    """
    service = AfipSdkService(business)
    try:
        return await service.get_server_status()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Error al verificar estado del servidor: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error: {str(e)}",
        )


# ============================================================================
# Factura de Prueba
# ============================================================================

@router.post("/test-invoice/{business_id}")
async def test_invoice(
    business: Business = Depends(get_business),
):
    """
    Envía una factura de prueba para verificar que la integración funciona.
    Usa datos mínimos: Factura B, Consumidor Final, 1 producto de $121 ($100 + IVA 21%).
    """
    service = AfipSdkService(business)

    try:
        # Validar configuración
        if not business.afipsdk_access_token:
            return {
                "success": False,
                "step": "config",
                "message": "No hay access_token de Afip SDK configurado.",
            }

        if not business.cuit:
            return {
                "success": False,
                "step": "config",
                "message": "El CUIT del negocio no está configurado.",
            }

        sale_point = int(business.sale_point or "1")
        cbte_fch = datetime.now().strftime("%Y%m%d")

        # Datos de factura de prueba (Factura B, Consumidor Final)
        test_data = {
            "CantReg": 1,
            "PtoVta": sale_point,
            "CbteTipo": 6,       # Factura B
            "Concepto": 1,       # Productos
            "DocTipo": 99,       # Sin identificar (Consumidor Final)
            "DocNro": 0,
            "CbteFch": cbte_fch,
            "ImpTotal": 121.00,
            "ImpTotConc": 0,
            "ImpNeto": 100.00,
            "ImpOpEx": 0,
            "ImpTrib": 0,
            "ImpIVA": 21.00,
            "MonId": "PES",
            "MonCotiz": 1,
            "CondicionIVAReceptorId": 5,  # Consumidor Final (RG 5616)
            "Iva": [
                {
                    "Id": 5,         # IVA 21%
                    "BaseImp": 100,
                    "Importe": 21,
                }
            ],
        }

        logger.info(f"Enviando factura de prueba con Afip SDK")
        result = await service.create_next_voucher(test_data)

        if result["success"]:
            return {
                "success": True,
                "step": "factura",
                "message": "¡Factura de prueba emitida exitosamente!",
                "cae": result["CAE"],
                "cae_expiration": result["CAEFchVto"],
                "voucher_number": result["voucherNumber"],
                "request_data": test_data,
            }
        else:
            return {
                "success": False,
                "step": "factura",
                "message": f"Error al emitir factura de prueba",
                "error": result.get("error"),
                "request_data": test_data,
            }

    except Exception as e:
        logger.error(f"Error en factura de prueba: {e}")
        return {
            "success": False,
            "step": "error",
            "message": f"Error inesperado: {str(e)}",
        }


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
):
    """
    Emite una factura electrónica en ARCA/AFIP.

    El comprobante debe estar en estado DRAFT o CONFIRMED.
    Solo se pueden emitir facturas (A, B, C) y notas de crédito/débito.
    """
    # Obtener voucher
    result = await db.execute(
        select(Voucher).where(Voucher.id == request.voucher_id)
    )
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

    result = await db.execute(
        select(Client).where(Client.id == voucher.client_id)
    )
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

            return EmitInvoiceResponse(
                success=True,
                message="Factura emitida correctamente",
                cae=voucher.cae,
                cae_expiration=str(voucher.cae_expiration) if voucher.cae_expiration else None,
                voucher_number=voucher.full_number,
                pdf_url=f"/api/vouchers/{voucher.id}/pdf",
            )
        else:
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
