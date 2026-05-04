"""
Servicio para integración con Afip SDK.
Maneja la facturación electrónica con ARCA/AFIP usando la librería afip.py.

Documentación: https://docs.afipsdk.com/integracion/python
"""

import asyncio
import logging
from datetime import datetime
from typing import Any

from afip import Afip

from app.models.business import Business
from app.models.client import Client
from app.models.voucher import Voucher, VoucherType

logger = logging.getLogger(__name__)


class AfipSdkService:
    """
    Servicio para interactuar con ARCA/AFIP mediante Afip SDK.

    Afip SDK simplifica la integración: no requiere certificados,
    ni manejo manual de Token/Sign del WSAA. Solo necesita un
    access_token obtenido desde https://afipsdk.com
    """

    # Mapeo de tipos de comprobante
    VOUCHER_TYPE_TO_CBTE_TIPO = {
        VoucherType.INVOICE_A: 1,
        VoucherType.INVOICE_B: 6,
        VoucherType.INVOICE_C: 11,
        VoucherType.CREDIT_NOTE_A: 3,
        VoucherType.CREDIT_NOTE_B: 8,
        VoucherType.CREDIT_NOTE_C: 13,
        VoucherType.DEBIT_NOTE_A: 2,
        VoucherType.DEBIT_NOTE_B: 7,
        VoucherType.DEBIT_NOTE_C: 12,
    }

    # Mapeo de condición IVA del receptor a tipo de documento
    IVA_CONDITION_TO_DOC_TIPO = {
        "Responsable Inscripto": 80,  # CUIT
        "IVA Sujeto Exento": 80,  # CUIT
        "Consumidor Final": 99,  # Sin identificar
        "Responsable Monotributo": 80,  # CUIT
        "IVA Liberado": 80,  # CUIT
    }

    # Mapeo de condición IVA del receptor a código AFIP (RG 5616)
    IVA_CONDITION_TO_ID = {
        "Responsable Inscripto": 1,
        "IVA Sujeto Exento": 4,
        "Consumidor Final": 5,
        "Responsable Monotributo": 6,
        "IVA Liberado": 8,
        "Monotributista Social": 13,
        "IVA No Alcanzado": 15,
    }

    # Mapeo de tipo de documento
    DOC_TYPE_MAP = {
        "DNI": 96,
        "CUIL": 86,
        "CUIT": 80,
        "Consumidor Final": 99,
    }

    # Mapeo de alícuota IVA a código AFIP
    IVA_ALICUOTA_TO_ID = {
        0: 3,  # IVA 0%
        10.5: 4,  # IVA 10.5%
        21: 5,  # IVA 21%
        27: 6,  # IVA 27%
        5: 8,  # IVA 5%
        2.5: 9,  # IVA 2.5%
    }

    def __init__(self, business: Business):
        """
        Inicializa el servicio con la configuración del negocio.

        Args:
            business: Instancia del negocio con configuración ARCA
        """
        self.business = business
        self._afip: Afip | None = None

    # CUIT de prueba de Afip SDK (no requiere certificado)
    AFIP_SDK_TEST_CUIT = 20409378472

    def _get_afip(self) -> Afip:
        """
        Obtiene una instancia de Afip configurada.

        En modo testing, si no hay certificado configurado,
        usa el CUIT de prueba de Afip SDK (20409378472) que no requiere certificado.

        Returns:
            Instancia de Afip lista para usar

        Raises:
            ValueError: Si no hay access_token configurado
        """
        if self._afip is None:
            if not self.business.afipsdk_access_token:
                raise ValueError(
                    "No hay access_token de Afip SDK configurado. "
                    "Obtené uno en https://afipsdk.com y configuralo en Ajustes."
                )

            is_production = (
                str(self.business.arca_environment) == "production"
                if self.business.arca_environment
                else False
            )

            # En modo testing sin certificado, usar CUIT de prueba de Afip SDK
            # (no requiere CUIT propio configurado)
            has_cert = bool(self.business.afip_cert and self.business.afip_key)
            if not is_production and not has_cert:
                logger.info(
                    f"Modo testing sin certificado: usando CUIT de prueba de Afip SDK ({self.AFIP_SDK_TEST_CUIT})"
                )
                effective_cuit = self.AFIP_SDK_TEST_CUIT
            else:
                # Requiere CUIT propio
                if not self.business.cuit:
                    raise ValueError(
                        "El CUIT del negocio no está configurado. "
                        "Para usar certificados propios necesitás tener el CUIT configurado."
                    )
                effective_cuit = int(self.business.cuit.replace("-", ""))

            options = {
                "CUIT": effective_cuit,
                "access_token": self.business.afipsdk_access_token,
                "production": is_production,
            }

            # Agregar certificado y clave si están configurados
            if self.business.afip_cert:
                options["cert"] = self.business.afip_cert
            if self.business.afip_key:
                options["key"] = self.business.afip_key

            self._afip = Afip(options)

        return self._afip

    # ================================================================
    # Consultas al Padrón (Autocompletado de Clientes)
    # ================================================================

    async def get_taxpayer_details(self, cuit: str) -> dict[str, Any]:
        """
        Obtiene los detalles de un contribuyente desde el padrón de AFIP.
        Útil para autocompletar datos de clientes por CUIT.

        Args:
            cuit: CUIT a consultar (solo números)

        Returns:
            Detalles del contribuyente (nombre, domicilio, condición IVA)
        """
        afip = self._get_afip()
        clean_cuit = "".join(filter(str.isdigit, cuit))

        try:
            # Razón social y domicilio: SOLO desde Constancia de Inscripción.
            if not hasattr(afip, "RegisterInscriptionProof"):
                return {
                    "success": False,
                    "error": "El servicio de constancia no está disponible en esta cuenta de AFIP.",
                }

            result = await asyncio.to_thread(
                afip.RegisterInscriptionProof.getTaxpayerDetails,
                int(clean_cuit),
            )

            if not result:
                return {
                    "success": False,
                    "error": "No se encontraron datos para el CUIT",
                }

            result_dict = dict(result) if hasattr(result, "keys") else {}

            # Si constancia trae error y no trae personaReturn, no hacer fallback
            # para evitar razón social incorrecta.
            if "errorConstancia" in result_dict and "personaReturn" not in result_dict:
                err = result_dict.get("errorConstancia") or {}
                errores = err.get("error") if isinstance(err, dict) else None
                if errores:
                    raw_error = errores[0] if isinstance(errores, list) else str(errores)
                    
                    # Mejorar mensajes específicos de AFIP
                    if "domicilio fiscal electrónico" in raw_error.lower():
                        return {
                            "success": False,
                            "error": (
                                "El CUIT tiene pendiente configurar el domicilio fiscal electrónico "
                                "(RG 4280/18). El contribuyente debe completar este paso en AFIP/ARCA "
                                "para poder consultar sus datos."
                            ),
                        }
                    
                    return {
                        "success": False,
                        "error": f"Error en padrón AFIP: {raw_error}",
                    }

            persona_return = result_dict.get("personaReturn")
            if not isinstance(persona_return, dict):
                return {
                    "success": False,
                    "error": "No se pudo obtener la constancia del CUIT informado",
                }

            datos = persona_return.get("datosGenerales") or {}
            if not isinstance(datos, dict):
                datos = {}

            id_persona = str(
                datos.get("idPersona") or persona_return.get("idPersona") or ""
            )
            if id_persona and id_persona != clean_cuit:
                return {
                    "success": False,
                    "error": "La respuesta del padrón no coincide con el CUIT consultado",
                }

            def get_val(d: Any, *keys: str) -> str:
                if not isinstance(d, dict):
                    return ""
                lower_map = {str(k).lower(): v for k, v in d.items()}
                for key in keys:
                    value = d.get(key)
                    if value is None:
                        value = lower_map.get(key.lower())
                    if value not in (None, ""):
                        return str(value)
                return ""

            name = (
                get_val(datos, "razonSocial", "denominacion")
                or f"{get_val(datos, 'apellido')} {get_val(datos, 'nombre')}".strip()
            )

            domicilio = datos.get("domicilioFiscal") or {}
            if isinstance(domicilio, list):
                fiscal = next(
                    (
                        d
                        for d in domicilio
                        if isinstance(d, dict)
                        and "fiscal" in get_val(d, "tipodomicilio").lower()
                    ),
                    None,
                )
                domicilio = fiscal or (domicilio[0] if domicilio else {})
            if not isinstance(domicilio, dict):
                domicilio = {}

            full_address = get_val(domicilio, "direccion", "direccionCompleta")
            city = get_val(domicilio, "localidad")
            province = get_val(domicilio, "descripcionProvincia", "provincia")
            postal_code = get_val(domicilio, "codPostal", "codigoPostal")

            tax_condition = "Consumidor Final"

            impuestos = []
            datos_rg = persona_return.get("datosRegimenGeneral")
            if isinstance(datos_rg, dict):
                impuestos = datos_rg.get("impuesto") or []
            if not impuestos:
                impuestos = datos.get("impuesto") or datos.get("impuestos") or []

            tax_ids: list[int] = []
            if isinstance(impuestos, list):
                for item in impuestos:
                    raw = item.get("idImpuesto") if isinstance(item, dict) else item
                    try:
                        if raw is not None:
                            tax_ids.append(int(raw))
                    except Exception:
                        continue

            categoria = get_val(
                datos, "categoria", "categoriaInscripcion", "categoriaIVA"
            ).lower()

            if 30 in tax_ids or "inscripto" in categoria:
                tax_condition = "Responsable Inscripto"
            elif 20 in tax_ids or "monotributo" in categoria:
                tax_condition = "Responsable Monotributo"
            elif 32 in tax_ids or "exento" in categoria:
                tax_condition = "IVA Sujeto Exento"

            return {
                "success": True,
                "data": {
                    "name": name or "",
                    "tax_condition": tax_condition,
                    "address": full_address or "",
                    "city": city or "",
                    "province": province or "",
                    "postal_code": postal_code or "",
                },
            }

        except Exception as e:
            logger.error(f"Error al consultar padrón AFIP para CUIT {cuit}: {e}")
            return {
                "success": False,
                "error": f"Error de AFIP: {str(e)}",
            }

    # ================================================================
    # Estado del servidor ARCA
    # ================================================================

    async def get_server_status(self) -> dict[str, Any]:
        """
        Verifica el estado del servidor de ARCA/AFIP.

        Returns:
            Estado del servidor (AppServer, DbServer, AuthServer)
        """
        afip = self._get_afip()
        try:
            result = await asyncio.to_thread(afip.ElectronicBilling.getServerStatus)
            return {
                "success": True,
                "status": result,
            }
        except Exception as e:
            logger.error(f"Error al verificar estado del servidor ARCA: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    # ================================================================
    # Emisión de Facturas
    # ================================================================

    async def create_next_voucher(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Crea el siguiente comprobante electrónico.
        Obtiene automáticamente el último número y lo incrementa.

        Args:
            data: Datos del comprobante según formato AFIP

        Returns:
            Diccionario con CAE, CAEFchVto y voucherNumber
        """
        afip = self._get_afip()

        logger.info(f"Creando comprobante con Afip SDK: {data}")

        try:
            result = await asyncio.to_thread(
                afip.ElectronicBilling.createNextVoucher,
                data,
            )
            logger.info(f"Comprobante creado exitosamente: {result}")
            return {
                "success": True,
                "CAE": result.get("CAE"),
                "CAEFchVto": result.get("CAEFchVto"),
                "voucherNumber": result.get("voucherNumber"),
            }
        except Exception as e:
            logger.error(f"Error al crear comprobante: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def create_voucher(
        self, data: dict[str, Any], return_response: bool = False
    ) -> dict[str, Any]:
        """
        Crea un comprobante electrónico con número específico.

        Args:
            data: Datos del comprobante según formato AFIP
            return_response: Si True, devuelve la respuesta completa

        Returns:
            Diccionario con CAE y datos del comprobante
        """
        afip = self._get_afip()

        logger.info(f"Creando comprobante con Afip SDK: {data}")

        try:
            result = await asyncio.to_thread(
                afip.ElectronicBilling.createVoucher,
                data,
                return_response,
            )
            logger.info(f"Comprobante creado exitosamente: {result}")
            return {
                "success": True,
                "data": result,
            }
        except Exception as e:
            logger.error(f"Error al crear comprobante: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    # ================================================================
    # Consultas
    # ================================================================

    async def get_last_voucher(
        self,
        sale_point: int,
        voucher_type: int,
    ) -> dict[str, Any]:
        """
        Obtiene el último número de comprobante emitido.

        Args:
            sale_point: Punto de venta
            voucher_type: Tipo de comprobante (código AFIP)

        Returns:
            Diccionario con el último número
        """
        afip = self._get_afip()

        try:
            result = await asyncio.to_thread(
                afip.ElectronicBilling.getLastVoucher,
                sale_point,
                voucher_type,
            )
            return {
                "success": True,
                "lastVoucher": result,
            }
        except Exception as e:
            logger.error(f"Error al obtener último comprobante: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def get_voucher_info(
        self,
        number: int,
        sale_point: int,
        voucher_type: int,
    ) -> dict[str, Any]:
        """
        Obtiene información de un comprobante emitido.

        Args:
            number: Número de comprobante
            sale_point: Punto de venta
            voucher_type: Tipo de comprobante (código AFIP)

        Returns:
            Información del comprobante
        """
        afip = self._get_afip()

        try:
            result = await asyncio.to_thread(
                afip.ElectronicBilling.getVoucherInfo,
                number,
                sale_point,
                voucher_type,
            )
            return {
                "success": True,
                "data": result,
            }
        except Exception as e:
            logger.error(f"Error al obtener info del comprobante: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def get_sales_points(self) -> dict[str, Any]:
        """
        Obtiene los puntos de venta habilitados.

        Returns:
            Lista de puntos de venta
        """
        afip = self._get_afip()

        try:
            result = await asyncio.to_thread(
                afip.ElectronicBilling.getSalesPoints,
            )
            return {
                "success": True,
                "data": result,
            }
        except Exception as e:
            logger.error(f"Error al obtener puntos de venta: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    # ================================================================
    # Emisión desde modelo Voucher
    # ================================================================

    def _get_doc_type(self, client: Client) -> int:
        """Obtiene el código de tipo de documento del cliente."""
        doc_type = str(client.document_type) if client.document_type else "DNI"
        return self.DOC_TYPE_MAP.get(doc_type, 96)

    def _calculate_iva_breakdown(self, voucher: Voucher) -> list[dict]:
        """
        Calcula el desglose de IVA por alícuota.

        Args:
            voucher: Comprobante

        Returns:
            Lista de dicts con Id, BaseImp, Importe
        """
        iva_by_alicuota: dict[float, dict[str, float]] = {}

        for item in voucher.items:
            alicuota = float(item.iva_rate or 21)

            if alicuota not in iva_by_alicuota:
                iva_by_alicuota[alicuota] = {"base": 0.0, "importe": 0.0}

            # IMPORTANTE:
            # Debe usar los importes YA calculados en el comprobante
            # (incluyen descuentos por ítem y descuento general), para que
            # sum(Iva.Importe) coincida exactamente con ImpIVA enviado.
            base_imp = float(item.subtotal or 0)
            iva_imp = float(item.iva_amount or 0)

            iva_by_alicuota[alicuota]["base"] += base_imp
            iva_by_alicuota[alicuota]["importe"] += iva_imp

        result = []
        for alicuota, valores in iva_by_alicuota.items():
            iva_id = self.IVA_ALICUOTA_TO_ID.get(alicuota, 5)
            result.append(
                {
                    "Id": iva_id,
                    "BaseImp": round(valores["base"], 2),
                    "Importe": round(valores["importe"], 2),
                }
            )

        return result

    async def emit_invoice(
        self,
        voucher: Voucher,
        client: Client,
    ) -> dict[str, Any]:
        """
        Emite una factura electrónica a partir de un Voucher.

        Args:
            voucher: Comprobante a emitir
            client: Cliente del comprobante

        Returns:
            Diccionario con CAE, fecha vencimiento y número

        Raises:
            ValueError: Si hay errores de validación
        """
        # Obtener tipo de comprobante AFIP
        cbte_tipo = self.VOUCHER_TYPE_TO_CBTE_TIPO.get(voucher.voucher_type)
        if not cbte_tipo:
            raise ValueError(
                f"Tipo de comprobante no soportado: {voucher.voucher_type}"
            )

        # Calcular totales
        imp_neto = float(voucher.subtotal)
        imp_iva = float(voucher.iva_amount)
        imp_total = float(voucher.total)

        # Fecha del comprobante (formato YYYYMMDD)
        cbte_fch = voucher.date.strftime("%Y%m%d")

        # ================================================================
        # LÓGICA CORRECTA SEGÚN RG 5616:
        # - Factura A (tipo 1): Requiere CUIT del cliente, condición IVA detallada
        # - Factura B (tipo 6): Consumidor Final, IVA incluido en precio
        # ================================================================
        
        # Determinar tipo de documento y número según tipo de comprobante
        # Factura A (1) o Nota de Crédito A (3) → usar CUIT del cliente
        es_factura_a = cbte_tipo in (1, 3, 2)  # A, NC A, ND A
        
        if es_factura_a:
            # Factura A: usar CUIT del cliente
            if client.document_number:
                doc_tipo = 80  # CUIT
                doc_nro = int(client.document_number.replace("-", ""))
            else:
                # Si no tiene documento, no se puede emitir Factura A
                raise ValueError(
                    "No se puede emitir Factura A sin CUIT del cliente. "
                    "El cliente debe tener un CUIT configurado."
                )
        else:
            # Factura B: siempre Consumidor Final (DocTipo=99, DocNro=0)
            # Aunque el cliente sea Responsable Inscripto, en Factura B 
            # se factura como Consumidor Final porque el IVA está incluido
            doc_tipo = 99
            doc_nro = 0

        # Condición IVA del receptor según tipo de comprobante
        iva_condition = (
            str(client.tax_condition) if client.tax_condition else "Consumidor Final"
        )
        
        if es_factura_a:
            # Factura A: usar la condición real del cliente
            condicion_iva_receptor_id = self.IVA_CONDITION_TO_ID.get(iva_condition, 5)
        else:
            # Factura B: siempre Consumidor Final (el IVA ya está incluido en el precio)
            condicion_iva_receptor_id = 5

        # Desglose de IVA
        iva_breakdown = self._calculate_iva_breakdown(voucher)

        # Construir datos del comprobante
        data = {
            "CantReg": 1,
            "PtoVta": int(voucher.sale_point),
            "CbteTipo": cbte_tipo,
            "Concepto": 1,  # 1 = Productos
            "DocTipo": doc_tipo,
            "DocNro": doc_nro,
            "CbteFch": cbte_fch,
            "ImpTotal": round(imp_total, 2),
            "ImpTotConc": 0,
            "ImpNeto": round(imp_neto, 2),
            "ImpOpEx": 0,
            "ImpTrib": 0,
            "ImpIVA": round(imp_iva, 2),
            "MonId": "PES",
            "MonCotiz": 1,
            "CondicionIVAReceptorId": condicion_iva_receptor_id,
            "Iva": iva_breakdown,
        }

        logger.info(f"Emitiendo factura electrónica: {voucher.full_number}")
        logger.info(f"Datos del comprobante: {data}")

        result = await self.create_next_voucher(data)

        if not result["success"]:
            raise ValueError(f"Error de ARCA/AFIP: {result['error']}")

        return result

    async def emit_credit_note(
        self,
        credit_note: Voucher,
        client: Client,
        original_voucher: Voucher,
    ) -> dict[str, Any]:
        """
        Emite una Nota de Crédito electrónica a partir de un Voucher.

        IMPORTANTE: Los montos de NC deben ser NEGATIVOS.

        Args:
            credit_note: Voucher de tipo CREDIT_NOTE
            client: Cliente del comprobante
            original_voucher: Factura original que se está anulando/modificando

        Returns:
            Diccionario con CAE, fecha vencimiento y número

        Raises:
            ValueError: Si hay errores de validación
        """
        # Obtener tipo de comprobante AFIP
        cbte_tipo = self.VOUCHER_TYPE_TO_CBTE_TIPO.get(credit_note.voucher_type)
        if not cbte_tipo:
            raise ValueError(
                f"Tipo de comprobante no soportado: {credit_note.voucher_type}"
            )

        # Obtener tipo de comprobante original
        cbte_tipo_original = self.VOUCHER_TYPE_TO_CBTE_TIPO.get(
            original_voucher.voucher_type
        )
        if not cbte_tipo_original:
            raise ValueError(
                f"Tipo de comprobante original no soportado: {original_voucher.voucher_type}"
            )

        # Calcular totales (DEBEN SER NEGATIVOS para NC)
        imp_neto = abs(float(credit_note.subtotal))
        imp_iva = abs(float(credit_note.iva_amount))
        imp_total = abs(float(credit_note.total))

        # Fecha del comprobante (formato YYYYMMDD)
        cbte_fch = credit_note.date.strftime("%Y%m%d")

        # ================================================================
        # LÓGICA CORRECTA PARA NOTAS DE CRÉDITO:
        # - NC A (tipo 3): usar CUIT del cliente
        # - NC B (tipo 8): Consumidor Final
        # ================================================================
        
        # NC A (3), NC A (13), ND A (2) → usar CUIT
        es_nota_a = cbte_tipo in (3, 13, 2)
        
        if es_nota_a:
            # NC A: usar CUIT del cliente
            if client.document_number:
                doc_tipo = 80  # CUIT
                doc_nro = int(client.document_number.replace("-", ""))
            else:
                raise ValueError(
                    "No se puede emitir Nota de Crédito A sin CUIT del cliente."
                )
        else:
            # NC B: siempre Consumidor Final
            doc_tipo = 99
            doc_nro = 0

        # Condición IVA del receptor
        iva_condition = (
            str(client.tax_condition) if client.tax_condition else "Consumidor Final"
        )
        
        if es_nota_a:
            # NC A: usar condición real del cliente
            condicion_iva_receptor_id = self.IVA_CONDITION_TO_ID.get(iva_condition, 5)
        else:
            # NC B: siempre Consumidor Final
            condicion_iva_receptor_id = 5

        # Desglose de IVA
        iva_breakdown = self._calculate_iva_breakdown(credit_note)

        # IMPORTANTE: Comprobantes Asociados (CbtesAsoc)
        # Es OBLIGATORIO para Notas de Crédito referenciar la factura original
        cbtes_asoc = [
            {
                "Tipo": cbte_tipo_original,
                "PtoVta": int(original_voucher.sale_point),
                "Nro": int(original_voucher.number),
            }
        ]

        # Construir datos del comprobante
        data = {
            "CantReg": 1,
            "PtoVta": int(credit_note.sale_point),
            "CbteTipo": cbte_tipo,
            "Concepto": 1,  # 1 = Productos
            "DocTipo": doc_tipo,
            "DocNro": doc_nro,
            "CbteFch": cbte_fch,
            "ImpTotal": round(imp_total, 2),
            "ImpTotConc": 0,
            "ImpNeto": round(imp_neto, 2),
            "ImpOpEx": 0,
            "ImpTrib": 0,
            "ImpIVA": round(imp_iva, 2),
            "MonId": "PES",
            "MonCotiz": 1,
            "CondicionIVAReceptorId": condicion_iva_receptor_id,
            "Iva": iva_breakdown,
            "CbtesAsoc": cbtes_asoc,  # 🔑 CLAVE: Referencia a factura original
        }

        logger.info(f"Emitiendo Nota de Crédito electrónica: {credit_note.full_number}")
        logger.info(f"Referencia a factura original: {original_voucher.full_number}")
        logger.info(f"Datos del comprobante: {data}")

        result = await self.create_next_voucher(data)

        if not result["success"]:
            raise ValueError(f"Error de ARCA/AFIP: {result['error']}")

        return result

    # ================================================================
    # Diagnóstico
    # ================================================================

    async def diagnose(self) -> dict[str, Any]:
        """
        Ejecuta un diagnóstico completo de la integración.

        Returns:
            Diccionario con resultados del diagnóstico
        """
        diagnosis = {
            "timestamp": datetime.now().isoformat(),
            "checks": [],
            "overall_status": "unknown",
        }

        # Check 1: Access Token configurado
        if self.business.afipsdk_access_token:
            diagnosis["checks"].append(
                {
                    "name": "Access Token Afip SDK",
                    "status": "ok",
                    "detail": f"Token configurado: {self.business.afipsdk_access_token[:15]}...",
                }
            )
        else:
            diagnosis["checks"].append(
                {
                    "name": "Access Token Afip SDK",
                    "status": "error",
                    "detail": "No hay access_token configurado. Obtené uno en https://afipsdk.com",
                }
            )
            diagnosis["overall_status"] = "error"
            return diagnosis

        # Check 2: CUIT configurado
        if self.business.cuit:
            diagnosis["checks"].append(
                {
                    "name": "CUIT del negocio",
                    "status": "ok",
                    "detail": f"CUIT: {self.business.cuit}",
                }
            )
        else:
            diagnosis["checks"].append(
                {
                    "name": "CUIT del negocio",
                    "status": "error",
                    "detail": "CUIT no configurado en el negocio.",
                }
            )
            diagnosis["overall_status"] = "error"
            return diagnosis

        # Check 3: Certificado y Clave AFIP
        has_cert = bool(self.business.afip_cert and self.business.afip_key)
        is_production = str(self.business.arca_environment) == "production"

        if has_cert:
            diagnosis["checks"].append(
                {
                    "name": "Certificado y Clave AFIP",
                    "status": "ok",
                    "detail": f"Certificado y clave propios configurados. Se usa CUIT: {self.business.cuit}",
                }
            )
        elif not is_production:
            diagnosis["checks"].append(
                {
                    "name": "Certificado y Clave AFIP",
                    "status": "ok",
                    "detail": f"No configurados — modo testing usa CUIT de prueba Afip SDK: {self.AFIP_SDK_TEST_CUIT}",
                }
            )
        else:
            diagnosis["checks"].append(
                {
                    "name": "Certificado y Clave AFIP",
                    "status": "error",
                    "detail": "⚠️ En modo PRODUCCIÓN se requiere certificado y clave de AFIP para usar tu CUIT.",
                }
            )

        # Check 4: Estado del servidor ARCA
        server_status = await self.get_server_status()
        if server_status["success"]:
            diagnosis["checks"].append(
                {
                    "name": "Servidor ARCA/AFIP",
                    "status": "ok",
                    "detail": f"Servidor disponible: {server_status['status']}",
                }
            )
        else:
            diagnosis["checks"].append(
                {
                    "name": "Servidor ARCA/AFIP",
                    "status": "error",
                    "detail": f"Error de conexión: {server_status.get('error', 'desconocido')}",
                }
            )

        # Check 5: Autenticación — verificar obteniendo último comprobante
        sale_point = int(self.business.sale_point or "1")
        try:
            last_voucher = await self.get_last_voucher(sale_point, 6)  # Factura B
            if last_voucher["success"]:
                diagnosis["checks"].append(
                    {
                        "name": "Autenticación ARCA (último comprobante)",
                        "status": "ok",
                        "detail": f"Último comprobante Factura B Pto.Vta {sale_point}: N° {last_voucher['lastVoucher']}",
                    }
                )
            else:
                diagnosis["checks"].append(
                    {
                        "name": "Autenticación ARCA (último comprobante)",
                        "status": "error",
                        "detail": f"Error: {last_voucher.get('error', 'desconocido')}",
                    }
                )
        except Exception as e:
            diagnosis["checks"].append(
                {
                    "name": "Autenticación ARCA",
                    "status": "error",
                    "detail": f"Error al verificar autenticación: {str(e)}",
                }
            )

        # Check 6: Entorno
        env = self.business.arca_environment or "testing"
        diagnosis["checks"].append(
            {
                "name": "Entorno configurado",
                "status": "ok" if env in ("testing", "production") else "warning",
                "detail": f"Entorno: {'Homologación (Testing)' if env == 'testing' else 'Producción'}",
            }
        )

        # Check 7: Punto de venta
        diagnosis["checks"].append(
            {
                "name": "Punto de venta",
                "status": "ok" if self.business.sale_point else "warning",
                "detail": f"Punto de venta: {self.business.sale_point or 'no configurado'}",
            }
        )

        # Determinar estado general
        statuses = [c["status"] for c in diagnosis["checks"]]
        if all(s == "ok" for s in statuses):
            diagnosis["overall_status"] = "ok"
        elif any(s == "error" for s in statuses):
            diagnosis["overall_status"] = "error"
        else:
            diagnosis["overall_status"] = "warning"

        return diagnosis
