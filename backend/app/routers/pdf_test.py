"""
Endpoint temporal para probar la generación de PDF.
"""
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import io

from app.services.pdf_service import pdf_service

router = APIRouter(prefix="/pdf-test", tags=["PDF Test"])

@router.get("/preview/{voucher_type}")
async def preview_pdf(voucher_type: str):
    """
    Genera un PDF de prueba.
    voucher_type: 'a' (Factura A), 'b', 'c', 'r' (Remito), 'x' (Cotización)
    """
    
    # Datos Mock para probar el diseño
    context = {
        "business": {
            "name": "FERRETERÍA INDUSTRIAL S.A.",
            "address": "Av. Corrientes 1234, CABA",
            "city": "Buenos Aires",
            "province": "CABA",
            "phone": "11-1234-5678",
            "email": "ventas@ferreteria.com",
            "cuit": "30-11223344-5",
            "iibb": "901-123456-7",
            "start_date": "01/01/2020",
            "tax_condition": "Responsable Inscripto",
            "logo_url": None # O URL de imagen
        },
        "client": {
            "name": "JUAN PÉREZ CONSTRUCCIONES",
            "document_type": "CUIT",
            "document_number": "20-99887766-1",
            "address": "Calle Falsa 123",
            "city": "La Plata",
            "tax_condition": "Responsable Inscripto",
            "phone": "221-555-9999"
        },
        "voucher": {
            "letter": voucher_type.upper(),
            "code_type": "001" if voucher_type == 'a' else "006",
            "type_name": "FACTURA" if voucher_type in ['a', 'b', 'c'] else ("REMITO" if voucher_type == 'r' else "COTIZACIÓN"),
            "number": "0001-00001234",
            "date": datetime.now().strftime("%d/%m/%Y"),
            "show_prices": voucher_type != 'r', # Remito sin precios
            "cae": "12345678901234" if voucher_type in ['a', 'b', 'c'] else None,
            "cae_due_date": "20/02/2026" if voucher_type in ['a', 'b', 'c'] else None,
        },
        "items": [
            {"code": "GRI-001", "description": "Grifería Monocomando Cocina", "quantity": 2, "unit_price": "15,000.00", "discount": "0", "subtotal": "30,000.00"},
            {"code": "TU-PVC-110", "description": "Tubo PVC 110mm x 4m", "quantity": 10, "unit_price": "4,500.00", "discount": "10", "subtotal": "40,500.00"},
            {"code": "CEM-XXX", "description": "Cemento Portland 50kg", "quantity": 50, "unit_price": "8,200.00", "discount": "5", "subtotal": "389,500.00"},
        ],
        "totals": {
            "subtotal": "460,000.00",
            "discount": "0.00",
            "iva_21": "96,600.00",
            "iva_105": "0.00",
            "total": "556,600.00"
        }
    }

    if voucher_type == 'x': # Cotización
        context["voucher"]["type_name"] = "COTIZACIÓN"
        context["voucher"]["letter"] = "X"
        context["voucher"]["code_type"] = "000"
        context["voucher"]["cae"] = None

    pdf_bytes = pdf_service.generate_voucher_pdf(context)
    
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=comprobante_{voucher_type}.pdf"}
    )
