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

    def generate_inventory_count_pdf(
        self,
        business,
        products: list,
        supplier_name: str = "",
        category_name: str = "",
    ) -> bytes:
        """
        Genera la planilla de conteo físico en PDF (landscape).
        Columnas: Código, Descripción, Categoría, Proveedor, Stock Actual, Conteo (en blanco).

        Args:
            business: Objeto Business con datos del negocio.
            products: Lista de objetos Product con relaciones category y supplier cargadas.
            supplier_name: Nombre del proveedor filtrado (para mostrar en header).
            category_name: Nombre de la categoría filtrada (para mostrar en header).

        Returns:
            bytes: Contenido del PDF.
        """
        try:
            # Armar contexto para el template
            products_ctx = []
            for p in products:
                products_ctx.append({
                    "code": p.code,
                    "description": p.description,
                    "current_stock": p.current_stock,
                    "category_name": p.category.name if p.category else None,
                    "supplier_name": p.supplier.name if p.supplier else None,
                })

            filter_label = ""
            if supplier_name:
                filter_label += f"Proveedor: {supplier_name}"
            if category_name:
                if filter_label:
                    filter_label += " | "
                filter_label += f"Categoría: {category_name}"

            context = {
                "business": business,
                "products": products_ctx,
                "supplier_name": supplier_name,
                "category_name": category_name,
                "filter_label": filter_label,
                "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
            }

            template = env.get_template("inventory_count.html")
            html_content = template.render(**context)
            return HTML(string=html_content).write_pdf()
        except Exception as e:
            print(f"Error al generar planilla de conteo: {e}")
            import traceback
            traceback.print_exc()
            raise

    def generate_purchase_order_pdf(
        self,
        business,
        order,
    ) -> bytes:
        """
        Genera el PDF de una Orden de Pedido (landscape).
        Incluye tabla de ítems con costos, desglose de IVA y total de la orden.

        Args:
            business: Objeto Business con datos del negocio.
            order: Objeto PurchaseOrder con ítems y relaciones cargadas.

        Returns:
            bytes: Contenido del PDF.
        """
        try:
            from decimal import Decimal
            from collections import defaultdict

            # Calcular desglose de IVA por alícuota
            iva_groups: dict = defaultdict(Decimal)
            for item in order.items:
                rate = Decimal(str(item.iva_rate or 0))
                amount = Decimal(str(item.iva_amount or 0))
                iva_groups[rate] += amount

            iva_breakdown = [
                {"rate": float(rate), "amount": float(amount)}
                for rate, amount in sorted(iva_groups.items())
                if amount > 0
            ]

            # Número de orden: usar los últimos 8 chars del UUID
            order_number = str(order.id).upper()[-8:]

            context = {
                "business": business,
                "order": order,
                "order_number": order_number,
                "order_date": order.created_at.strftime("%d/%m/%Y") if order.created_at else "—",
                "confirmed_at": order.confirmed_at.strftime("%d/%m/%Y %H:%M") if order.confirmed_at else None,
                "iva_breakdown": iva_breakdown,
                "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
            }

            template = env.get_template("purchase_order.html")
            html_content = template.render(**context)
            return HTML(string=html_content).write_pdf()
        except Exception as e:
            print(f"Error al generar PDF orden de pedido: {e}")
            import traceback
            traceback.print_exc()
            raise

    def _format_currency(self, value: float) -> str:
        return f"{value:,.2f}"

# Instancia global
pdf_service = PdfService()
