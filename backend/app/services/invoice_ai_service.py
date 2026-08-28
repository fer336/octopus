"""
Servicio de Extracción IA de Facturas de Compra (Compras — carga por IA).

Extrae texto de un PDF con PyMuPDF, lo envía al proveedor de IA activo del
negocio (vía `LLMFactory`, multi-proveedor) y produce un borrador editable de
`PurchaseInvoice`.

CONTRATO DE ESCRITURA (spec — "PDF to Draft Extraction"): este servicio NUNCA
escribe stock (`ProductLot`) ni precios (`PriceHistory`) directamente. Solo
persiste la factura en estado `draft` vía `PurchaseInvoiceService.create_draft`;
el impacto de stock/precios ocurre recién al confirmar
(`PurchaseInvoiceService.confirm()`), siempre con revisión humana previa.
`supplier_id`/`product_id` quedan `null` cuando no hay match — nunca se
auto-crean entidades a partir del texto extraído.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.purchase_invoice import PurchaseInvoice, PurchaseInvoiceSource
from app.models.supplier import Supplier
from app.schemas.purchase_invoice import PurchaseInvoiceCreate, PurchaseInvoiceItemCreate
from app.services.llm_factory import LLMFactory
from app.services.purchase_invoice_service import PurchaseInvoiceService

logger = logging.getLogger(__name__)


class InvoiceAIParseError(Exception):
    """
    Se lanza cuando el PDF no tiene texto extraíble o la IA no devuelve un
    JSON válido. Nunca deja un draft parcial persistido — la validación
    ocurre antes de cualquier escritura en DB.
    """


class InvoiceAIService:
    """Servicio de extracción de facturas de compra desde PDF vía IA."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Ingesta de PDF (PyMuPDF)
    # ------------------------------------------------------------------

    def extract_pdf_text(self, pdf_bytes: bytes) -> str:
        """Extrae texto de un PDF usando PyMuPDF (fitz). Solo texto seleccionable
        (no hace OCR de imágenes — a diferencia de `ai_quote_service`, acá un
        PDF sin texto extraíble es un error explícito, no un fallback a Vision)."""
        try:
            import fitz  # PyMuPDF
        except ImportError as e:
            raise ImportError(
                "PyMuPDF no está instalado. Ejecutá: pip install pymupdf"
            ) from e

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            pages_text = [page.get_text().strip() for page in doc]
        finally:
            doc.close()

        return "\n".join(t for t in pages_text if t)

    # ------------------------------------------------------------------
    # Matching (nunca auto-crea)
    # ------------------------------------------------------------------

    async def _match_supplier(
        self, business_id: UUID, supplier_name: str | None
    ) -> UUID | None:
        """Intenta matchear el nombre de proveedor extraído contra el catálogo.
        Nunca crea un proveedor nuevo."""
        if not supplier_name or not supplier_name.strip():
            return None

        result = await self.db.execute(
            select(Supplier).where(
                Supplier.business_id == business_id,
                Supplier.deleted_at.is_(None),
                Supplier.name.ilike(supplier_name.strip()),
            )
        )
        supplier = result.scalars().first()
        return supplier.id if supplier else None

    async def _match_product(
        self, business_id: UUID, code: str | None, description: str | None
    ) -> UUID | None:
        """Intenta matchear un producto extraído por código exacto, o si no
        hay código, por descripción exacta. Nunca crea un producto nuevo."""
        if code and code.strip():
            result = await self.db.execute(
                select(Product).where(
                    Product.business_id == business_id,
                    Product.deleted_at.is_(None),
                    Product.code == code.strip(),
                )
            )
            product = result.scalars().first()
            if product:
                return product.id

        if description and description.strip():
            result = await self.db.execute(
                select(Product).where(
                    Product.business_id == business_id,
                    Product.deleted_at.is_(None),
                    Product.description.ilike(description.strip()),
                )
            )
            product = result.scalars().first()
            if product:
                return product.id

        return None

    # ------------------------------------------------------------------
    # Llamada a la IA (LLMFactory, multi-proveedor)
    # ------------------------------------------------------------------

    async def _call_llm(self, business_id: UUID, raw_text: str) -> dict:
        """Resuelve el proveedor IA activo del negocio y le pide que extraiga
        los campos estructurados de la factura. Retorna el dict parseado."""
        provider, api_key, model = await LLMFactory.resolve(str(business_id), self.db)
        client = LLMFactory.build_openai_compatible(api_key, provider)

        system_prompt = (
            "Sos un asistente que extrae datos estructurados de facturas de "
            "proveedores de ferreterías/sanitarios argentinas. Respondé "
            "ÚNICAMENTE con un JSON válido, sin markdown ni explicaciones, "
            "con esta forma exacta:\n"
            '{"supplier_name": "string o null", '
            '"invoice_number": "string", '
            '"invoice_date": "YYYY-MM-DD", '
            '"items": [{"code": "string o null", "description": "string", '
            '"quantity": number, "unit_cost": number, "iva_rate": number}]}'
        )

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Extraé los datos de esta factura:\n\n{raw_text}",
                },
            ],
            max_tokens=2000,
            temperature=0.1,
        )

        content = response.choices[0].message.content or "{}"
        content = re.sub(r"```json?\s*|\s*```", "", content).strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise InvoiceAIParseError(
                "La IA no devolvió un JSON válido al extraer la factura."
            ) from e

    # ------------------------------------------------------------------
    # Punto de entrada
    # ------------------------------------------------------------------

    async def create_draft_from_pdf(
        self,
        business_id: UUID,
        user_id: UUID,
        pdf_bytes: bytes,
        source_document_key: str | None = None,
    ) -> tuple[PurchaseInvoice, bool]:
        """
        Extrae una factura de un PDF vía IA y crea un borrador editable.

        Nunca escribe stock ni precios — solo persiste el draft (delega en
        `PurchaseInvoiceService.create_draft`, la misma ruta que la carga
        manual). Campos no matcheados (`supplier_id`/`product_id`) quedan en
        `null` para revisión manual; nunca se auto-crean entidades.

        Retorna (invoice, is_duplicate).
        Lanza `InvoiceAIParseError` si el PDF no tiene texto extraíble o la
        IA no devuelve un JSON válido — en ambos casos, sin persistir nada.
        """
        raw_text = self.extract_pdf_text(pdf_bytes)
        if not raw_text.strip():
            raise InvoiceAIParseError(
                "El PDF no tiene texto extraíble. Verificá que no sea una "
                "imagen escaneada sin capa de texto."
            )

        extracted = await self._call_llm(business_id, raw_text)

        items_raw = extracted.get("items") or []
        if not items_raw:
            raise InvoiceAIParseError(
                "La IA no pudo extraer ningún ítem de la factura."
            )

        supplier_id = await self._match_supplier(
            business_id, extracted.get("supplier_name")
        )

        items_data: list[PurchaseInvoiceItemCreate] = []
        for raw_item in items_raw:
            code = raw_item.get("code")
            description = raw_item.get("description") or code or "Ítem sin descripción"
            product_id = await self._match_product(business_id, code, description)

            items_data.append(
                PurchaseInvoiceItemCreate(
                    product_id=product_id,
                    description=description,
                    quantity=Decimal(str(raw_item.get("quantity") or 1)),
                    unit_cost=Decimal(str(raw_item.get("unit_cost") or 0)),
                    iva_rate=Decimal(str(raw_item.get("iva_rate") or 21)),
                )
            )

        invoice_date_str = extracted.get("invoice_date")
        try:
            invoice_date = (
                date.fromisoformat(invoice_date_str) if invoice_date_str else date.today()
            )
        except ValueError:
            invoice_date = date.today()

        create_data = PurchaseInvoiceCreate(
            supplier_id=supplier_id,
            purchase_order_id=None,
            invoice_number=extracted.get("invoice_number") or "SIN-NUMERO",
            invoice_date=invoice_date,
            items=items_data,
        )

        invoice_service = PurchaseInvoiceService(self.db)
        return await invoice_service.create_draft(
            business_id=business_id,
            user_id=user_id,
            data=create_data,
            source=PurchaseInvoiceSource.AI,
            source_document_key=source_document_key,
        )
