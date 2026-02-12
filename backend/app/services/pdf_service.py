"""
Servicio de generación de PDF.
Utiliza Jinja2 y WeasyPrint para generar comprobantes.
Genera QR de AFIP para facturas electrónicas.
"""
import base64
import io
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import qrcode
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from app.config import get_settings

settings = get_settings()

# Configurar Jinja2
TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "pdf"
env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))


class PdfService:
    """Servicio para generar PDFs."""

    def generate_voucher_pdf(self, context: Dict[str, Any]) -> bytes:
        """
        Genera un PDF de comprobante (Cotización, Remito).
        
        Args:
            context: Diccionario con todos los datos necesarios para la plantilla:
                - business: {name, address, cuit, ...}
                - client: {name, document, address, ...}
                - voucher: {letter, type_name, number, date, ...}
                - items: list[{code, description, quantity, price, ...}]
                - totals: {subtotal, discount, total, ...}
        
        Returns:
            bytes: El contenido del archivo PDF.
        """
        try:
            template = env.get_template("voucher.html")
            html_content = template.render(**context)
            pdf_bytes = HTML(string=html_content).write_pdf()
            return pdf_bytes
        except Exception as e:
            print(f"Error al generar PDF: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

    def generate_invoice_arca_pdf(self, context: Dict[str, Any]) -> bytes:
        """
        Genera un PDF de factura electrónica ARCA/AFIP.
        Usa el template específico con CAE, QR y formato fiscal.
        
        Args:
            context: Diccionario con:
                - business: {name, address, cuit, tax_condition, iibb, start_date}
                - client: {name, document_number, tax_condition, address}
                - voucher: {letter, sale_point, comp_number, date, cae, cae_expiration, qr_data, ...}
                - items: list[{code, description, quantity, unit, unit_price, discount, discount_amount, subtotal}]
                - totals: {subtotal, total}
        
        Returns:
            bytes: El contenido del archivo PDF.
        """
        try:
            template = env.get_template("invoice_arca.html")
            html_content = template.render(**context)
            pdf_bytes = HTML(string=html_content).write_pdf()
            return pdf_bytes
        except Exception as e:
            print(f"Error al generar PDF factura ARCA: {str(e)}")
            import traceback
            traceback.print_exc()
            raise

    def generate_afip_qr(
        self,
        fecha: str,
        cuit: str,
        pto_vta: int,
        tipo_cmp: int,
        nro_cmp: int,
        importe: float,
        moneda: str = "PES",
        ctz: float = 1,
        tipo_doc_rec: int = 99,
        nro_doc_rec: int = 0,
        tipo_cod_aut: str = "E",
        cod_aut: str = "",
    ) -> str:
        """
        Genera el QR de AFIP para facturas electrónicas.
        Formato oficial: https://www.afip.gob.ar/fe/qr/?p={base64_json}
        
        Args:
            fecha: Fecha del comprobante (YYYY-MM-DD)
            cuit: CUIT del emisor (sin guiones)
            pto_vta: Punto de venta
            tipo_cmp: Tipo de comprobante (1=FA, 6=FB, 11=FC, etc.)
            nro_cmp: Número del comprobante
            importe: Importe total
            moneda: Código de moneda (PES = Pesos)
            ctz: Cotización de la moneda
            tipo_doc_rec: Tipo de documento del receptor (99=Sin identificar, 80=CUIT)
            nro_doc_rec: Número de documento del receptor
            tipo_cod_aut: Tipo de código de autorización (E = CAE)
            cod_aut: Código de autorización (CAE)
        
        Returns:
            str: Imagen QR como data URI (data:image/png;base64,...)
        """
        # Construir JSON según formato AFIP
        qr_data = {
            "ver": 1,
            "fecha": fecha,
            "cuit": int(cuit.replace("-", "")),
            "ptoVta": pto_vta,
            "tipoCmp": tipo_cmp,
            "nroCmp": nro_cmp,
            "importe": importe,
            "moneda": moneda,
            "ctz": ctz,
            "tipoDocRec": tipo_doc_rec,
            "nroDocRec": nro_doc_rec,
            "tipoCodAut": tipo_cod_aut,
            "codAut": int(cod_aut) if cod_aut else 0,
        }

        # Codificar en base64
        json_str = json.dumps(qr_data)
        b64 = base64.b64encode(json_str.encode()).decode()

        # URL de AFIP
        url = f"https://www.afip.gob.ar/fe/qr/?p={b64}"

        # Generar imagen QR
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=6,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")

        # Convertir a base64 data URI
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.read()).decode()

        return f"data:image/png;base64,{img_base64}"

    def _format_currency(self, value: float) -> str:
        return f"{value:,.2f}"

# Instancia global
pdf_service = PdfService()
