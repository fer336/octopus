"""
Servicio de Comprobantes.
Maneja la creación de ventas, cálculo de totales y generación de PDF.
"""
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.client import Client
from app.models.product import Product
from app.models.user import User
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.schemas.voucher import VoucherCreate
from app.services.pdf_service import pdf_service


class VoucherService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, business_id: UUID, data: VoucherCreate, user_id: UUID) -> Voucher:
        """Crea un nuevo comprobante."""
        
        # 1. Obtener cliente
        client = await self.db.get(Client, data.client_id)
        if not client or client.business_id != business_id:
            raise ValueError("Cliente no encontrado")

        # 2. Obtener business para numeración correlativa
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")
        
        # 3. Obtener siguiente número según tipo
        voucher_type_str = data.voucher_type.value if hasattr(data.voucher_type, 'value') else str(data.voucher_type)
        
        if voucher_type_str == "quotation":
            last_number = int(business.last_quotation_number or "0")
            next_number = last_number + 1
            business.last_quotation_number = str(next_number).zfill(8)
        elif voucher_type_str == "receipt":
            last_number = int(business.last_receipt_number or "0")
            next_number = last_number + 1
            business.last_receipt_number = str(next_number).zfill(8)
        elif voucher_type_str == "invoice_a":
            last_number = int(business.last_invoice_a_number or "0")
            next_number = last_number + 1
            business.last_invoice_a_number = str(next_number).zfill(8)
        elif voucher_type_str == "invoice_b":
            last_number = int(business.last_invoice_b_number or "0")
            next_number = last_number + 1
            business.last_invoice_b_number = str(next_number).zfill(8)
        elif voucher_type_str == "invoice_c":
            last_number = int(business.last_invoice_c_number or "0")
            next_number = last_number + 1
            business.last_invoice_c_number = str(next_number).zfill(8)
        else:
            next_number = 1 
        
        voucher = Voucher(
            business_id=business_id,
            client_id=data.client_id,
            created_by=user_id,
            voucher_type=data.voucher_type,
            status=VoucherStatus.CONFIRMED,
            sale_point=business.sale_point or "0001",
            number=str(next_number).zfill(8),
            date=data.date,
            notes=data.notes,
            show_prices="S" if data.show_prices else "N",
        )
        
        total_subtotal = Decimal(0)
        total_iva = Decimal(0)
        total_final = Decimal(0)
        
        items_db = []

        # 3. Procesar items
        for i, item_data in enumerate(data.items):
            product = await self.db.get(Product, item_data.product_id)
            if not product or product.business_id != business_id:
                raise ValueError(f"Producto {item_data.product_id} no encontrado")
            
            # Recalcular precios con datos frescos de la BD
            # Nota: Usamos el precio del producto actual, pero aplicamos el descuento enviado
            # O podríamos usar el unit_price enviado si permitimos overrides manuales.
            # Por seguridad, usemos el precio base del producto y apliquemos descuentos.
            
            # Precio unitario (con bonificaciones del producto ya aplicadas en sale_price, pero necesitamos el neto sin IVA)
            # product.net_price es el precio con descuentos aplicados, sin IVA.
            unit_price = product.net_price
            
            # Aplicar descuento adicional de la venta
            discount_factor = 1 - (item_data.discount_percent / 100)
            subtotal_line = unit_price * item_data.quantity * discount_factor
            
            # Calcular IVA
            iva_line = subtotal_line * (product.iva_rate / 100)
            total_line = subtotal_line + iva_line
            
            # Acumular totales generales
            total_subtotal += subtotal_line
            total_iva += iva_line
            total_final += total_line
            
            # Crear item
            voucher_item = VoucherItem(
                product_id=product.id,
                code=product.code,
                description=product.description,
                quantity=item_data.quantity,
                unit=product.unit,
                unit_price=unit_price,
                discount_percent=item_data.discount_percent,
                iva_rate=product.iva_rate,
                iva_amount=iva_line,
                subtotal=subtotal_line,
                total=total_line,
                line_number=i + 1
            )
            items_db.append(voucher_item)
            
            # Actualizar stock si no es presupuesto
            if data.voucher_type != "quotation":
                product.current_stock -= int(item_data.quantity)

        # Asignar totales al voucher
        voucher.subtotal = total_subtotal
        voucher.iva_amount = total_iva
        voucher.total = total_final
        
        # Guardar todo
        self.db.add(voucher)
        await self.db.flush() # Para obtener ID del voucher
        
        for item in items_db:
            item.voucher_id = voucher.id
            self.db.add(item)
        
        # 4. Procesar pagos si se enviaron
        if data.payments:
            from app.models.voucher_payment import VoucherPayment
            from app.models.payment_method import PaymentMethodCatalog
            
            # Validar que la suma de pagos = total del voucher
            total_payments = sum(p.amount for p in data.payments)
            
            # Permitir pequeñas diferencias por redondeo (0.01)
            if abs(total_payments - total_final) > Decimal("0.01"):
                raise ValueError(
                    f"La suma de pagos (${total_payments}) no coincide con el total del comprobante (${total_final})"
                )
            
            # Crear registros de pago
            for payment_data in data.payments:
                # Verificar que el método de pago exista y esté activo
                payment_method = await self.db.get(PaymentMethodCatalog, payment_data.payment_method_id)
                if not payment_method or payment_method.business_id != business_id:
                    raise ValueError(f"Método de pago {payment_data.payment_method_id} no encontrado")
                
                if not payment_method.is_active:
                    raise ValueError(f"Método de pago '{payment_method.name}' está inactivo")
                
                # Validar referencia si es requerida
                if payment_method.requires_reference and not payment_data.reference:
                    raise ValueError(f"El método '{payment_method.name}' requiere número de referencia")
                
                # Crear el pago
                voucher_payment = VoucherPayment(
                    voucher_id=voucher.id,
                    payment_method_id=payment_data.payment_method_id,
                    amount=payment_data.amount,
                    reference=payment_data.reference,
                )
                self.db.add(voucher_payment)
            
        await self.db.commit()
        await self.db.refresh(voucher)
        
        # Cargar relaciones para la respuesta
        # Necesitamos recargar con las relaciones para el PDF o respuesta completa
        return await self.get_by_id(voucher.id, business_id)

    async def get_by_id(self, voucher_id: UUID, business_id: UUID) -> Optional[Voucher]:
        """Obtiene un comprobante por ID con todas sus relaciones."""
        query = (
            select(Voucher)
            .options(
                selectinload(Voucher.items),
                selectinload(Voucher.client),
                selectinload(Voucher.business),
                selectinload(Voucher.credit_notes),  # Requerido por has_credit_note
            )
            .where(
                Voucher.id == voucher_id,
                Voucher.business_id == business_id
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list(
        self,
        business_id: UUID,
        page: int = 1,
        per_page: int = 20,
        search: Optional[str] = None,
        voucher_type: Optional[VoucherType] = None,
        status: Optional[VoucherStatus] = None,
    ) -> Tuple[List[Voucher], int]:
        """Lista comprobantes con filtros y paginación."""
        
        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.deleted_at.is_(None)
        ]
        
        if voucher_type:
            base_conditions.append(Voucher.voucher_type == voucher_type)
        
        if status:
            base_conditions.append(Voucher.status == status)
        
        if search:
            search_pattern = f"%{search}%"
            base_conditions.append(
                or_(
                    Voucher.number.ilike(search_pattern),
                    Voucher.sale_point.ilike(search_pattern)
                )
            )
        
        # Contar total
        count_query = select(func.count(Voucher.id)).where(*base_conditions)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0
        
        # Query paginada
        offset = (page - 1) * per_page
        query = (
            select(Voucher)
            .options(
                selectinload(Voucher.client),
                selectinload(Voucher.items),
                selectinload(Voucher.credit_notes),  # Requerido por has_credit_note
            )
            .where(*base_conditions)
            .order_by(desc(Voucher.created_at))
            .offset(offset)
            .limit(per_page)
        )
        
        result = await self.db.execute(query)
        vouchers = list(result.scalars().all())
        
        return vouchers, total

    async def soft_delete(
        self, 
        voucher_id: UUID, 
        business_id: UUID, 
        deleted_by_user_id: UUID,
        reason: Optional[str] = None
    ) -> bool:
        """Elimina un comprobante (soft delete con auditoría)."""
        voucher = await self.get_by_id(voucher_id, business_id)
        if not voucher:
            return False
        
        voucher.soft_delete()
        voucher.deleted_by = deleted_by_user_id
        voucher.deletion_reason = reason or "Eliminado por el usuario"
        
        await self.db.commit()
        return True

    async def generate_pdf(self, voucher_id: UUID, business_id: UUID) -> bytes:
        """Genera el PDF de un comprobante existente."""
        voucher = await self.get_by_id(voucher_id, business_id)
        if not voucher:
            raise ValueError("Comprobante no encontrado")
            
        # Determinar letra
        letter = "X"
        if "invoice_a" in voucher.voucher_type.value or "credit_note_a" in voucher.voucher_type.value:
            letter = "A"
        elif "invoice_b" in voucher.voucher_type.value or "credit_note_b" in voucher.voucher_type.value:
            letter = "B"
        elif "invoice_c" in voucher.voucher_type.value or "credit_note_c" in voucher.voucher_type.value:
            letter = "C"
        elif "receipt" in voucher.voucher_type.value:
            letter = "R"
        
        # Si es factura o NC con CAE, usar template ARCA
        is_arca_document = (
            ("invoice" in voucher.voucher_type.value or "credit_note" in voucher.voucher_type.value)
            and voucher.cae
        )

        if is_arca_document:
            return self._generate_arca_pdf(voucher, letter)
        else:
            return self._generate_voucher_pdf(voucher, letter)

    def _generate_arca_pdf(self, voucher, letter: str) -> bytes:
        """Genera PDF de factura electrónica ARCA con CAE, QR y formato fiscal."""
        from app.services.afip_sdk_service import AfipSdkService

        # Determinar tipo de documento
        type_name = "FACTURA"
        if "credit_note" in voucher.voucher_type.value:
            type_name = "NOTA DE CRÉDITO"
        elif "debit_note" in voucher.voucher_type.value:
            type_name = "NOTA DE DÉBITO"

        # Dirección del cliente
        client_address_parts = []
        if voucher.client.street:
            client_address_parts.append(voucher.client.street)
        if voucher.client.street_number:
            client_address_parts.append(voucher.client.street_number)
        if voucher.client.city:
            client_address_parts.append(voucher.client.city)
        client_address = ", ".join(client_address_parts) if client_address_parts else "Sin domicilio"

        # Dirección del negocio
        business_address_parts = []
        if voucher.business.address:
            business_address_parts.append(voucher.business.address)
        if voucher.business.city:
            business_address_parts.append(voucher.business.city)
        if voucher.business.province:
            business_address_parts.append(voucher.business.province)
        business_address = ", ".join(business_address_parts) if business_address_parts else "Sin domicilio"

        # Obtener tipo de comprobante AFIP para el QR
        cbte_tipo = AfipSdkService.VOUCHER_TYPE_TO_CBTE_TIPO.get(voucher.voucher_type, 6)

        # Tipo de documento del receptor
        doc_tipo = 99  # Sin identificar por defecto
        doc_nro = 0
        if voucher.client.document_number:
            doc_nro_str = voucher.client.document_number.replace("-", "")
            try:
                doc_nro = int(doc_nro_str)
            except ValueError:
                doc_nro = 0
            doc_type_str = str(voucher.client.document_type) if voucher.client.document_type else ""
            if doc_type_str == "CUIT":
                doc_tipo = 80
            elif doc_type_str == "CUIL":
                doc_tipo = 86
            elif doc_type_str == "DNI":
                doc_tipo = 96

        # Número de comprobante como entero
        try:
            nro_cmp = int(voucher.number.replace("-", "")) if voucher.number else 0
        except ValueError:
            nro_cmp = 0

        # Generar QR de AFIP
        qr_data = None
        if voucher.cae:
            try:
                qr_data = pdf_service.generate_afip_qr(
                    fecha=voucher.date.strftime("%Y-%m-%d"),
                    cuit=voucher.business.cuit,
                    pto_vta=int(voucher.sale_point or "1"),
                    tipo_cmp=cbte_tipo,
                    nro_cmp=nro_cmp,
                    importe=float(voucher.total),
                    moneda="PES",
                    ctz=1,
                    tipo_doc_rec=doc_tipo,
                    nro_doc_rec=doc_nro,
                    tipo_cod_aut="E",
                    cod_aut=voucher.cae,
                )
            except Exception as e:
                print(f"Error al generar QR de AFIP: {e}")

        context = {
            "business": {
                "name": voucher.business.name,
                "address": business_address,
                "cuit": voucher.business.cuit,
                "tax_condition": voucher.business.tax_condition,
                "iibb": "-",
                "start_date": "-",
                "logo_url": voucher.business.logo_url,
            },
            "client": {
                "name": voucher.client.name,
                "document_number": voucher.client.document_number or "-",
                "tax_condition": voucher.client.tax_condition or "Consumidor Final",
                "address": client_address,
            },
            "voucher": {
                "letter": letter,
                "type_name": type_name,  # "FACTURA" o "NOTA DE CRÉDITO"
                "sale_point": voucher.sale_point or "0001",
                "comp_number": voucher.number or "00000001",
                "date": voucher.date.strftime("%d/%m/%Y"),
                "due_date": voucher.date.strftime("%d/%m/%Y"),
                "payment_method": "Efectivo",
                "cae": voucher.cae,
                "cae_expiration": (
                    voucher.cae_expiration.strftime("%d/%m/%Y")
                    if voucher.cae_expiration
                    else "-"
                ),
                "qr_data": qr_data,
            },
            "items": [
                {
                    "code": item.code or "-",
                    "description": item.description,
                    "quantity": f"{item.quantity:g}",
                    "unit": "Unidad",
                    "unit_price": f"{item.unit_price:,.2f}",
                    "discount": f"{item.discount_percent:g}" if hasattr(item, "discount_percent") and item.discount_percent else "0,00",
                    "discount_amount": f"{(item.unit_price * item.quantity * (item.discount_percent or 0) / 100):,.2f}" if hasattr(item, "discount_percent") else "0,00",
                    "subtotal": f"{item.subtotal:,.2f}",
                }
                for item in voucher.items
            ],
            "totals": {
                "subtotal": f"{voucher.subtotal:,.2f}",
                "discount": f"{sum((item.unit_price * item.quantity * (item.discount_percent or 0) / 100) for item in voucher.items):,.2f}",
                "iva": f"{voucher.iva_amount:,.2f}",
                "total": f"{voucher.total:,.2f}",
            },
        }

        return pdf_service.generate_invoice_arca_pdf(context)

    def _generate_voucher_pdf(self, voucher, letter: str) -> bytes:
        """Genera PDF de comprobante genérico (cotización, remito)."""
        # Nombre del tipo
        type_name = "COTIZACIÓN"
        if "invoice" in voucher.voucher_type.value: type_name = "FACTURA"
        elif "receipt" in voucher.voucher_type.value: type_name = "REMITO"
        
        context = {
            "business": {
                "name": voucher.business.name,
                "address": voucher.business.address or "",
                "city": voucher.business.city or "",
                "province": voucher.business.province or "",
                "phone": voucher.business.phone or "",
                "email": voucher.business.email or "",
                "cuit": voucher.business.cuit,
                "iibb": "N/A",
                "start_date": "-",
                "tax_condition": voucher.business.tax_condition,
                "logo_url": voucher.business.logo_url
            },
            "client": {
                "name": voucher.client.name,
                "document_type": voucher.client.document_type,
                "document_number": voucher.client.document_number,
                "address": f"{voucher.client.street or ''} {voucher.client.street_number or ''}".strip(),
                "city": voucher.client.city or "",
                "tax_condition": voucher.client.tax_condition,
                "phone": voucher.client.phone or ""
            },
            "voucher": {
                "letter": letter,
                "code_type": "000",
                "type_name": type_name,
                "number": f"{voucher.sale_point}-{voucher.number}",
                "date": voucher.date.strftime("%d/%m/%Y"),
                "show_prices": voucher.show_prices == "S",
                "cae": voucher.cae,
                "cae_due_date": voucher.cae_expiration.strftime("%d/%m/%Y") if voucher.cae_expiration else None,
                "qr_data": voucher.qr_data if hasattr(voucher, "qr_data") else None,
            },
            "items": [
                {
                    "code": item.code,
                    "description": item.description,
                    "quantity": f"{item.quantity:g}",
                    "unit_price": f"{item.unit_price:,.2f}",
                    "discount": f"{item.discount_percent:g}" if hasattr(item, "discount_percent") and item.discount_percent else "0",
                    "subtotal": f"{item.subtotal:,.2f}"
                }
                for item in voucher.items
            ],
            "totals": {
                "subtotal": f"{voucher.subtotal:,.2f}",
                "discount": f"{sum((item.unit_price * item.quantity * (item.discount_percent or 0) / 100) for item in voucher.items):,.2f}",
                "iva": f"{voucher.iva_amount:,.2f}",
                "total": f"{voucher.total:,.2f}"
            }
        }
        
        return pdf_service.generate_voucher_pdf(context)

    async def list_pending_quotations(
        self,
        business_id: UUID,
        page: int = 1,
        per_page: int = 100,
        search: Optional[str] = None,
        voucher_type: Optional[VoucherType] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> Tuple[List[Voucher], int]:
        """
        Lista cotizaciones y/o remitos pendientes de facturar.
        
        Un comprobante está pendiente si:
        - Es de tipo QUOTATION o RECEIPT
        - No tiene invoiced_voucher_id asignado (no fue facturado)
        - No está eliminado
        
        Se puede filtrar por:
        - tipo: solo cotizaciones o solo remitos
        - fecha: rango de fechas
        - texto: búsqueda en número y notas
        """
        from datetime import date as date_type
        
        # Tipos permitidos: cotizaciones y remitos
        allowed_types = [VoucherType.QUOTATION, VoucherType.RECEIPT]
        if voucher_type and voucher_type in allowed_types:
            type_filter = [voucher_type]
        else:
            type_filter = allowed_types
        
        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type.in_(type_filter),
            Voucher.invoiced_voucher_id.is_(None),
            Voucher.deleted_at.is_(None)
        ]

        if search:
            search_pattern = f"%{search}%"
            base_conditions.append(
                or_(
                    Voucher.number.ilike(search_pattern),
                    Voucher.notes.ilike(search_pattern)
                )
            )
        
        if date_from:
            try:
                from datetime import datetime
                date_from_parsed = datetime.strptime(date_from, "%Y-%m-%d").date()
                base_conditions.append(Voucher.date >= date_from_parsed)
            except ValueError:
                pass
        
        if date_to:
            try:
                from datetime import datetime
                date_to_parsed = datetime.strptime(date_to, "%Y-%m-%d").date()
                base_conditions.append(Voucher.date <= date_to_parsed)
            except ValueError:
                pass

        # Contar total
        count_query = select(func.count(Voucher.id)).where(*base_conditions)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Query paginada
        offset = (page - 1) * per_page
        query = (
            select(Voucher)
            .options(
                selectinload(Voucher.client),
                selectinload(Voucher.items),
                selectinload(Voucher.credit_notes),  # Requerido por has_credit_note en VoucherResponse
            )
            .where(*base_conditions)
            .order_by(desc(Voucher.created_at))
            .offset(offset)
            .limit(per_page)
        )

        result = await self.db.execute(query)
        vouchers = list(result.scalars().all())

        return vouchers, total

    async def convert_quotation_to_invoice(
        self,
        business_id: UUID,
        quotation_id: UUID,
        payments: Optional[List[Dict[str, Any]]],
        user_id: UUID,
    ) -> Voucher:
        """
        Convierte una cotización existente en una factura.
        
        - Crea una nueva factura con los mismos items y cliente.
        - Marca la cotización original con el ID de la factura generada
          (campo invoiced_voucher_id), dejándola como 'facturada'.
        - Una cotización facturada NO se puede volver a facturar.
        - La única forma de revertir es emitiendo una Nota de Crédito fiscal.
        
        Args:
            business_id: ID del negocio
            quotation_id: ID de la cotización a convertir
            payments: Métodos de pago (requerido para facturas)
            user_id: ID del usuario que realiza la conversión
            
        Returns:
            El nuevo Voucher de factura creado
            
        Raises:
            ValueError: Si la cotización no existe, ya fue facturada, o hay errores de validación
        """
        # 1. Obtener y validar cotización
        result = await self.db.execute(
            select(Voucher)
            .options(
                selectinload(Voucher.items),
                selectinload(Voucher.client),
            )
            .where(
                Voucher.id == quotation_id,
                Voucher.business_id == business_id,
                Voucher.deleted_at.is_(None)
            )
        )
        quotation = result.scalar_one_or_none()

        if not quotation:
            raise ValueError("Cotización no encontrada")

        if quotation.voucher_type != VoucherType.QUOTATION:
            raise ValueError("El comprobante seleccionado no es una cotización")

        if quotation.invoiced_voucher_id is not None:
            raise ValueError("Esta cotización ya fue facturada")

        # 2. Determinar tipo de factura según condición fiscal del cliente
        client = quotation.client
        if not client:
            client = await self.db.get(Client, quotation.client_id)
        if not client:
            raise ValueError("Cliente de la cotización no encontrado")

        invoice_type = VoucherType.INVOICE_B  # Default: Consumidor Final / Monotributista
        if client.tax_condition == "RI":
            invoice_type = VoucherType.INVOICE_A

        # 3. Obtener business para numeración
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        # 4. Obtener siguiente número de factura
        if invoice_type == VoucherType.INVOICE_A:
            last_number = int(business.last_invoice_a_number or "0")
            next_number = last_number + 1
            business.last_invoice_a_number = str(next_number).zfill(8)
        else:
            last_number = int(business.last_invoice_b_number or "0")
            next_number = last_number + 1
            business.last_invoice_b_number = str(next_number).zfill(8)

        # 5. Crear la factura
        from datetime import date as date_type

        invoice = Voucher(
            business_id=business_id,
            client_id=quotation.client_id,
            created_by=user_id,
            voucher_type=invoice_type,
            status=VoucherStatus.CONFIRMED,
            sale_point=business.sale_point or "0001",
            number=str(next_number).zfill(8),
            date=date_type.today(),
            notes=f"Facturado desde Cotización {quotation.full_number}",
            show_prices="S",
        )

        total_subtotal = Decimal(0)
        total_iva = Decimal(0)
        total_final = Decimal(0)
        items_db = []

        # 6. Copiar items de la cotización a la factura (con precios frescos de BD)
        for i, item_data in enumerate(quotation.items):
            product = await self.db.get(Product, item_data.product_id)
            if not product or product.business_id != business_id:
                raise ValueError(f"Producto {item_data.product_id} no encontrado o no pertenece al negocio")

            # Usar precio actual del producto (neto sin IVA)
            unit_price = product.net_price
            discount_factor = 1 - (item_data.discount_percent / 100)
            subtotal_line = unit_price * item_data.quantity * discount_factor
            iva_line = subtotal_line * (product.iva_rate / 100)
            total_line = subtotal_line + iva_line

            total_subtotal += subtotal_line
            total_iva += iva_line
            total_final += total_line

            invoice_item = VoucherItem(
                product_id=product.id,
                code=product.code,
                description=product.description,
                quantity=item_data.quantity,
                unit=product.unit,
                unit_price=unit_price,
                discount_percent=item_data.discount_percent,
                iva_rate=product.iva_rate,
                iva_amount=iva_line,
                subtotal=subtotal_line,
                total=total_line,
                line_number=i + 1,
            )
            items_db.append(invoice_item)

            # Descontar stock (las facturas sí descuentan)
            product.current_stock -= int(item_data.quantity)

        # 7. Asignar totales
        invoice.subtotal = total_subtotal
        invoice.iva_amount = total_iva
        invoice.total = total_final

        # 8. Guardar factura y sus items
        self.db.add(invoice)
        await self.db.flush()  # Para obtener ID de la factura

        for item in items_db:
            item.voucher_id = invoice.id
            self.db.add(item)

        # 9. Procesar pagos si se enviaron
        if payments:
            from app.models.voucher_payment import VoucherPayment
            from app.models.payment_method import PaymentMethodCatalog

            total_payments = sum(Decimal(str(p["amount"])) for p in payments)
            if abs(total_payments - total_final) > Decimal("0.01"):
                raise ValueError(
                    f"La suma de pagos (${total_payments}) no coincide con el total de la factura (${total_final})"
                )

            for payment_data in payments:
                payment_method = await self.db.get(PaymentMethodCatalog, payment_data["payment_method_id"])
                if not payment_method or payment_method.business_id != business_id:
                    raise ValueError(f"Método de pago {payment_data['payment_method_id']} no encontrado")
                if not payment_method.is_active:
                    raise ValueError(f"Método de pago '{payment_method.name}' está inactivo")
                if payment_method.requires_reference and not payment_data.get("reference"):
                    raise ValueError(f"El método '{payment_method.name}' requiere número de referencia")

                voucher_payment = VoucherPayment(
                    voucher_id=invoice.id,
                    payment_method_id=payment_data["payment_method_id"],
                    amount=Decimal(str(payment_data["amount"])),
                    reference=payment_data.get("reference"),
                )
                self.db.add(voucher_payment)

        # 10. Marcar la cotización como facturada
        quotation.invoiced_voucher_id = invoice.id

        await self.db.commit()
        await self.db.refresh(invoice)

        return await self.get_by_id(invoice.id, business_id)

    async def create_credit_note(
        self,
        business_id: UUID,
        original_voucher_id: UUID,
        reason: str,
        items_data: List[Dict[str, Any]],
        user_id: UUID
    ) -> Voucher:
        """
        Crea una Nota de Crédito a partir de una factura original.
        
        Args:
            business_id: ID del negocio
            original_voucher_id: ID de la factura original
            reason: Motivo de la NC
            items_data: Lista de items a devolver
            user_id: ID del usuario que crea la NC
            
        Returns:
            Voucher de tipo CREDIT_NOTE creado
            
        Raises:
            ValueError: Si hay errores de validación
        """
        from app.schemas.credit_note import CreditNoteItemCreate
        
        # 1. Obtener y validar factura original
        result = await self.db.execute(
            select(Voucher)
            .options(selectinload(Voucher.items))
            .where(
                Voucher.id == original_voucher_id,
                Voucher.business_id == business_id
            )
        )
        original_voucher = result.scalar_one_or_none()
        
        if not original_voucher:
            raise ValueError("Factura original no encontrada")
        
        # Validar que sea una factura (no cotización ni remito)
        if original_voucher.voucher_type not in [
            VoucherType.INVOICE_A,
            VoucherType.INVOICE_B,
            VoucherType.INVOICE_C
        ]:
            raise ValueError("Solo se pueden crear Notas de Crédito de facturas")
        
        # Validar que tenga CAE (esté emitida)
        if not original_voucher.cae:
            raise ValueError("La factura original no tiene CAE. Debe estar emitida en AFIP")
        
        # 2. Obtener business para numeración
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")
        
        # 3. Determinar tipo de NC según tipo de factura original
        nc_type_map = {
            VoucherType.INVOICE_A: VoucherType.CREDIT_NOTE_A,
            VoucherType.INVOICE_B: VoucherType.CREDIT_NOTE_B,
            VoucherType.INVOICE_C: VoucherType.CREDIT_NOTE_C,
        }
        nc_type = nc_type_map[original_voucher.voucher_type]
        
        # 4. Obtener siguiente número según el tipo de factura original
        # Las NC NO incrementan el contador, AFIP les asigna el número automáticamente
        # Usamos un número temporal que luego será reemplazado por el de AFIP
        voucher_number = "PENDING"
        
        # 5. Crear voucher de NC
        from datetime import date
        
        credit_note = Voucher(
            business_id=business_id,
            client_id=original_voucher.client_id,
            voucher_type=nc_type,
            status=VoucherStatus.CONFIRMED,
            sale_point=business.sale_point or "0001",
            number=voucher_number,  # Temporal, será reemplazado por el número de AFIP
            date=date.today(),
            notes=f"NC de Factura {original_voucher.full_number}. Motivo: {reason}",
            show_prices="S",  # S = Sí, N = No (String, no Boolean)
            created_by=user_id,
            related_voucher_id=original_voucher.id,
        )
        
        self.db.add(credit_note)
        await self.db.flush()
        
        # 6. Crear items de la NC
        subtotal = Decimal("0")
        iva_amount = Decimal("0")
        line_number = 1
        
        for item_data in items_data:
            # Validar que el producto exista en la factura original
            original_item = next(
                (i for i in original_voucher.items if str(i.product_id) == str(item_data["product_id"])),
                None
            )
            if not original_item:
                raise ValueError(f"El producto {item_data['product_id']} no está en la factura original")
            
            # Validar que la cantidad no supere la original
            if item_data["quantity"] > original_item.quantity:
                raise ValueError(
                    f"La cantidad a devolver ({item_data['quantity']}) no puede ser mayor "
                    f"a la cantidad original ({original_item.quantity})"
                )
            
            # Obtener producto
            product = await self.db.get(Product, item_data["product_id"])
            if not product:
                raise ValueError(f"Producto {item_data['product_id']} no encontrado")
            
            # Calcular precios (NEGATIVOS para NC)
            quantity = Decimal(str(item_data["quantity"]))
            unit_price = Decimal(str(item_data["unit_price"]))
            discount = Decimal(str(item_data.get("discount_percent", 0)))
            
            item_subtotal = quantity * unit_price * (1 - discount / 100)
            item_iva = item_subtotal * Decimal("0.21")  # IVA 21%
            
            # IMPORTANTE: Los montos de NC son NEGATIVOS
            subtotal -= item_subtotal
            iva_amount -= item_iva
            
            nc_item = VoucherItem(
                voucher_id=credit_note.id,
                product_id=product.id,
                code=product.code,  # Código del producto (obligatorio)
                description=product.description,
                quantity=quantity,
                unit=product.unit or "unidad",  # Unidad de medida
                unit_price=unit_price,
                discount_percent=discount,
                iva_rate=Decimal("21"),
                subtotal=item_subtotal,
                iva_amount=item_iva,
                total=item_subtotal + item_iva,
                line_number=line_number,  # Número de línea correlativo
            )
            self.db.add(nc_item)
            line_number += 1
        
        # 7. Actualizar totales del voucher (NEGATIVOS)
        credit_note.subtotal = subtotal
        credit_note.iva_amount = iva_amount
        credit_note.total = subtotal + iva_amount
        
        # 8. Validar que el total de la NC no supere el total de la factura original
        if abs(credit_note.total) > original_voucher.total:
            raise ValueError(
                f"El total de la NC (${abs(credit_note.total)}) no puede superar "
                f"el total de la factura original (${original_voucher.total})"
            )
        
        await self.db.commit()
        await self.db.refresh(credit_note)
        
        # Cargar relaciones
        result = await self.db.execute(
            select(Voucher)
            .options(selectinload(Voucher.items))
            .where(Voucher.id == credit_note.id)
        )
        return result.scalar_one()
