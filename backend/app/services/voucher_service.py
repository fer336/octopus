"""
Servicio de Comprobantes.
Maneja la creación de ventas, cálculo de totales y generación de PDF.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import date as date_type
from typing import Any, Dict, List, Optional, Tuple, Literal
from uuid import UUID

from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.client import Client
from app.models.client_authorization import ClientAuthorization
from app.models.payment_method import PaymentMethodCatalog
from app.models.product import Product
from app.models.user import User
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.models.voucher_payment import VoucherPayment
from app.schemas.voucher import (
    CurrentAccountClosePreviewResponse,
    CurrentAccountCloseItemPreview,
    CurrentAccountCloseHistoryResponse,
    CurrentAccountClosureHistoryItem,
    CurrentAccountClosureReceiptSummary,
    VoucherCreate,
    VoucherUpdate,
)
from app.services.pdf_service import pdf_service


class VoucherService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _round_money(value: Decimal) -> Decimal:
        """Redondea montos monetarios a 2 decimales (estilo ARS)."""
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    async def _get_client_or_raise(self, client_id: UUID, business_id: UUID) -> Client:
        """Obtiene cliente válido del tenant o lanza error."""
        query = select(Client).where(
            Client.id == client_id,
            Client.business_id == business_id,
            Client.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        client = result.scalar_one_or_none()
        if not client:
            raise ValueError("Cliente no encontrado")
        return client

    async def _get_open_current_account_total(
        self,
        business_id: UUID,
        billing_client_id: UUID,
        operating_client_id: Optional[UUID] = None,
    ) -> Decimal:
        """Suma deuda abierta de remitos en cuenta corriente no facturados."""
        conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type == VoucherType.RECEIPT,
            Voucher.is_current_account.is_(True),
            Voucher.billing_client_id == billing_client_id,
            Voucher.deleted_at.is_(None),
            Voucher.invoiced_voucher_id.is_(None),
        ]
        if operating_client_id:
            conditions.append(Voucher.operating_client_id == operating_client_id)

        query = select(func.coalesce(func.sum(Voucher.total), 0)).where(*conditions)
        result = await self.db.execute(query)
        total = result.scalar() or Decimal("0")
        return Decimal(str(total))

    async def _validate_current_account_for_receipt(
        self,
        business_id: UUID,
        data: VoucherCreate,
        total_final: Decimal,
    ) -> dict[str, Optional[UUID]]:
        """Valida reglas CC para remitos y retorna IDs normalizados."""
        if data.voucher_type != VoucherType.RECEIPT and data.is_current_account:
            raise ValueError("Cuenta corriente solo aplica a remitos")

        if not data.is_current_account:
            return {
                "billing_client_id": None,
                "operating_client_id": None,
            }

        if not data.billing_client_id:
            raise ValueError(
                "Debe indicar el cliente titular para remitos en cuenta corriente"
            )

        billing_client = await self._get_client_or_raise(
            data.billing_client_id, business_id
        )
        operating_client_id = data.operating_client_id or data.billing_client_id
        operating_client = await self._get_client_or_raise(
            operating_client_id, business_id
        )

        if billing_client.current_account_mode == "disabled":
            raise ValueError("El cliente titular no tiene cuenta corriente habilitada")

        projected_billing_debt = (
            await self._get_open_current_account_total(
                business_id=business_id,
                billing_client_id=billing_client.id,
            )
        ) + total_final

        if (
            billing_client.current_account_mode == "limited"
            and billing_client.credit_limit is not None
            and projected_billing_debt > Decimal(str(billing_client.credit_limit))
        ):
            raise ValueError(
                "El remito excede el límite de crédito del cliente titular"
            )

        authorization: Optional[ClientAuthorization] = None
        if operating_client.id != billing_client.id:
            auth_query = select(ClientAuthorization).where(
                ClientAuthorization.business_id == business_id,
                ClientAuthorization.billing_client_id == billing_client.id,
                ClientAuthorization.operating_client_id == operating_client.id,
                ClientAuthorization.is_active.is_(True),
                ClientAuthorization.deleted_at.is_(None),
            )
            auth_result = await self.db.execute(auth_query)
            authorization = auth_result.scalar_one_or_none()
            if not authorization:
                raise ValueError(
                    "No existe autorización activa para que este subcliente retire por el titular"
                )

        projected_operating_debt = (
            await self._get_open_current_account_total(
                business_id=business_id,
                billing_client_id=billing_client.id,
                operating_client_id=operating_client.id,
            )
        ) + total_final

        if (
            operating_client.current_account_mode == "limited"
            and operating_client.credit_limit is not None
            and projected_operating_debt > Decimal(str(operating_client.credit_limit))
        ):
            raise ValueError("El remito excede el límite del subcliente autorizado")

        if (
            authorization
            and authorization.operating_credit_limit is not None
            and projected_operating_debt
            > Decimal(str(authorization.operating_credit_limit))
        ):
            raise ValueError(
                "El remito excede el sublímite configurado para este subcliente"
            )

        return {
            "billing_client_id": billing_client.id,
            "operating_client_id": operating_client.id,
        }

    async def _is_receipt_linked_to_closure(self, voucher: Voucher) -> bool:
        """Indica si un remito ya fue incluido en un cierre de cuenta corriente."""
        if voucher.voucher_type != VoucherType.RECEIPT:
            return False
        if not voucher.invoiced_voucher_id:
            return False

        closure_voucher = await self.db.get(Voucher, voucher.invoiced_voucher_id)
        return bool(closure_voucher and closure_voucher.is_current_account_closure)

    async def _create_voucher_payments(
        self,
        voucher_id: UUID,
        business_id: UUID,
        payments: Optional[List[Dict[str, Any]]],
        total_expected: Decimal,
        *,
        require_payments: bool = False,
    ) -> None:
        """Valida y crea los pagos asociados a un comprobante."""

        normalized_payments = payments or []

        if require_payments and not normalized_payments:
            raise ValueError("Debe cargar al menos un método de pago para facturas")

        if not normalized_payments:
            return

        total_payments = sum(
            Decimal(str(payment_data["amount"])) for payment_data in normalized_payments
        )

        total_payments = self._round_money(total_payments)
        total_expected_rounded = self._round_money(total_expected)

        if abs(total_payments - total_expected_rounded) > Decimal("0.01"):
            raise ValueError(
                f"La suma de pagos (${total_payments}) no coincide con el total del comprobante (${total_expected_rounded})"
            )

        for payment_data in normalized_payments:
            payment_method = await self.db.get(
                PaymentMethodCatalog, payment_data["payment_method_id"]
            )
            if not payment_method or payment_method.business_id != business_id:
                raise ValueError(
                    f"Método de pago {payment_data['payment_method_id']} no encontrado"
                )

            if not payment_method.is_active:
                raise ValueError(
                    f"Método de pago '{payment_method.name}' está inactivo"
                )

            reference = payment_data.get("reference")
            if payment_method.requires_reference and not reference:
                raise ValueError(
                    f"El método '{payment_method.name}' requiere número de referencia"
                )

            self.db.add(
                VoucherPayment(
                    voucher_id=voucher_id,
                    payment_method_id=payment_data["payment_method_id"],
                    amount=Decimal(str(payment_data["amount"])),
                    reference=reference,
                )
            )

    async def _build_items_and_totals(
        self,
        business_id: UUID,
        items_data,
        general_discount: Decimal,
        voucher_type: VoucherType,
    ) -> tuple[List[VoucherItem], Decimal, Decimal, Decimal]:
        """Construye items del comprobante y recalcula totales."""
        total_subtotal = Decimal(0)
        total_iva = Decimal(0)
        total_final = Decimal(0)
        general_discount_factor = Decimal("1") - (general_discount / Decimal("100"))

        items_db: List[VoucherItem] = []
        for i, item_data in enumerate(items_data):
            product = await self.db.get(Product, item_data.product_id)
            if not product or product.business_id != business_id:
                raise ValueError(f"Producto {item_data.product_id} no encontrado")

            # Usar el unit_price que envía el frontend (precio SIN IVA)
            unit_price = item_data.unit_price if item_data.unit_price else product.net_price
            item_discount_factor = Decimal("1") - (item_data.discount_percent / Decimal("100"))
            subtotal_line = (
                unit_price
                * item_data.quantity
                * item_discount_factor
                * general_discount_factor
            )
            iva_rate = product.iva_rate or Decimal("21")
            iva_line = subtotal_line * (iva_rate / Decimal("100"))
            total_line = subtotal_line + iva_line

            # Redondear
            subtotal_line = self._round_money(subtotal_line)
            iva_line = self._round_money(iva_line)
            total_line = self._round_money(total_line)

            total_subtotal += subtotal_line
            total_iva += iva_line
            total_final += total_line

            voucher_item = VoucherItem(
                product_id=product.id,
                code=product.code,
                description=product.description,
                quantity=item_data.quantity,
                unit=product.unit,
                unit_price=unit_price,
                discount_percent=item_data.discount_percent,
                iva_rate=iva_rate,
                iva_amount=iva_line,
                subtotal=subtotal_line,
                total=total_line,
                line_number=i + 1,
            )
            items_db.append(voucher_item)

            # Las cotizaciones no modifican stock
            if voucher_type != VoucherType.QUOTATION:
                product.current_stock -= int(item_data.quantity)

        return items_db, total_subtotal, total_iva, total_final

    @staticmethod
    def _resolve_price_and_iva_by_strategy(
        *,
        price_strategy: Literal["historical", "current"],
        source_item: VoucherItem,
        product: Product,
    ) -> tuple[Decimal, Decimal]:
        """Resuelve precio unitario + alícuota IVA según estrategiaelegida."""
        if price_strategy == "historical":
            # Usar el unit_price guardado en el comprobante origen (debe ser sin IVA)
            return Decimal(str(source_item.unit_price)), Decimal(str(source_item.iva_rate))

        # Usar net_price (sin IVA) del producto para precios vigentes
        return Decimal(str(product.net_price)), Decimal(str(product.iva_rate))

    async def _build_invoice_items_from_source_vouchers(
        self,
        *,
        business_id: UUID,
        source_vouchers: List[Voucher],
        price_strategy: Literal["historical", "current"],
        invoice_general_discount: Decimal,
        metadata_strategy: Literal["source", "product"],
    ) -> tuple[List[VoucherItem], Decimal, Decimal, Decimal]:
        """Construye ítems/totales de factura desde comprobantes origen."""
        total_subtotal = Decimal("0")
        total_iva = Decimal("0")
        total_final = Decimal("0")
        items_db: List[VoucherItem] = []
        line_number = 1

        invoice_discount_factor = Decimal("1") - (
            Decimal(str(invoice_general_discount or Decimal("0"))) / Decimal("100")
        )

        for source_voucher in source_vouchers:
            source_general_discount = Decimal(
                str(source_voucher.general_discount or Decimal("0"))
            )
            source_discount_factor = Decimal("1") - (source_general_discount / Decimal("100"))

            for source_item in source_voucher.items:
                product = await self.db.get(Product, source_item.product_id)
                if not product or product.business_id != business_id:
                    raise ValueError(
                        f"Producto {source_item.product_id} no encontrado o no "
                        f"pertenece al negocio (en comprobante {source_voucher.full_number})"
                    )

                unit_price, iva_rate = self._resolve_price_and_iva_by_strategy(
                    price_strategy=price_strategy,
                    source_item=source_item,
                    product=product,
                )

                item_discount_factor = Decimal("1") - (
                    Decimal(str(source_item.discount_percent)) / Decimal("100")
                )

                subtotal_line = (
                    unit_price
                    * Decimal(str(source_item.quantity))
                    * item_discount_factor
                    * source_discount_factor
                    * invoice_discount_factor
                )
                iva_line = subtotal_line * (iva_rate / Decimal("100"))
                total_line = subtotal_line + iva_line

                subtotal_line = self._round_money(subtotal_line)
                iva_line = self._round_money(iva_line)
                total_line = self._round_money(total_line)

                total_subtotal += subtotal_line
                total_iva += iva_line
                total_final += total_line

                if metadata_strategy == "product":
                    code = product.code
                    description = product.description
                    unit = product.unit
                else:
                    code = source_item.code
                    description = source_item.description
                    unit = source_item.unit

                items_db.append(
                    VoucherItem(
                        product_id=product.id,
                        code=code,
                        description=description,
                        quantity=source_item.quantity,
                        unit=unit,
                        unit_price=unit_price,
                        discount_percent=source_item.discount_percent,
                        iva_rate=iva_rate,
                        iva_amount=iva_line,
                        subtotal=subtotal_line,
                        total=total_line,
                        line_number=line_number,
                    )
                )
                line_number += 1

                # Las facturas descuentan stock
                product.current_stock -= int(source_item.quantity)

        return (
            items_db,
            self._round_money(total_subtotal),
            self._round_money(total_iva),
            self._round_money(total_final),
        )

    async def create(
        self, business_id: UUID, data: VoucherCreate, user_id: UUID
    ) -> Voucher:
        """Crea un nuevo comprobante."""

        # 1. Obtener cliente principal de comprobante
        await self._get_client_or_raise(data.client_id, business_id)

        # 2. Obtener business para numeración correlativa
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        # 3. Obtener siguiente número según tipo
        voucher_type_str = (
            data.voucher_type.value
            if hasattr(data.voucher_type, "value")
            else str(data.voucher_type)
        )

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
            general_discount=data.general_discount,
        )

        (
            items_db,
            total_subtotal,
            total_iva,
            total_final,
        ) = await self._build_items_and_totals(
            business_id=business_id,
            items_data=data.items,
            general_discount=data.general_discount,
            voucher_type=data.voucher_type,
        )

        # Asignar totales al voucher
        voucher.subtotal = total_subtotal
        voucher.iva_amount = total_iva
        voucher.total = total_final

        cc_context = await self._validate_current_account_for_receipt(
            business_id=business_id,
            data=data,
            total_final=total_final,
        )
        voucher.is_current_account = bool(data.is_current_account)
        voucher.billing_client_id = cc_context["billing_client_id"]
        voucher.operating_client_id = cc_context["operating_client_id"]
        if cc_context["billing_client_id"]:
            voucher.client_id = cc_context["billing_client_id"]

        # Guardar todo
        self.db.add(voucher)
        await self.db.flush()  # Para obtener ID del voucher

        for item in items_db:
            item.voucher_id = voucher.id
            self.db.add(item)

        payments_raw = (
            [payment.model_dump() for payment in data.payments]
            if data.payments
            else None
        )
        await self._create_voucher_payments(
            voucher_id=voucher.id,
            business_id=business_id,
            payments=payments_raw,
            total_expected=total_final,
            require_payments=data.voucher_type
            in {
                VoucherType.INVOICE_A,
                VoucherType.INVOICE_B,
                VoucherType.INVOICE_C,
            },
        )

        await self.db.commit()
        await self.db.refresh(voucher)

        # Cargar relaciones para la respuesta
        # Necesitamos recargar con las relaciones para el PDF o respuesta completa
        return await self.get_by_id(voucher.id, business_id)

    async def update_quotation(
        self,
        voucher_id: UUID,
        business_id: UUID,
        data: VoucherUpdate,
    ) -> Voucher:
        """Actualiza una cotización existente, reemplazando ítems y totales."""
        voucher = await self.get_by_id(voucher_id, business_id)
        if not voucher:
            raise ValueError("Comprobante no encontrado")

        if voucher.deleted_at is not None:
            raise ValueError("No se puede editar un comprobante eliminado")

        if voucher.voucher_type != VoucherType.QUOTATION:
            raise ValueError("Solo se pueden editar cotizaciones")

        if voucher.invoiced_voucher_id is not None:
            raise ValueError("No se puede editar una cotización ya facturada")

        if voucher.is_current_account_closure:
            raise ValueError(
                "No se puede editar un comprobante de cierre de cuenta corriente"
            )

        client = await self.db.get(Client, data.client_id)
        if not client or client.business_id != business_id:
            raise ValueError("Cliente no encontrado")

        voucher.client_id = data.client_id
        voucher.date = data.date
        voucher.notes = data.notes
        voucher.show_prices = "S" if data.show_prices else "N"
        voucher.general_discount = data.general_discount

        # Eliminamos por ORM para mantener la sesión consistente
        # (evita que queden ítems "fantasma" en relaciones ya cargadas).
        for current_item in list(voucher.items):
            await self.db.delete(current_item)
        await self.db.flush()

        (
            items_db,
            total_subtotal,
            total_iva,
            total_final,
        ) = await self._build_items_and_totals(
            business_id=business_id,
            items_data=data.items,
            general_discount=data.general_discount,
            voucher_type=voucher.voucher_type,
        )

        voucher.subtotal = total_subtotal
        voucher.iva_amount = total_iva
        voucher.total = total_final

        for item in items_db:
            item.voucher_id = voucher.id
            self.db.add(item)

        await self.db.commit()
        await self.db.refresh(voucher, attribute_names=["items"])
        return await self.get_by_id(voucher.id, business_id)

    async def get_by_id(self, voucher_id: UUID, business_id: UUID) -> Optional[Voucher]:
        """Obtiene un comprobante por ID con todas sus relaciones."""
        query = (
            select(Voucher)
            .options(
                selectinload(Voucher.items),
                selectinload(Voucher.client),
                selectinload(Voucher.billing_client),
                selectinload(Voucher.operating_client),
                selectinload(Voucher.business),
                selectinload(Voucher.credit_notes),  # Requerido por has_credit_note
            )
            .where(Voucher.id == voucher_id, Voucher.business_id == business_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_code(
        self, code: str, business_id: UUID
    ) -> Optional[Voucher]:
        """
        Obtiene un comprobante por código (formato: sale_point-number, ej: "0001-00000001").
       Solo retorna cotizaciones (quotation) que no hayan sido facturadas.
        """
        # Normalizar código: puede venir con o sin guiones
        normalized_code = code.strip().upper()
        if "-" in normalized_code:
            parts = normalized_code.split("-")
            if len(parts) == 2:
                sale_point = parts[0].zfill(4)
                number = parts[1].zfill(8)
            else:
                sale_point = parts[0].zfill(4)
                number = "".join(parts[1:]).zfill(8)
        else:
            # Si no hay guión, asumir que todo es el número
            sale_point = "0001"
            number = normalized_code.zfill(8)

        query = (
            select(Voucher)
            .options(
                selectinload(Voucher.items),
                selectinload(Voucher.client),
                selectinload(Voucher.billing_client),
                selectinload(Voucher.operating_client),
                selectinload(Voucher.credit_notes),  # Requerido por has_credit_note
            )
            .where(
                Voucher.business_id == business_id,
                Voucher.deleted_at.is_(None),
                Voucher.voucher_type == VoucherType.QUOTATION,
                Voucher.sale_point == sale_point,
                Voucher.number == number,
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
        payment_method_id: Optional[UUID] = None,
    ) -> Tuple[List[Voucher], int]:
        """Lista comprobantes con filtros y paginación."""

        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.deleted_at.is_(None),
        ]

        if voucher_type:
            base_conditions.append(Voucher.voucher_type == voucher_type)

        if status:
            base_conditions.append(Voucher.status == status)

        if payment_method_id:
            base_conditions.append(
                Voucher.voucher_payments.any(
                    VoucherPayment.payment_method_id == payment_method_id
                )
            )

        if search:
            search_pattern = f"%{search}%"
            base_conditions.append(
                or_(
                    Voucher.number.ilike(search_pattern),
                    Voucher.sale_point.ilike(search_pattern),
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
                selectinload(Voucher.billing_client),
                selectinload(Voucher.operating_client),
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
        reason: Optional[str] = None,
    ) -> bool:
        """Elimina un comprobante (soft delete con auditoría)."""
        voucher = await self.get_by_id(voucher_id, business_id)
        if not voucher:
            return False

        if not reason or not reason.strip():
            raise ValueError("Debe indicar un motivo de eliminación")

        if voucher.is_current_account_closure:
            raise ValueError(
                "No se puede eliminar un comprobante de cierre de cuenta corriente"
            )

        if await self._is_receipt_linked_to_closure(voucher):
            raise ValueError(
                "No se puede eliminar un remito incluido en un cierre de cuenta corriente"
            )

        voucher.soft_delete()
        voucher.deleted_by = deleted_by_user_id
        voucher.deletion_reason = reason.strip()

        await self.db.commit()
        return True

    async def generate_pdf(self, voucher_id: UUID, business_id: UUID) -> bytes:
        """Genera el PDF de un comprobante existente."""
        voucher = await self.get_by_id(voucher_id, business_id)
        if not voucher:
            raise ValueError("Comprobante no encontrado")

        # Determinar letra
        letter = "X"
        if (
            "invoice_a" in voucher.voucher_type.value
            or "credit_note_a" in voucher.voucher_type.value
        ):
            letter = "A"
        elif (
            "invoice_b" in voucher.voucher_type.value
            or "credit_note_b" in voucher.voucher_type.value
        ):
            letter = "B"
        elif (
            "invoice_c" in voucher.voucher_type.value
            or "credit_note_c" in voucher.voucher_type.value
        ):
            letter = "C"
        elif "receipt" in voucher.voucher_type.value:
            letter = "R"

        # Si es factura o NC con CAE, usar template ARCA
        is_arca_document = (
            "invoice" in voucher.voucher_type.value
            or "credit_note" in voucher.voucher_type.value
        ) and voucher.cae

        if is_arca_document:
            return self._generate_arca_pdf(voucher, letter)
        elif voucher.is_current_account_closure:
            return self._generate_closure_pdf(voucher, letter)
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
        client_address = (
            ", ".join(client_address_parts) if client_address_parts else "Sin domicilio"
        )

        # Dirección del negocio
        business_address_parts = []
        if voucher.business.address:
            business_address_parts.append(voucher.business.address)
        if voucher.business.city:
            business_address_parts.append(voucher.business.city)
        if voucher.business.province:
            business_address_parts.append(voucher.business.province)
        business_address = (
            ", ".join(business_address_parts)
            if business_address_parts
            else "Sin domicilio"
        )

        # Obtener tipo de comprobante AFIP para el QR
        cbte_tipo = AfipSdkService.VOUCHER_TYPE_TO_CBTE_TIPO.get(
            voucher.voucher_type, 6
        )

        # Tipo de documento del receptor
        doc_tipo = 99  # Sin identificar por defecto
        doc_nro = 0
        if voucher.client.document_number:
            doc_nro_str = voucher.client.document_number.replace("-", "")
            try:
                doc_nro = int(doc_nro_str)
            except ValueError:
                doc_nro = 0
            doc_type_str = (
                str(voucher.client.document_type)
                if voucher.client.document_type
                else ""
            )
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
                    "discount": f"{item.discount_percent:g}"
                    if hasattr(item, "discount_percent") and item.discount_percent
                    else "0,00",
                    "discount_amount": f"{(item.unit_price * item.quantity * (item.discount_percent or 0) / 100):,.2f}"
                    if hasattr(item, "discount_percent")
                    else "0,00",
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

    def _generate_closure_pdf(self, voucher, letter: str) -> bytes:
        """Genera PDF compacto de cierre de cuenta corriente (densidad tipo Orden de Pedido)."""
        # Obtener los receipts originales vinculados a este cierre
        # Un receipt tiene invoiced_voucher_id = voucher.id

        # Agrupar items por receipt
        receipts_data: List[Dict[str, Any]] = []
        # Items vienen con formato: "[001-00000001] Descripción"
        # Parseamos para mostrar agrupados por receipt

        # Por cada item, extraer el número de receipt del prefijo
        items_by_receipt: Dict[str, List[Any]] = {}

        for item in voucher.items:
            # Formato: "[001-00000001] Descripción"
            desc = item.description
            receipt_num = desc[:12] if desc.startswith("[") else ""
            key = receipt_num if receipt_num else "OTROS"

            if key not in items_by_receipt:
                items_by_receipt[key] = []

            items_by_receipt[key].append(
                {
                    "description": desc[13:] if desc.startswith("[") else desc,
                    "quantity": item.quantity,
                    "unit": item.unit,
                    "unit_price": item.unit_price,
                    "discount_percent": item.discount_percent,
                    "iva_rate": item.iva_rate,
                    "subtotal": item.subtotal,
                    "total": item.total,
                }
            )

        # Ahora build items grouped por receipt
        flat_items = []
        for receipt_num, receipt_items in items_by_receipt.items():
            for item in receipt_items:
                flat_items.append(
                    {
                        "receipt_number": receipt_num.strip("[]")
                        if receipt_num
                        else "",
                        **item,
                    }
                )

        context = {
            "business": {
                "name": voucher.business.name,
                "address": voucher.business.address or "",
                "city": voucher.business.city or "",
                "province": voucher.business.province or "",
                "phone": voucher.business.phone or "",
                "email": voucher.business.email or "",
                "cuit": voucher.business.cuit,
                "tax_condition": voucher.business.tax_condition,
                "logo_url": voucher.business.logo_url,
            },
            "client": {
                "name": voucher.billing_client.name
                if voucher.billing_client
                else (voucher.client.name if voucher.client else ""),
                "document_number": voucher.billing_client.document_number
                if voucher.billing_client
                else (voucher.client.document_number if voucher.client else ""),
            },
            "voucher": {
                "letter": "X",
                "type_name": "CIERRE CUENTA CORRIENTE",
                "number": f"{voucher.sale_point}-{voucher.number}",
                "date": voucher.date.strftime("%d/%m/%Y"),
                "notes": voucher.notes or "",
            },
            "items": flat_items,
            "totals": {
                "subtotal": f"{voucher.subtotal:,.2f}",
                "iva": f"{voucher.iva_amount:,.2f}",
                "total": f"{voucher.total:,.2f}",
            },
            "generated_at": date_type.today().strftime("%d/%m/%Y"),
        }

        return pdf_service.generate_closure_pdf(context)

    def _generate_voucher_pdf(self, voucher, letter: str) -> bytes:
        """Genera PDF de comprobante genérico (cotización, remito)."""
        # Nombre del tipo
        type_name = "COTIZACIÓN"
        if "invoice" in voucher.voucher_type.value:
            type_name = "FACTURA"
        elif "receipt" in voucher.voucher_type.value:
            type_name = "REMITO"

        is_subclient_withdrawal = bool(
            voucher.billing_client_id
            and voucher.operating_client_id
            and voucher.billing_client_id != voucher.operating_client_id
        )
        withdrawal_client_display_name = (
            voucher.withdrawal_client_name if is_subclient_withdrawal else "TITULAR"
        )

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
                "logo_url": voucher.business.logo_url,
            },
            "client": {
                "name": voucher.client.name,
                "document_type": voucher.client.document_type,
                "document_number": voucher.client.document_number,
                "address": f"{voucher.client.street or ''} {voucher.client.street_number or ''}".strip(),
                "city": voucher.client.city or "",
                "tax_condition": voucher.client.tax_condition,
                "phone": voucher.client.phone or "",
            },
            "voucher": {
                "letter": letter,
                "code_type": "000",
                "type_name": type_name,
                "number": f"{voucher.sale_point}-{voucher.number}",
                "date": voucher.date.strftime("%d/%m/%Y"),
                "show_prices": voucher.show_prices == "S",
                "is_current_account": bool(voucher.is_current_account),
                "is_withdrawal_authorized": bool(voucher.is_withdrawal_authorized),
                "withdrawal_client_name": voucher.withdrawal_client_name,
                "withdrawal_client_display_name": withdrawal_client_display_name,
                "is_subclient_withdrawal": is_subclient_withdrawal,
                "cae": voucher.cae,
                "cae_due_date": voucher.cae_expiration.strftime("%d/%m/%Y")
                if voucher.cae_expiration
                else None,
                "qr_data": voucher.qr_data if hasattr(voucher, "qr_data") else None,
            },
            "items": [
                {
                    "code": item.code,
                    "description": item.description,
                    "quantity": f"{item.quantity:g}",
                    "unit_price": f"{item.unit_price:,.2f}",
                    "discount": f"{item.discount_percent:g}"
                    if hasattr(item, "discount_percent") and item.discount_percent
                    else "0",
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
            Voucher.deleted_at.is_(None),
        ]

        if search:
            search_pattern = f"%{search}%"
            base_conditions.append(
                or_(
                    Voucher.number.ilike(search_pattern),
                    Voucher.notes.ilike(search_pattern),
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
                selectinload(Voucher.billing_client),
                selectinload(Voucher.operating_client),
                selectinload(Voucher.items),
                selectinload(
                    Voucher.credit_notes
                ),  # Requerido por has_credit_note en VoucherResponse
            )
            .where(*base_conditions)
            .order_by(desc(Voucher.created_at))
            .offset(offset)
            .limit(per_page)
        )

        result = await self.db.execute(query)
        vouchers = list(result.scalars().all())

        return vouchers, total

    async def list_current_account_receipts(
        self,
        business_id: UUID,
        page: int = 1,
        per_page: int = 100,
        billing_client_id: Optional[UUID] = None,
        pending_only: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Voucher], int]:
        """Lista remitos de cuenta corriente para control/cierre."""
        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type == VoucherType.RECEIPT,
            Voucher.is_current_account.is_(True),
            Voucher.deleted_at.is_(None),
        ]

        if billing_client_id:
            base_conditions.append(Voucher.billing_client_id == billing_client_id)

        if pending_only is True:
            base_conditions.append(Voucher.invoiced_voucher_id.is_(None))
        elif pending_only is False:
            base_conditions.append(Voucher.invoiced_voucher_id.is_not(None))

        if search:
            search_pattern = f"%{search}%"
            base_conditions.append(
                or_(
                    Voucher.number.ilike(search_pattern),
                    Voucher.notes.ilike(search_pattern),
                    Voucher.sale_point.ilike(search_pattern),
                )
            )

        count_query = select(func.count(Voucher.id)).where(*base_conditions)
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        offset = (page - 1) * per_page
        query = (
            select(Voucher)
            .options(
                selectinload(Voucher.client),
                selectinload(Voucher.billing_client),
                selectinload(Voucher.operating_client),
                selectinload(Voucher.items),
                selectinload(Voucher.credit_notes),
            )
            .where(*base_conditions)
            .order_by(desc(Voucher.date), desc(Voucher.created_at))
            .offset(offset)
            .limit(per_page)
        )

        result = await self.db.execute(query)
        vouchers = list(result.scalars().all())
        return vouchers, total

    async def preview_current_account_close(
        self,
        business_id: UUID,
        billing_client_id: UUID,
        receipt_ids: Optional[List[UUID]],
        close_all: bool,
        notes: Optional[str],
    ) -> CurrentAccountClosePreviewResponse:
        """
        Previsualiza un cierre de cuenta corriente SIN persistir nada.
        Calcula totales y items que tendría el comprobante de cierre.
        """
        billing_client = await self._get_client_or_raise(billing_client_id, business_id)

        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type == VoucherType.RECEIPT,
            Voucher.is_current_account.is_(True),
            Voucher.billing_client_id == billing_client_id,
            Voucher.invoiced_voucher_id.is_(None),
            Voucher.deleted_at.is_(None),
        ]

        if not close_all:
            if not receipt_ids:
                raise ValueError("Debe indicar remitos a cerrar o usar close_all=true")
            base_conditions.append(Voucher.id.in_(receipt_ids))

        query = (
            select(Voucher)
            .options(
                selectinload(Voucher.operating_client),
                selectinload(Voucher.items),
            )
            .where(*base_conditions)
            .order_by(Voucher.date.asc(), Voucher.created_at.asc())
        )
        result = await self.db.execute(query)
        source_receipts = list(result.scalars().all())

        if not source_receipts:
            raise ValueError("No hay remitos de cuenta corriente para cerrar")

        if receipt_ids:
            found_ids = {voucher.id for voucher in source_receipts}
            missing = [rid for rid in receipt_ids if rid not in found_ids]
            if missing:
                raise ValueError("Uno o más remitos seleccionados no están disponibles")

        # Construir items del preview
        items: List[CurrentAccountCloseItemPreview] = []
        total_subtotal = Decimal("0")
        total_iva = Decimal("0")
        total_final = Decimal("0")

        for receipt in source_receipts:
            # Obtener descuento general del remito
            general_discount = receipt.general_discount or Decimal("0")

            for item in receipt.items:
                # Agregar prefijo con número de remito origen
                desc_with_prefix = f"[{receipt.full_number}] {item.description}"

                preview_item = CurrentAccountCloseItemPreview(
                    receipt_id=receipt.id,
                    receipt_number=receipt.full_number,
                    receipt_date=receipt.date,
                    operating_client_name=receipt.withdrawal_client_name,
                    is_withdrawal_authorized=receipt.is_withdrawal_authorized,
general_discount=final_discount,
                    code=item.code,
                    description=desc_with_prefix,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    discount_percent=item.discount_percent,
                    iva_rate=item.iva_rate,
                    subtotal=item.subtotal,
                    total=item.total,
                )
                items.append(preview_item)
                total_subtotal += Decimal(str(item.subtotal))
                total_iva += Decimal(str(item.iva_amount))
                total_final += Decimal(str(item.total))

        return CurrentAccountClosePreviewResponse(
            billing_client_name=billing_client.name,
            items=items,
            total_receipts=len(source_receipts),
            total_items=len(items),
            subtotal=total_subtotal,
            iva_amount=total_iva,
            total=total_final,
        )

    async def close_current_account(
        self,
        business_id: UUID,
        billing_client_id: UUID,
        receipt_ids: Optional[List[UUID]],
        close_all: bool,
        notes: Optional[str],
        user_id: UUID,
    ) -> Voucher:
        """Cierra una cuenta corriente creando cotización consolidada pendiente de facturar."""
        billing_client = await self._get_client_or_raise(billing_client_id, business_id)

        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type == VoucherType.RECEIPT,
            Voucher.is_current_account.is_(True),
            Voucher.billing_client_id == billing_client_id,
            Voucher.invoiced_voucher_id.is_(None),
            Voucher.deleted_at.is_(None),
        ]

        if not close_all:
            if not receipt_ids:
                raise ValueError("Debe indicar remitos a cerrar o usar close_all=true")
            base_conditions.append(Voucher.id.in_(receipt_ids))

        query = (
            select(Voucher)
            .options(selectinload(Voucher.items))
            .where(*base_conditions)
            .order_by(Voucher.date.asc(), Voucher.created_at.asc())
        )
        result = await self.db.execute(query)
        source_receipts = list(result.scalars().all())

        if not source_receipts:
            raise ValueError("No hay remitos de cuenta corriente para cerrar")

        if receipt_ids:
            found_ids = {voucher.id for voucher in source_receipts}
            missing = [rid for rid in receipt_ids if rid not in found_ids]
            if missing:
                raise ValueError("Uno o más remitos seleccionados no están disponibles")

        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        last_number = int(business.last_quotation_number or "0")
        next_number = last_number + 1
        business.last_quotation_number = str(next_number).zfill(8)

        closure_notes = notes or (
            f"Cierre Cuenta Corriente - {billing_client.name} - {len(source_receipts)} remito(s)"
        )

        closure_voucher = Voucher(
            business_id=business_id,
            client_id=billing_client_id,
            billing_client_id=billing_client_id,
            operating_client_id=None,
            is_current_account=True,
            is_current_account_closure=True,
            created_by=user_id,
            voucher_type=VoucherType.QUOTATION,
            status=VoucherStatus.CONFIRMED,
            sale_point=business.sale_point or "0001",
            number=str(next_number).zfill(8),
            date=date_type.today(),
            notes=closure_notes,
            show_prices="S",
            general_discount=Decimal("0"),
        )
        self.db.add(closure_voucher)
        await self.db.flush()

        line_number = 1
        total_subtotal = Decimal("0")
        total_iva = Decimal("0")
        total_final = Decimal("0")

        for receipt in source_receipts:
            for item in receipt.items:
                closure_item = VoucherItem(
                    voucher_id=closure_voucher.id,
                    product_id=item.product_id,
                    code=item.code,
                    description=f"[{receipt.full_number}] {item.description}",
                    quantity=item.quantity,
                    unit=item.unit,
                    unit_price=item.unit_price,
                    discount_percent=item.discount_percent,
                    iva_rate=item.iva_rate,
                    iva_amount=item.iva_amount,
                    subtotal=item.subtotal,
                    total=item.total,
                    line_number=line_number,
                )
                self.db.add(closure_item)
                line_number += 1
                total_subtotal += Decimal(str(item.subtotal))
                total_iva += Decimal(str(item.iva_amount))
                total_final += Decimal(str(item.total))

            receipt.invoiced_voucher_id = closure_voucher.id

        closure_voucher.subtotal = total_subtotal
        closure_voucher.iva_amount = total_iva
        closure_voucher.total = total_final

        await self.db.commit()
        await self.db.refresh(closure_voucher)

        return await self.get_by_id(closure_voucher.id, business_id)

    async def get_current_account_closure_history(
        self,
        business_id: UUID,
        billing_client_id: UUID,
    ) -> CurrentAccountCloseHistoryResponse:
        """
        Obtiene el historial de cierres de cuenta corriente por cliente titular.
        Incluye los receipts que fueron marcados en cada cierre.
        """
        # Buscar todos los closures de CC para este cliente
        closures_query = (
            select(Voucher)
            .options(
                selectinload(Voucher.items),
            )
            .where(
                Voucher.business_id == business_id,
                Voucher.is_current_account_closure.is_(True),
                Voucher.billing_client_id == billing_client_id,
                Voucher.deleted_at.is_(None),
            )
            .order_by(Voucher.date.desc(), Voucher.created_at.desc())
        )
        result = await self.db.execute(closures_query)
        closures = list(result.scalars().all())

        if not closures:
            return CurrentAccountCloseHistoryResponse(closures=[], total=0)

        # Para cada closure, buscar los receipts vinculados
        # Un receipt tiene invoiced_voucher_id = closure.id
        closure_items: List[CurrentAccountClosureHistoryItem] = []

        for closure in closures:
            # Buscar receipts que apuntan a este closure
            receipts_query = (
                select(Voucher)
                .options(selectinload(Voucher.operating_client))
                .where(
                    Voucher.business_id == business_id,
                    Voucher.voucher_type == VoucherType.RECEIPT,
                    Voucher.is_current_account.is_(True),
                    Voucher.invoiced_voucher_id == closure.id,
                    Voucher.deleted_at.is_(None),
                )
                .order_by(Voucher.date.asc())
            )
            receipts_result = await self.db.execute(receipts_query)
            receipts = list(receipts_result.scalars().all())

            receipt_summaries: List[CurrentAccountClosureReceiptSummary] = []
            for receipt in receipts:
                receipt_summaries.append(
                    CurrentAccountClosureReceiptSummary(
                        receipt_id=receipt.id,
                        receipt_number=receipt.full_number,
                        receipt_date=receipt.date,
                        operating_client_name=receipt.withdrawal_client_name,
                        total=receipt.total,
                    )
                )

            closure_items.append(
                CurrentAccountClosureHistoryItem(
                    closure_voucher_id=closure.id,
                    closure_number=closure.full_number,
                    closure_date=closure.date,
                    notes=closure.notes,
                    total_receipts=len(receipts),
                    total_items=len(closure.items) if closure.items else 0,
                    subtotal=closure.subtotal or Decimal("0"),
                    iva_amount=closure.iva_amount or Decimal("0"),
                    total=closure.total or Decimal("0"),
                    receipts=receipt_summaries,
                )
            )

        return CurrentAccountCloseHistoryResponse(
            closures=closure_items,
            total=len(closure_items),
        )

    async def convert_quotation_to_invoice(
        self,
        business_id: UUID,
        quotation_id: UUID,
        payments: Optional[List[Dict[str, Any]]],
        fiscal_client_id: Optional[UUID],
        user_id: UUID,
        price_strategy: Literal["historical", "current"] = "historical",
    ) -> Voucher:
        """
        Convierte una cotización existente en una factura.

        - Crea una nueva factura con los mismos ítems.
        - Permite override opcional de cliente fiscal final.
        - Marca la cotización original con el ID de la factura generada
          (campo invoiced_voucher_id), dejándola como 'facturada'.
        - Una cotización facturada NO se puede volver a facturar.
        - La única forma de revertir es emitiendo una Nota de Crédito fiscal.

        Args:
            business_id: ID del negocio
            quotation_id: ID de la cotización a convertir
            payments: Métodos de pago (requerido para facturas)
            fiscal_client_id: Cliente fiscal final (opcional)
            price_strategy: Estrategia de precios ('historical' | 'current')
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
                Voucher.deleted_at.is_(None),
            )
        )
        quotation = result.scalar_one_or_none()

        if not quotation:
            raise ValueError("Cotización no encontrada")

        if quotation.voucher_type != VoucherType.QUOTATION:
            raise ValueError("El comprobante seleccionado no es una cotización")

        if quotation.invoiced_voucher_id is not None:
            raise ValueError("Esta cotización ya fue facturada")

        # 2. Resolver cliente origen (trazabilidad) y cliente fiscal final
        source_client = quotation.client
        if not source_client:
            source_client = await self.db.get(Client, quotation.client_id)
        if not source_client:
            raise ValueError("Cliente de la cotización no encontrado")

        invoice_client = source_client
        if fiscal_client_id:
            invoice_client = await self._get_client_or_raise(fiscal_client_id, business_id)

        invoice_type = (
            VoucherType.INVOICE_B
        )  # Default: Consumidor Final / Monotributista
        if invoice_client.tax_condition == "RI":
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
        # Heredar el descuento general de la cotización original
        quotation_general_discount = quotation.general_discount or Decimal(0)

        strategy_note = (
            "precios históricos del comprobante"
            if price_strategy == "historical"
            else "precios vigentes del catálogo"
        )
        invoice_notes = (
            f"Facturado desde Cotización {quotation.full_number}"
            f" | Estrategia de precio: {price_strategy} ({strategy_note})"
        )
        if invoice_client.id != source_client.id:
            invoice_notes += (
                f" | Cliente origen: {source_client.name}"
                f" | Facturado a: {invoice_client.name}"
            )

        invoice = Voucher(
            business_id=business_id,
            client_id=invoice_client.id,
            created_by=user_id,
            voucher_type=invoice_type,
            status=VoucherStatus.CONFIRMED,
            sale_point=business.sale_point or "0001",
            number=str(next_number).zfill(8),
            date=date_type.today(),
            notes=invoice_notes,
            show_prices="S",
            general_discount=quotation_general_discount,
        )

        (
            items_db,
            total_subtotal,
            total_iva,
            total_final,
        ) = await self._build_invoice_items_from_source_vouchers(
            business_id=business_id,
            source_vouchers=[quotation],
            price_strategy=price_strategy,
            invoice_general_discount=Decimal("0"),
            metadata_strategy="product",
        )

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

        await self._create_voucher_payments(
            voucher_id=invoice.id,
            business_id=business_id,
            payments=payments,
            total_expected=total_final,
            require_payments=True,
        )

        # 10. Marcar la cotización como facturada
        quotation.invoiced_voucher_id = invoice.id

        await self.db.commit()
        await self.db.refresh(invoice)

        return await self.get_by_id(invoice.id, business_id)

    async def compile_quotations_to_invoice(
        self,
        business_id: UUID,
        quotation_ids: List[UUID],
        payments: Optional[List[Dict[str, Any]]],
        fiscal_client_id: Optional[UUID],
        price_strategy: Literal["historical", "current"] = "historical",
        general_discount: Decimal = Decimal("0"),
        user_id: UUID = None,
    ) -> Voucher:
        """
        Compila comprobantes (cotizaciones/remitos) en una sola factura.

        Si se provee general_discount, se usa ese valor.
        Si no se provee (0), se usa el MAYOR descuento general entre todas las cotizaciones.
        Esto protege al negocio (aplica el descuento más alto, no el menor).
        Las alternativas (promedio, primero) podrían generar discrepancias.

        Args:
            business_id: ID del negocio
            quotation_ids: Lista de IDs de cotizaciones/remitos a compilar
            payments: Métodos de pago (requerido para facturas)
            fiscal_client_id: Cliente fiscal final (opcional)
            price_strategy: Estrategia de precios ('historical' | 'current')
            general_discount: Descuento general (%) override. Si es 0, usa max de cotizaciones.
            user_id: ID del usuario que realiza la compilación

        Returns:
            El nuevo Voucher de factura creado

        Raises:
            ValueError: Si hay errores de validación en cualquiera de los comprobantes
        """
        # 1. Validar mínimo
        if len(quotation_ids) < 1:
            raise ValueError("Debe indicar al menos 1 comprobante para facturar")

        # 2. Cargar todas las cotizaciones en una sola query
        result = await self.db.execute(
            select(Voucher)
            .options(
                selectinload(Voucher.items),
                selectinload(Voucher.client),
            )
            .where(
                Voucher.id.in_(quotation_ids),
                Voucher.business_id == business_id,
                Voucher.deleted_at.is_(None),
            )
        )
        source_vouchers = list(result.scalars().all())

        # 3. Verificar que todas existan
        found_ids = {q.id for q in source_vouchers}
        missing = [qid for qid in quotation_ids if qid not in found_ids]
        if missing:
            raise ValueError(
                f"Comprobante(s) no encontrado(s): {[str(m) for m in missing]}"
            )

        # 4. Validar tipos permitidos (quotation/receipt)
        for q in source_vouchers:
            if q.voucher_type not in [VoucherType.QUOTATION, VoucherType.RECEIPT]:
                raise ValueError(
                    f"El comprobante '{q.full_number}' no es válido para facturar (solo cotización/remito)"
                )

        # 5. Validar que ninguna esté ya facturada
        already_invoiced = [
            q for q in source_vouchers if q.invoiced_voucher_id is not None
        ]
        if already_invoiced:
            numbers = ", ".join(q.full_number for q in already_invoiced)
            raise ValueError(
                f"Los siguientes comprobantes ya fueron facturados: {numbers}"
            )

        # 6. Validar que TODAS tengan el MISMO cliente
        client_ids = {str(q.client_id) for q in source_vouchers}
        if len(client_ids) > 1:
            raise ValueError(
                "No se pueden facturar juntos comprobantes de diferentes clientes. "
                "Todas deben tener el mismo cliente."
            )

        source_client = source_vouchers[0].client
        if not source_client:
            source_client = await self.db.get(Client, source_vouchers[0].client_id)
        if not source_client:
            raise ValueError("Cliente de los comprobantes no encontrado")

        invoice_client = source_client
        if fiscal_client_id:
            invoice_client = await self._get_client_or_raise(fiscal_client_id, business_id)

        # 7. Determinar tipo de factura según condición fiscal del cliente
        invoice_type = VoucherType.INVOICE_B
        if invoice_client.tax_condition == "RI":
            invoice_type = VoucherType.INVOICE_A

        # 8. Obtener business para numeración
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        # 9. Obtener siguiente número de factura
        if invoice_type == VoucherType.INVOICE_A:
            last_number = int(business.last_invoice_a_number or "0")
            next_number = last_number + 1
            business.last_invoice_a_number = str(next_number).zfill(8)
        else:
            last_number = int(business.last_invoice_b_number or "0")
            next_number = last_number + 1
            business.last_invoice_b_number = str(next_number).zfill(8)

        # 10. Descuento general:
        # Si el frontend envía 0, se respeta 0 (sin descuento).
        # Si envía otro valor, se usa exactamente ese valor.
        final_discount = Decimal(str(general_discount or Decimal("0")))

        # 11. Construir notas con los comprobantes origen
        source_numbers = ", ".join(
            f"{'COT' if q.voucher_type == VoucherType.QUOTATION else 'REM'} {q.full_number}"
            for q in source_vouchers
        )
        strategy_note = (
            "precios históricos del comprobante"
            if price_strategy == "historical"
            else "precios vigentes del catálogo"
        )
        invoice_notes = (
            f"Facturado desde comprobantes: {source_numbers}"
            f" | Estrategia de precio: {price_strategy} ({strategy_note})"
        )
        if invoice_client.id != source_client.id:
            invoice_notes += (
                f" | Cliente origen: {source_client.name}"
                f" | Facturado a: {invoice_client.name}"
            )

        # 12. Crear la factura
        invoice = Voucher(
            business_id=business_id,
            client_id=invoice_client.id,
            created_by=user_id,
            voucher_type=invoice_type,
            status=VoucherStatus.CONFIRMED,
            sale_point=business.sale_point or "0001",
            number=str(next_number).zfill(8),
            date=date_type.today(),
            notes=invoice_notes,
            show_prices="S",
            general_discount=final_discount,
        )

        # 13. Copiar TODOS los items de TODOS los comprobantes origen
        (
            items_db,
            total_subtotal,
            total_iva,
            total_final,
        ) = await self._build_invoice_items_from_source_vouchers(
            business_id=business_id,
            source_vouchers=source_vouchers,
            price_strategy=price_strategy,
            invoice_general_discount=final_discount,
            metadata_strategy="source",
        )

        # 14. Asignar totales
        invoice.subtotal = total_subtotal
        invoice.iva_amount = total_iva
        invoice.total = total_final

        # 15. Guardar factura
        self.db.add(invoice)
        await self.db.flush()

        for item in items_db:
            item.voucher_id = invoice.id
            self.db.add(item)

        # 16. Crear pagos
        await self._create_voucher_payments(
            voucher_id=invoice.id,
            business_id=business_id,
            payments=payments,
            total_expected=invoice.total,
            require_payments=True,
        )

        # 17. Marcar TODOS los comprobantes origen como facturados
        for source_voucher in source_vouchers:
            source_voucher.invoiced_voucher_id = invoice.id

        await self.db.commit()
        await self.db.refresh(invoice)

        return await self.get_by_id(invoice.id, business_id)

    async def create_credit_note(
        self,
        business_id: UUID,
        original_voucher_id: UUID,
        reason: str,
        items_data: List[Dict[str, Any]],
        user_id: UUID,
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
                Voucher.id == original_voucher_id, Voucher.business_id == business_id
            )
        )
        original_voucher = result.scalar_one_or_none()

        if not original_voucher:
            raise ValueError("Factura original no encontrada")

        # Validar que sea una factura (no cotización ni remito)
        if original_voucher.voucher_type not in [
            VoucherType.INVOICE_A,
            VoucherType.INVOICE_B,
            VoucherType.INVOICE_C,
        ]:
            raise ValueError("Solo se pueden crear Notas de Crédito de facturas")

        # Validar que tenga CAE (esté emitida)
        if not original_voucher.cae:
            raise ValueError(
                "La factura original no tiene CAE. Debe estar emitida en AFIP"
            )

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
                (
                    i
                    for i in original_voucher.items
                    if str(i.product_id) == str(item_data["product_id"])
                ),
                None,
            )
            if not original_item:
                raise ValueError(
                    f"El producto {item_data['product_id']} no está en la factura original"
                )

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

    async def get_source_quotations(
        self,
        invoice_id: UUID,
        business_id: UUID,
    ) -> List[Dict[str, Any]]:
        """
        Lista los comprobantes origen (cotizaciones/remitos) de una factura.

        Busca cotizaciones/remitos cuyo `invoiced_voucher_id` apunta a la factura,
        ordenadas por fecha.
        """
        from app.schemas.voucher import SourceQuotationResponse

        query = (
            select(Voucher)
            .options(selectinload(Voucher.client), selectinload(Voucher.items))
            .where(
                Voucher.business_id == business_id,
                Voucher.deleted_at.is_(None),
                Voucher.voucher_type.in_([VoucherType.QUOTATION, VoucherType.RECEIPT]),
                Voucher.invoiced_voucher_id == invoice_id,
            )
            .order_by(Voucher.date)
        )
        result = await self.db.execute(query)
        vouchers = result.scalars().all()
        return [
            SourceQuotationResponse(
                id=v.id,
                voucher_type=v.voucher_type,
                code=v.full_number,
                date=v.date,
                client_name=v.client.name if v.client else "",
                total=v.total or Decimal("0"),
                item_count=len(v.items) if v.items else 0,
            ).model_dump()
            for v in vouchers
        ]
