"""
Servicio de Comprobantes.
Maneja la creación de ventas, cálculo de totales y generación de PDF.
"""
from __future__ import annotations

import builtins
import logging
from datetime import date as date_type, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import Integer, and_, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.authorization import AuthorizationRequest, AuthorizationStatus, AuthorizationType
from app.models.business import Business
from app.models.cash_register import CashMovement, CashMovementType, CashPaymentMethod
from app.models.client import Client
from app.models.client_account import ClientAccount, MovementType
from app.models.client_authorization import ClientAuthorization
from app.models.payment_method import PaymentMethodCatalog
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.models.voucher import Voucher, VoucherStatus, VoucherType
from app.models.voucher_item import VoucherItem
from app.models.voucher_payment import VoucherPayment
from app.models.stockpile import Stockpile, StockpilePriceSnapshot, StockpileStatus
from app.schemas.voucher import (
    CurrentAccountCloseHistoryResponse,
    CurrentAccountCloseItemPreview,
    CurrentAccountClosePreviewResponse,
    CurrentAccountClosureHistoryItem,
    CurrentAccountClosureReceiptSummary,
    VoucherCreate,
    VoucherUpdate,
)
from app.services.pdf_service import pdf_service
from app.services.product_lot_service import ProductLotService


logger = logging.getLogger("uvicorn")


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

    @staticmethod
    def _ensure_current_account_feature_enabled(business: Business) -> None:
        """Bloquea Cuenta Corriente si el CMS la deshabilitó para el tenant."""
        if (business.current_account_mode or "disabled") == "disabled":
            raise ValueError(
                "Cuenta Corriente está deshabilitada para este negocio desde el CMS"
            )

    async def _get_open_current_account_total(
        self,
        business_id: UUID,
        billing_client_id: UUID,
        operating_client_id: UUID | None = None,
    ) -> Decimal:
        """Suma deuda abierta de remitos en cuenta corriente no facturados."""
        conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type == VoucherType.RECEIPT,
            or_(
                Voucher.is_current_account.is_(True),
                Voucher.billing_client_id.is_not(None),
            ),
            or_(
                Voucher.billing_client_id == billing_client_id,
                and_(
                    Voucher.billing_client_id.is_(None),
                    Voucher.client_id == billing_client_id,
                ),
            ),
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
    ) -> dict[str, UUID | None]:
        """Valida reglas CC para remitos y facturas, retorna IDs normalizados."""
        # Permitir cuenta corriente para remitos y facturas
        if data.is_current_account:
            # Para facturas, verificar que tenga payment_days
            if data.voucher_type in (VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C):
                if not data.payment_days:
                    raise ValueError("Las facturas en cuenta corriente deben tener días de plazo de pago")
        
        if not data.is_current_account:
            return {
                "billing_client_id": None,
                "operating_client_id": None,
            }

        # Para facturas CC, usar client_id si no hay billing_client_id
        if not data.billing_client_id:
            if data.voucher_type in (VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C):
                data.billing_client_id = data.client_id
            else:
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

        authorization: ClientAuthorization | None = None
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
        payments: list[dict[str, Any]] | None,
        total_expected: Decimal,
        *,
        require_payments: bool = False,
        cash_register_id: UUID | None = None,
        user_id: UUID | None = None,
        voucher_full_number: str = "",
    ) -> None:
        """Valida y crea los pagos asociados a un comprobante.

        También crea los movimientos de caja automáticamente si hay caja abierta.
        """

        # Mapear códigos de PaymentMethodCatalog a CashPaymentMethod
        CASH_METHOD_MAP = {
            "CASH": CashPaymentMethod.CASH,
            "DEBIT": CashPaymentMethod.CARD,
            "CREDIT": CashPaymentMethod.CARD,
            "TRANSFER": CashPaymentMethod.TRANSFER,
            "CHECK": CashPaymentMethod.CHECK,
            "MERCADOPAGO": CashPaymentMethod.OTHER,
            "OTHER": CashPaymentMethod.OTHER,
        }

        def _map_payment_method(code: str) -> CashPaymentMethod:
            """Mappea el código del método de pago al enum de caja."""
            code_upper = code.upper() if code else "OTHER"
            return CASH_METHOD_MAP.get(code_upper, CashPaymentMethod.OTHER)

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

            # Crear movimiento de caja automáticamente si hay caja abierta
            if cash_register_id and user_id:
                cash_method = _map_payment_method(payment_method.code)
                self.db.add(
                    CashMovement(
                        cash_register_id=cash_register_id,
                        type=CashMovementType.SALE,
                        payment_method=cash_method,
                        amount=Decimal(str(payment_data["amount"])),
                        description=f"{voucher_full_number} - {payment_method.name}",
                        voucher_id=voucher_id,
                        created_by=user_id,
                    )
                )

    async def _build_items_and_totals(
        self,
        business_id: UUID,
        items_data,
        general_discount: Decimal,
        voucher_type: VoucherType,
        user_id: UUID | None = None,
        voucher_id: UUID | None = None,
        stockpile_id: UUID | None = None,
    ) -> tuple[list[VoucherItem], Decimal, Decimal, Decimal]:
        """Construye items del comprobante y recalcula totales.

        Si se provee user_id, los consumos FIFO se registran con
        atribución de usuario y persistencia de LotConsumption.
        Si se provee voucher_id, se asigna a los VoucherItem antes
        del flush para respetar la constraint NOT NULL.
        Si se provee stockpile_id, para acopios por monto los precios
        se resuelven desde StockpilePriceSnapshot (precios congelados).
        """
        total_subtotal = Decimal(0)
        total_iva = Decimal(0)
        total_final = Decimal(0)
        general_discount_factor = Decimal("1") - (general_discount / Decimal("100"))

        # Para acopios por monto: precargar snapshots si hay stockpile_id
        snapshot_map: dict[UUID, StockpilePriceSnapshot] = {}
        if stockpile_id:
            # Cargar snapshots si existen (acopios por monto)
            snap_result = await self.db.execute(
                select(StockpilePriceSnapshot).where(
                    StockpilePriceSnapshot.stockpile_id == stockpile_id,
                    StockpilePriceSnapshot.deleted_at.is_(None),
                )
            )
            for sp in snap_result.scalars().all():
                snapshot_map[sp.product_id] = sp

        items_db: list[VoucherItem] = []
        for i, item_data in enumerate(items_data):
            product = await self.db.get(Product, item_data.product_id)
            if not product or product.business_id != business_id:
                raise ValueError(f"Producto {item_data.product_id} no encontrado")

            # Resolver precio desde snapshot (acopio por monto) o desde catálogo
            if stockpile_id and product.id in snapshot_map:
                sp = snapshot_map[product.id]
                unit_price = sp.price_without_iva
                iva_rate = sp.iva_rate
            else:
                unit_price = item_data.unit_price if item_data.unit_price else product.net_price
                iva_rate = product.iva_rate or Decimal("21")
                # Log warning for legacy amount stockpiles without snapshot
                if stockpile_id and unit_price == product.net_price:
                    logger.warning(
                        f"No snapshot for stockpile {stockpile_id}, "
                        f"product {item_data.product_id}: using catalog price"
                    )

            item_discount_factor = Decimal("1") - (item_data.discount_percent / Decimal("100"))
            subtotal_line = (
                unit_price
                * item_data.quantity
                * item_discount_factor
                * general_discount_factor
            )
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
            if voucher_id:
                voucher_item.voucher_id = voucher_id
            items_db.append(voucher_item)

            if voucher_type == VoucherType.QUOTATION:
                # Las cotizaciones no modifican stock ni generan consumos FIFO.
                self.db.add(voucher_item)
                continue

            lot_service = ProductLotService(self.db)
            qty = int(item_data.quantity)

            # Flushear el item para obtener su ID antes de fifo_consume
            self.db.add(voucher_item)
            await self.db.flush()

            if qty > 0:
                # Determinar razón según tipo de comprobante
                if voucher_type in (
                    VoucherType.INVOICE_A,
                    VoucherType.INVOICE_B,
                    VoucherType.INVOICE_C,
                ):
                    reason = "Factura"
                elif voucher_type == VoucherType.RECEIPT:
                    reason = "Remito"
                else:
                    reason = "Venta"

                last_lot_id, _consumptions = await lot_service.fifo_consume(
                    product_id=product.id,
                    business_id=business_id,
                    quantity=qty,
                    voucher_item_id=voucher_item.id,
                    user_id=user_id,
                    reason=reason,
                )
                voucher_item.product_lot_id = last_lot_id
            elif qty < 0:
                # Devolución: crear nuevo lote con la mercadería devuelta
                from datetime import date as date_type
                return_lot = ProductLot(
                    product_id=product.id,
                    business_id=business_id,
                    quantity=abs(qty),
                    initial_quantity=abs(qty),
                    received_date=date_type.today(),
                )
                self.db.add(return_lot)
                await self.db.flush()
                voucher_item.product_lot_id = return_lot.id

        return items_db, total_subtotal, total_iva, total_final

    async def _validate_stockpile_returns(
        self,
        *,
        stockpile_id: UUID,
        business_id: UUID,
        items_data,
    ) -> None:
        """Valida que las devoluciones de acopio sean sobre productos retirados.

        Solo permite cantidades negativas para productos previamente retirados en
        remitos hijos del mismo acopio. La cantidad devuelta no puede superar la
        cantidad neta retirada (retiros positivos menos devoluciones previas).
        """
        return_items = [
            item for item in items_data if Decimal(str(item.quantity)) < Decimal("0")
        ]
        if not return_items:
            return

        for item in return_items:
            result = await self.db.execute(
                select(VoucherItem.quantity)
                .join(Voucher, Voucher.id == VoucherItem.voucher_id)
                .where(
                    Voucher.business_id == business_id,
                    Voucher.stockpile_id == stockpile_id,
                    Voucher.deleted_at.is_(None),
                    VoucherItem.product_id == item.product_id,
                )
            )
            net_withdrawn = sum(
                (Decimal(str(quantity)) for quantity in result.scalars().all()),
                Decimal("0"),
            )
            return_quantity = abs(Decimal(str(item.quantity)))

            if net_withdrawn <= Decimal("0"):
                raise ValueError(
                    "No se puede devolver un producto que no fue retirado de este acopio"
                )
            if return_quantity > net_withdrawn:
                raise ValueError(
                    f"La devolución supera lo retirado para este producto. Disponible para devolver: {net_withdrawn:g}"
                )

    async def preview_totals(
        self,
        business_id: UUID,
        items_data,
        general_discount: Decimal,
    ) -> tuple[Decimal, Decimal, Decimal]:
        """Calcula totales con la misma lógica de backend sin efectos colaterales.

        Importante: NO descuenta stock ni persiste nada.
        """
        total_subtotal = Decimal(0)
        total_iva = Decimal(0)
        total_final = Decimal(0)
        general_discount_factor = Decimal("1") - (general_discount / Decimal("100"))

        for item_data in items_data:
            product = await self.db.get(Product, item_data.product_id)
            if not product or product.business_id != business_id:
                raise ValueError(f"Producto {item_data.product_id} no encontrado")

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

            subtotal_line = self._round_money(subtotal_line)
            iva_line = self._round_money(iva_line)
            total_line = self._round_money(total_line)

            total_subtotal += subtotal_line
            total_iva += iva_line
            total_final += total_line

        return (
            self._round_money(total_subtotal),
            self._round_money(total_iva),
            self._round_money(total_final),
        )

    async def register_customer_credit_return(
        self,
        *,
        business_id: UUID,
        client_id: UUID,
        items_data,
        general_discount: Decimal,
        movement_date: date_type,
        user_id: UUID,
        notes: str | None = None,
    ) -> dict[str, Decimal | UUID | str]:
        """Registra una devolución cuyo neto queda a favor del cliente.

        Esta operación NO emite factura negativa. Aplica el impacto de stock de
        los renglones y, si el total neto es negativo, crea un movimiento auditado
        en cuenta corriente como crédito/saldo a favor del cliente.
        """
        client = await self._get_client_or_raise(client_id, business_id)
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        previous_balance = Decimal(str(client.current_balance or Decimal("0")))

        last_number = int(business.last_receipt_number or "0")
        next_number = last_number + 1
        business.last_receipt_number = str(next_number).zfill(8)

        return_receipt = Voucher(
            business_id=business_id,
            client_id=client.id,
            created_by=user_id,
            voucher_type=VoucherType.RECEIPT,
            status=VoucherStatus.CONFIRMED,
            sale_point=business.sale_point or "0001",
            number=str(next_number).zfill(8),
            date=movement_date,
            notes=notes or "Remito de devolución con saldo a favor del cliente",
            show_prices="S",
            general_discount=general_discount,
            is_return_receipt=True,
        )

        # Flushear el receipt primero para obtener su ID antes
        # de construir los items (necesitan voucher_id para el flush)
        self.db.add(return_receipt)
        await self.db.flush()

        (
            items_db,
            total_subtotal,
            total_iva,
            total_final,
        ) = await self._build_items_and_totals(
            business_id=business_id,
            items_data=items_data,
            general_discount=general_discount,
            voucher_type=VoucherType.RECEIPT,
            user_id=user_id,
            voucher_id=return_receipt.id,
        )

        # Asignar totales ahora que los calculamos
        return_receipt.subtotal = total_subtotal
        return_receipt.iva_amount = total_iva
        return_receipt.total = total_final

        if total_final > Decimal("0"):
            await self.db.rollback()
            raise ValueError(
                "El total de la operación es positivo. Debe emitirse un comprobante de venta normal."
            )

        credit_amount = abs(total_final)
        new_balance = previous_balance - credit_amount
        client.current_balance = new_balance

        # Los items ya fueron flusheados dentro de _build_items_and_totals
        # con voucher_id asignado.

        if credit_amount > Decimal("0"):
            description = "Saldo a favor por devolución excedente en ventas"
            if notes:
                description = f"{description}: {notes[:180]}"

            self.db.add(
                ClientAccount(
                    client_id=client.id,
                    voucher_id=return_receipt.id,
                    payment_id=None,
                    date=movement_date,
                    movement_type=MovementType.ADJUSTMENT_CREDIT,
                    description=description,
                    debit=Decimal("0"),
                    credit=credit_amount,
                    balance=new_balance,
                )
            )

        await self.db.commit()
        await self.db.refresh(client)

        return {
            "client_id": client.id,
            "return_receipt_id": return_receipt.id,
            "return_receipt_number": return_receipt.full_number,
            "credit_amount": self._round_money(credit_amount),
            "previous_balance": self._round_money(previous_balance),
            "new_balance": self._round_money(new_balance),
            "subtotal": total_subtotal,
            "iva_amount": total_iva,
            "total": total_final,
            "message": (
                "Saldo a favor registrado correctamente"
                if credit_amount > Decimal("0")
                else "Devolución registrada sin saldo a favor"
            ),
        }

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
        source_vouchers: list[Voucher],
        price_strategy: Literal["historical", "current"],
        invoice_general_discount: Decimal,
        metadata_strategy: Literal["source", "product"],
        voucher_id: UUID | None = None,
        user_id: UUID | None = None,
        reason: str = "Factura",
    ) -> tuple[list[VoucherItem], Decimal, Decimal, Decimal]:
        """Construye ítems/totales de factura desde comprobantes origen.

        Si se provee voucher_id y user_id, los VoucherItem se flushean
        con el ID de la factura y los consumos FIFO se registran con
        atribución de usuario (LotConsumption).
        """
        total_subtotal = Decimal("0")
        total_iva = Decimal("0")
        total_final = Decimal("0")
        items_db: list[VoucherItem] = []
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

                voucher_item = VoucherItem(
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
                if voucher_id:
                    voucher_item.voucher_id = voucher_id
                items_db.append(voucher_item)
                line_number += 1

                # Las facturas descuentan stock
                lot_service = ProductLotService(self.db)
                qty = int(source_item.quantity)
                if qty > 0:
                    self.db.add(voucher_item)
                    await self.db.flush()

                    last_lot_id, consumptions = await lot_service.fifo_consume(
                        product_id=product.id,
                        business_id=business_id,
                        quantity=qty,
                        voucher_item_id=voucher_item.id,
                        user_id=user_id,
                        reason=reason,
                    )
                    voucher_item.product_lot_id = last_lot_id
                elif qty < 0:
                    self.db.add(voucher_item)
                    await self.db.flush()

                    from datetime import date as date_type
                    return_lot = ProductLot(
                        product_id=product.id,
                        business_id=business_id,
                        quantity=abs(qty),
                        initial_quantity=abs(qty),
                        received_date=date_type.today(),
                    )
                    self.db.add(return_lot)
                    await self.db.flush()
                    voucher_item.product_lot_id = return_lot.id

        return (
            items_db,
            self._round_money(total_subtotal),
            self._round_money(total_iva),
            self._round_money(total_final),
        )

    async def create(
        self, business_id: UUID, data: VoucherCreate, user_id: UUID,
        cash_register_id: UUID | None = None,
    ) -> Voucher:
        """Crea un nuevo comprobante."""

        # 1. Obtener cliente principal de comprobante
        client = await self._get_client_or_raise(data.client_id, business_id)

        # 2. Ajustar automáticamente el tipo de factura según condición fiscal del cliente
        # Si cliente es Responsable Inscripto → Factura A
        # Si cliente es Consumidor Final, Monotributista, Exento → Factura B
        if data.voucher_type in (VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C):
            client_tax_condition = (client.tax_condition or "").lower().strip()
            is_responsible = client_tax_condition in ["responsable inscripto", "ri", "responsable"]
            
            if is_responsible and data.voucher_type == VoucherType.INVOICE_B:
                data.voucher_type = VoucherType.INVOICE_A
            elif not is_responsible and data.voucher_type == VoucherType.INVOICE_A:
                data.voucher_type = VoucherType.INVOICE_B

        # 3. Obtener business para numeración correlativa
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        # Validar SRX: solo permitir INVOICE_X si srx_enabled está activo
        if data.voucher_type == VoucherType.INVOICE_X and not getattr(business, "srx_enabled", False):
            raise ValueError(
                "Comprobante X no habilitado para este negocio. Activá SRX desde CMS o Configuración."
            )

        if (
            data.voucher_type == VoucherType.RECEIPT
            and data.is_current_account
            and any(Decimal(str(item.quantity)) < Decimal("0") for item in data.items)
        ):
            raise ValueError(
                "Las devoluciones no se pueden registrar desde Cta Cte. Usá el flujo de Factura."
            )

        if data.is_current_account:
            self._ensure_current_account_feature_enabled(business)

        # 4. Obtener siguiente número según tipo
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
        elif voucher_type_str == "invoice_x":
            last_number = int(business.last_invoice_x_number or "0")
            next_number = last_number + 1
            business.last_invoice_x_number = str(next_number).zfill(8)
        else:
            next_number = 1

        if data.voucher_type == VoucherType.INVOICE_X:
            voucher_sale_point = business.alternative_sale_point or "5001"
        elif data.voucher_type in (
            VoucherType.INVOICE_A,
            VoucherType.INVOICE_B,
            VoucherType.INVOICE_C,
        ):
            voucher_sale_point = (
                business.electronic_sale_point or business.sale_point or "0001"
            )
        else:
            voucher_sale_point = business.sale_point or "0001"

        voucher = Voucher(
            business_id=business_id,
            client_id=data.client_id,
            created_by=user_id,
            voucher_type=data.voucher_type,
            status=VoucherStatus.CONFIRMED,
            sale_point=voucher_sale_point,
            number=str(next_number).zfill(8),
            date=data.date,
            notes=data.notes,
            show_prices="S" if data.show_prices else "N",
            general_discount=data.general_discount,
        )

        # Flushear el voucher primero para obtener su ID antes
        # de construir los items (necesitan voucher_id para el flush)
        self.db.add(voucher)
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
            voucher_type=data.voucher_type,
            user_id=user_id,
            voucher_id=voucher.id,
            stockpile_id=data.stockpile_id,
        )

        # Asignar totales al voucher
        voucher.subtotal = total_subtotal
        voucher.iva_amount = total_iva
        voucher.total = total_final

        if data.voucher_type in {
            VoucherType.INVOICE_A,
            VoucherType.INVOICE_B,
            VoucherType.INVOICE_C,
        } and total_final <= Decimal("0"):
            await self.db.rollback()
            raise ValueError(
                "El total de la factura debe ser mayor a $0. Si la devolución supera la venta, registre el saldo a favor del cliente."
            )

        if (
            data.voucher_type == VoucherType.RECEIPT
            and data.billing_client_id
            and not data.is_current_account
        ):
            data.is_current_account = True

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
        
        # Payment days for current account (Cuenta Corriente)
        if data.payment_days and int(data.payment_days) > 0:
            voucher.payment_days = int(data.payment_days)

        # Validar y procesar stockpile_id para retiros parciales de acopio
        stockpile = None
        if data.stockpile_id and data.voucher_type == VoucherType.RECEIPT:
            has_stockpile_returns = any(
                Decimal(str(item.quantity)) < Decimal("0") for item in data.items
            )
            # Buscar el acopio
            stockpile = await self.db.get(Stockpile, data.stockpile_id)
            if not stockpile:
                raise ValueError("Acopio no encontrado")
            
            # Verificar que pertenece al mismo negocio
            if stockpile.business_id != business_id:
                raise ValueError("El acopio no pertenece a este negocio")
            
            # Verificar estado del acopio
            if stockpile.status == StockpileStatus.CANCELLED:
                raise ValueError("El acopio está cancelado")
            
            if stockpile.status == StockpileStatus.COMPLETED and not has_stockpile_returns:
                raise ValueError("El acopio ya está completado")

            if has_stockpile_returns:
                await self._validate_stockpile_returns(
                    stockpile_id=data.stockpile_id,
                    business_id=business_id,
                    items_data=data.items,
                )
            
            # Validar que el monto del remito no exceda el saldo disponible
            if total_final > stockpile.remaining_amount:
                raise ValueError(
                    f"El monto del remito (${total_final:,.2f}) excede el saldo disponible del acopio (${stockpile.remaining_amount:,.2f})"
                )
            
            # Verificar que el cliente sea compatible (mismo cliente o billing_client)
            # Para cuentas corrientes, usamos el billing_client como cliente del acopio
            effective_client_id = data.billing_client_id or data.client_id
            if stockpile.client_id != effective_client_id and stockpile.billing_client_id != effective_client_id:
                raise ValueError("El cliente del remito no coincide con el cliente del acopio")
            
            # Validar expiración si aplica
            if stockpile.expiration_mode == "due_date" and stockpile.due_date:
                from datetime import date as date_type
                if date_type.today() > stockpile.due_date:
                    raise ValueError("El acopio ha vencido")
            
            # Vincular el voucher al stockpile
            voucher.stockpile_id = data.stockpile_id

        # Los items ya fueron flusheados dentro de _build_items_and_totals
        # con voucher_id asignado. Solo queda crear pagos y relaciones.

        payments_raw = (
            [payment.model_dump() for payment in data.payments]
            if data.payments
            else None
        )
        # Solo exigir pagos si es factura Y NO es cuenta corriente
        is_invoice = data.voucher_type in {
            VoucherType.INVOICE_A,
            VoucherType.INVOICE_B,
            VoucherType.INVOICE_C,
        }
        require_payments = is_invoice and not data.is_current_account
        
        await self._create_voucher_payments(
            voucher_id=voucher.id,
            business_id=business_id,
            payments=payments_raw,
            total_expected=total_final,
            require_payments=require_payments,
            cash_register_id=cash_register_id,
            user_id=user_id,
            voucher_full_number=voucher.full_number,
        )

        # Actualizar montos del acopio si es un retiro parcial
        if stockpile:
            stockpile.withdrawn_amount = (stockpile.withdrawn_amount or Decimal("0")) + total_final
            stockpile.remaining_amount = (stockpile.remaining_amount or Decimal("0")) - total_final
            
            # Actualizar estado del stockpile
            if stockpile.remaining_amount <= Decimal("0"):
                stockpile.status = StockpileStatus.COMPLETED
                from datetime import datetime
                stockpile.completed_at = datetime.utcnow()
            elif stockpile.remaining_amount > Decimal("0"):
                stockpile.status = StockpileStatus.PARTIAL
                stockpile.completed_at = None

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

    async def get_by_id(self, voucher_id: UUID, business_id: UUID) -> Voucher | None:
        """Obtiene un comprobante por ID con todas sus relaciones."""
        query = (
            select(Voucher)
            .options(
                selectinload(Voucher.items),
                selectinload(Voucher.business),
                selectinload(Voucher.client),
                selectinload(Voucher.billing_client),
                selectinload(Voucher.operating_client),
                selectinload(Voucher.created_by_user),
                selectinload(Voucher.child_stockpiles),
                selectinload(Voucher.principal_stockpile).selectinload(
                    Stockpile.principal_voucher
                ),
            )
            .where(Voucher.id == voucher_id, Voucher.business_id == business_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_code(
        self, code: str, business_id: UUID
    ) -> Voucher | None:
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
                selectinload(Voucher.created_by_user),
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
        search: str | None = None,
        voucher_type: VoucherType | None = None,
        status: VoucherStatus | None = None,
        payment_method_id: UUID | None = None,
        is_current_account: bool | None = None,
        current_account_status: str | None = None,
        date_from: date_type | None = None,
        date_to: date_type | None = None,
        include_current_account: bool = True,
    ) -> tuple[list[Voucher], int]:
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

        if is_current_account is not None:
            base_conditions.append(Voucher.is_current_account.is_(is_current_account))
        elif not include_current_account:
            base_conditions.extend(
                [
                    Voucher.is_current_account.is_(False),
                    Voucher.is_current_account_closure.is_(False),
                ]
            )

        if current_account_status == "overdue":
            today = date_type.today()
            base_conditions.extend(
                [
                    Voucher.is_current_account.is_(True),
                    Voucher.is_paid.is_(False),
                    Voucher.payment_days.is_not(None),
                    (Voucher.date + cast(Voucher.payment_days, Integer)) < today,
                ]
            )

        if date_from:
            base_conditions.append(Voucher.date >= date_from)

        if date_to:
            base_conditions.append(Voucher.date <= date_to)

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
                selectinload(Voucher.child_stockpiles),
                selectinload(Voucher.credit_notes),  # Requerido por has_credit_note
                selectinload(Voucher.created_by_user),
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
        reason: str | None = None,
    ) -> bool:
        """Elimina un comprobante (soft delete con auditoría y reversión de efectos)."""
        voucher = await self.get_by_id(voucher_id, business_id)
        if not voucher:
            return False

        if not reason or not reason.strip():
            raise ValueError("Debe indicar un motivo de eliminación")

        # Validaciones existentes
        if voucher.is_current_account_closure:
            raise ValueError(
                "No se puede eliminar un comprobante de cierre de cuenta corriente"
            )

        if await self._is_receipt_linked_to_closure(voucher):
            raise ValueError(
                "No se puede eliminar un remito incluido en un cierre de cuenta corriente"
            )

        # ========================================
        # LÓGICA DE REVERSIÓN PARA DEVOLUCIONES
        # ========================================
        is_return_receipt = voucher.is_return_receipt

        # Verificar si es una factura que tiene devoluciones asociadas (cascade)
        is_invoice_with_returns = (
            voucher.voucher_type in [VoucherType.INVOICE_A, VoucherType.INVOICE_B, VoucherType.INVOICE_C]
            and not voucher.deleted_at
        )

        # Obtenerdevoluciones asociadas si es una factura
        return_receipts_to_delete = []
        if is_invoice_with_returns:
            # Buscar todos los remitos de devolución relacionados a esta factura
            return_receipts_to_delete = await self._get_return_receipts_for_invoice(
                voucher.id, business_id
            )

        has_returns = is_return_receipt or len(return_receipts_to_delete) > 0

        if has_returns:
            # Calcular antigüedad
            days_old = (date_type.today() - voucher.date).days
            if days_old > 7:
                raise ValueError(
                    f"No se pueden eliminar devoluciones con más de 7 días de antigüedad (esta tiene {days_old} días)"
                )

            # Verificar pagos aplicados en factura si hay devoluciones
            if is_invoice_with_returns and (voucher.is_paid or voucher.paid_amount):
                raise ValueError(
                    "No se puede eliminar: la factura tiene pagos aplicados. Primero debe revertir los pagos."
                )

            # Revertir efectos de las devoluciones
            # 1) Si es un return receipt, revertir este
            # 2) Si es una factura, revertir cada return receipt asociado
            vouchers_to_revert = [voucher] if is_return_receipt else return_receipts_to_delete

            for rev_voucher in vouchers_to_revert:
                # Revertir stock
                await self._revert_stock_from_voucher(rev_voucher)

                # Revertir saldo en cuenta corriente
                await self._revert_client_account_from_voucher(rev_voucher)

        # ========================================
        # SOFT DELETE DEL VOUCHER
        # ========================================
        voucher.soft_delete()
        voucher.deleted_by = deleted_by_user_id
        voucher.deletion_reason = reason.strip()

        await self.db.commit()
        return True

    async def _revert_stock_from_voucher(self, voucher: Voucher) -> None:
        """Revierte el stock de los items de un voucher usando lotes.

        Si VoucherItem.product_lot_id está seteado → restaura a ESE lote específico.
        Si no está seteado (legacy) → restaura al lote más reciente por received_date.
        Usa with_for_update() para row-level locking.
        """
        lot_service = ProductLotService(self.db)
        for item in voucher.items:
            if not item.product:
                continue

            qty = int(item.quantity)
            quantity_change = abs(qty)

            if item.product_lot_id:
                # Restaurar al lote específico que se consumió
                query = (
                    select(ProductLot)
                    .where(ProductLot.id == item.product_lot_id)
                    .with_for_update()
                )
                result = await self.db.execute(query)
                lot = result.scalar_one_or_none()
                if not lot:
                    continue

                if qty > 0:
                    # Item normal: devolver stock al lote
                    lot.quantity += quantity_change
                else:
                    # Item de devolución: remover el stock agregado
                    lot.quantity -= quantity_change
                    if lot.quantity < 0:
                        lot.quantity = 0
            else:
                # Legacy: restaurar al lote más reciente
                query = (
                    select(ProductLot)
                    .where(
                        ProductLot.product_id == item.product_id,
                        ProductLot.business_id == voucher.business_id,
                        ProductLot.deleted_at.is_(None),
                    )
                    .order_by(ProductLot.received_date.desc())
                    .with_for_update()
                )
                result = await self.db.execute(query)
                lot = result.scalar_one_or_none()
                if not lot:
                    continue

                if qty > 0:
                    lot.quantity += quantity_change
                else:
                    lot.quantity -= quantity_change
                    if lot.quantity < 0:
                        lot.quantity = 0

    async def _revert_client_account_from_voucher(self, voucher: Voucher) -> None:
        """Revierte el movimiento de cuenta corriente creado por una devolución."""
        # Buscar el ClientAccount asociado a este voucher
        result = await self.db.execute(
            select(ClientAccount).where(
                ClientAccount.voucher_id == voucher.id,
                ClientAccount.deleted_at.is_(None),
                ClientAccount.movement_type == MovementType.ADJUSTMENT_CREDIT,
            )
        )
        client_account = result.scalar_one_or_none()

        if client_account:
            # Soft delete del movimiento
            from datetime import datetime, timezone

            client_account.deleted_at = datetime.now(datetime.UTC)
            client_account.deleted_by = voucher.deleted_by

            # Actualizar el saldo del cliente (sumar porque al crear se restó)
            if voucher.client:
                current_balance = voucher.client.current_balance or Decimal("0")
                credit_amount = client_account.credit or Decimal("0")
                voucher.client.current_balance = current_balance + credit_amount

    async def _get_return_receipts_for_invoice(
        self, invoice_id: UUID, business_id: UUID
    ) -> list[Voucher]:
        """Obtiene todos los remitos de devolución asociados a una factura."""
        result = await self.db.execute(
            select(Voucher).where(
                Voucher.business_id == business_id,
                Voucher.related_voucher_id == invoice_id,
                Voucher.is_return_receipt == True,
                Voucher.deleted_at.is_(None),
            )
        )
        return list(result.scalars().all())

    def requires_authorization(
        self,
        voucher: Voucher,
        membership_role: str,
    ) -> tuple[bool, str]:
        """Determina si una eliminación requiere autorización de segundo usuario.

        Returns:
            tuple: (requires_authorization, reason)
        """
        # Solo para devoluciones (return receipts o facturas con devoluciones)
        is_return = voucher.is_return_receipt

        if not is_return:
            # Verificar si es factura con devoluciones asociadas
            # Esto se maneja en cascada, pero por ahora solo el return receipt directo
            return False, ""

        # Calcular antigüedad
        days_old = (date_type.today() - voucher.date).days
        amount = abs(float(voucher.total or 0))

        # Condiciones que requieren autorización:
        # 1. Monto > $100,000
        # 2. Antigüedad > 3 días
        # 3. Es eliminación en cascada (marcado externamente)

        reasons = []
        if amount > 100000:
            reasons.append(f"monto > $100,000 (actual: ${amount:,.2f})")
        if days_old > 3:
            reasons.append(f"antigüedad > 3 días ({days_old} días)")

        if reasons:
            return True, f"Se requiere autorización por: {', '.join(reasons)}"

        return False, ""

    async def create_authorization_request(
        self,
        voucher_id: UUID,
        business_id: UUID,
        requested_by_user_id: UUID,
        reason: str,
        authorization_type: AuthorizationType = AuthorizationType.VOUCHER_RETURN_DELETION,
    ) -> AuthorizationRequest:
        """Crea una solicitud de autorización para eliminar una devolución."""
        auth_request = AuthorizationRequest(
            requested_by=requested_by_user_id,
            business_id=business_id,
            authorization_type=authorization_type,
            resource_id=voucher_id,
            status=AuthorizationStatus.PENDING,
            reason=reason,
        )
        self.db.add(auth_request)
        await self.db.commit()
        await self.db.refresh(auth_request)
        return auth_request

    async def approve_authorization(
        self,
        authorization_id: UUID,
        authorized_by_user_id: UUID,
    ) -> AuthorizationRequest:
        """Aprueba una solicitud de autorización."""
        result = await self.db.execute(
            select(AuthorizationRequest).where(
                AuthorizationRequest.id == authorization_id,
                AuthorizationRequest.status == AuthorizationStatus.PENDING,
            )
        )
        auth_request = result.scalar_one_or_none()
        if not auth_request:
            raise ValueError("Solicitud de autorización no encontrada o ya resuelta")

        # Aprobar
        from datetime import datetime, timezone

        auth_request.status = AuthorizationStatus.APPROVED
        auth_request.authorized_by = authorized_by_user_id
        auth_request.resolved_at = datetime.now(datetime.UTC)

        await self.db.commit()
        await self.db.refresh(auth_request)
        return auth_request

    async def reject_authorization(
        self,
        authorization_id: UUID,
        authorized_by_user_id: UUID,
        rejection_reason: str,
    ) -> AuthorizationRequest:
        """Rechaza una solicitud de autorización."""
        result = await self.db.execute(
            select(AuthorizationRequest).where(
                AuthorizationRequest.id == authorization_id,
                AuthorizationRequest.status == AuthorizationStatus.PENDING,
            )
        )
        auth_request = result.scalar_one_or_none()
        if not auth_request:
            raise ValueError("Solicitud de autorización no encontrada o ya resuelta")

        # Rechazar
        from datetime import datetime, timezone

        auth_request.status = AuthorizationStatus.REJECTED
        auth_request.authorized_by = authorized_by_user_id
        auth_request.rejection_reason = rejection_reason
        auth_request.resolved_at = datetime.now(datetime.UTC)

        await self.db.commit()
        await self.db.refresh(auth_request)
        return auth_request

    async def generate_pdf(
        self,
        voucher_id: UUID,
        business_id: UUID,
        copy_type: str = "original",
        hide_discount: bool = False,
    ) -> bytes:
        """Genera el PDF de un comprobante existente.

        Args:
            copy_type: 'original' (para el cliente) o 'duplicado' (para el comercio).
            hide_discount: Si True, recalcula items sin descuentos (solo visual).
        """
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
        # INVOICE_X no va a ARCA: es un comprobante interno sin validez fiscal
        is_arca_document = (
            (
                "invoice" in voucher.voucher_type.value
                and "invoice_x" not in voucher.voucher_type.value
                or "credit_note" in voucher.voucher_type.value
            )
            and voucher.cae
        )

        if is_arca_document:
            return self._generate_arca_pdf(voucher, letter)
        elif voucher.is_current_account_closure:
            return self._generate_closure_pdf(voucher, letter)
        else:
            return self._generate_voucher_pdf(
                voucher, letter,
                copy_type=copy_type,
                hide_discount=hide_discount,
            )

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

        arca_item_net = sum(Decimal(str(i.subtotal)) for i in voucher.items)
        arca_item_gross = arca_item_net * Decimal("1.21")
        arca_abs_total = abs(Decimal(str(voucher.total or 0)))
        if arca_item_gross > 0 and arca_abs_total < arca_item_gross - Decimal("0.01"):
            arca_discount_pct = round((1 - arca_abs_total / arca_item_gross) * Decimal("100"), 2)
        else:
            arca_discount_pct = Decimal("0")
        arca_totals = {
            "subtotal": f"{arca_item_gross:,.2f}",
            "discount": f"{arca_discount_pct:g}%",
            "iva": "21%",
            "total": f"{arca_abs_total:,.2f}",
        }

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
                # Vendedor que emitió el comprobante
                "seller": voucher.created_by_user.name if voucher.created_by_user else None,
                "seller_email": voucher.created_by_user.email if voucher.created_by_user else None,
                # Cuenta corriente
                "is_current_account": voucher.is_current_account,
                "payment_days": voucher.payment_days,
                "payment_due_date": (
                    (voucher.date + timedelta(days=int(voucher.payment_days))).strftime("%d/%m/%Y")
                    if voucher.is_current_account and voucher.payment_days
                    else None
                ),
                # Métodos de pago (para facturas no-CC) - simplificado para evitar errores async
                "payment_methods_display": "Contado" if not voucher.is_current_account else None,
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
            "totals": arca_totals,
        }

        return pdf_service.generate_invoice_arca_pdf(context)

    def _generate_closure_pdf(self, voucher, letter: str) -> bytes:
        """Genera PDF compacto de cierre de cuenta corriente (densidad tipo Orden de Pedido)."""
        # Obtener los receipts originales vinculados a este cierre
        # Un receipt tiene invoiced_voucher_id = voucher.id

        # Agrupar items por receipt
        receipts_data: list[dict[str, Any]] = []
        # Items vienen con formato: "[001-00000001] Descripción"
        # Parseamos para mostrar agrupados por receipt

        # Por cada item, extraer el número de receipt del prefijo
        items_by_receipt: dict[str, list[Any]] = {}

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

    def _generate_voucher_pdf(
        self,
        voucher,
        letter: str,
        copy_type: str = "original",
        hide_discount: bool = False,
    ) -> bytes:
        """Genera PDF de comprobante genérico (cotización, remito, SRX).

        Args:
            copy_type: 'original' (para el cliente) o 'duplicado' (para el comercio).
            hide_discount: Si True, recalcula items sin descuentos (solo visual).
        """
        # Nombre del tipo
        type_name = "COTIZACIÓN"
        if "invoice_x" in voucher.voucher_type.value:
            type_name = "COMPROBANTE X"
        elif "invoice" in voucher.voucher_type.value:
            type_name = "FACTURA"
        elif "receipt" in voucher.voucher_type.value:
            type_name = "REMITO DE DEVOLUCIÓN" if voucher.is_return_receipt else "REMITO"

        # Detectar si es un remito de acopio (retiro parcial)
        is_stockpile_receipt = bool(
            voucher.voucher_type == VoucherType.RECEIPT
            and voucher.stockpile_id
            and hasattr(voucher, 'principal_stockpile')
            and voucher.principal_stockpile is not None
        )
        
        # Para remitos de acopio, mostrar diseño especial
        acopio_info = None
        if is_stockpile_receipt:
            # Cambiar tipo a "REMITO DE ACOPIO"
            type_name = "REMITO DE ACOPIO"
            
            # Obtener info del stockpile principal
            stockpile = voucher.principal_stockpile
            if stockpile:
                principal_number = (
                    stockpile.principal_voucher.full_number
                    if stockpile.principal_voucher
                    else f"ACOP-{stockpile.id.hex[:8].upper()}"
                )
                acopio_info = {
                    "name": stockpile.name,
                    "number": principal_number,
                    "date": stockpile.created_at.strftime("%d/%m/%Y") if stockpile.created_at else "",
                    "initial_amount": f"{stockpile.initial_amount:,.2f}" if stockpile.initial_amount else "0.00",
                    "remaining_amount": f"{stockpile.remaining_amount:,.2f}" if stockpile.remaining_amount else "0.00",
                }

        is_subclient_withdrawal = bool(
            voucher.billing_client_id
            and voucher.operating_client_id
            and voucher.billing_client_id != voucher.operating_client_id
        )
        withdrawal_client_display_name = (
            voucher.withdrawal_client_name if is_subclient_withdrawal else "TITULAR"
        )

        # Para remitos de acopio, siempre mostrar precios
        show_prices = True if is_stockpile_receipt else (voucher.show_prices == "S")

        is_stockpile_principal_receipt = bool(
            voucher.voucher_type == VoucherType.RECEIPT
            and not voucher.stockpile_id
            and len(getattr(voucher, "child_stockpiles", []) or []) > 0
        )

        # Calcular subtotales de referencia
        # raw_subtotal: precio de lista (sin ningún descuento)
        # item_subtotal_sum: solo con descuentos individuales (sin desc. general)
        raw_subtotal = Decimal("0")
        item_subtotal_sum = Decimal("0")
        iva_no_discount = Decimal("0")
        for item in voucher.items:
            qty = Decimal(str(item.quantity))
            raw_subtotal += item.unit_price * qty
            # Descuento individual por item (si tiene)
            item_disc_pct = Decimal(str(item.discount_percent)) if hasattr(item, "discount_percent") and item.discount_percent else Decimal("0")
            item_subtotal_sum += item.unit_price * qty * (1 - item_disc_pct / Decimal("100"))
            # IVA sin descuentos (para modo hide_discount)
            iva_rate_item = Decimal(str(item.iva_rate)) if item.iva_rate else Decimal("21")
            iva_no_discount += abs(item.unit_price * qty) * (iva_rate_item / Decimal("100"))

        # Para notas de crédito los montos son negativos → usar absolutos
        if voucher.is_return_receipt:
            abs_raw = abs(raw_subtotal)
            abs_item_sum = abs(item_subtotal_sum)
            abs_subtotal = abs(Decimal(str(voucher.subtotal or 0)))
        else:
            abs_raw = raw_subtotal
            abs_item_sum = item_subtotal_sum
            abs_subtotal = Decimal(str(voucher.subtotal or 0))

        # Calcular % de descuento general
        if abs_item_sum > 0 and abs_subtotal < abs_item_sum:
            general_discount_pct = (1 - abs_subtotal / abs_item_sum) * Decimal("100")
            # Redondear a 2 decimales para evitar 9.99999999%
            general_discount_pct_rounded = round(general_discount_pct, 2)
        else:
            general_discount_pct_rounded = Decimal("0")

        # Usar valores almacenados en DB (calculados correctamente en _build_items_and_totals)
        abs_iva = abs(Decimal(str(voucher.iva_amount or 0)))
        abs_total = abs(Decimal(str(voucher.total or 0)))

        if hide_discount:
            # Modo ORIGINAL "sin descuento": precios completos, ni individual ni general
            items_context = [
                {
                    "code": item.code,
                    "description": item.description,
                    "quantity": f"{item.quantity:g}",
                    "unit_price": f"{item.unit_price:,.2f}",
                    "discount": "0",
                    "subtotal": f"{item.unit_price * item.quantity:,.2f}",
                    "is_return_item": Decimal(str(item.quantity)) < Decimal("0"),
                }
                for item in voucher.items
            ]
        else:
            # Modo DUPLICADO "con descuento": desc. individual en items, el general va en totales
            items_context = [
                {
                    "code": item.code,
                    "description": item.description,
                    "quantity": f"{item.quantity:g}",
                    "unit_price": f"{item.unit_price:,.2f}",
                    "discount": f"{item.discount_percent:g}"
                    if hasattr(item, "discount_percent") and item.discount_percent
                    else "0",
                    "subtotal": f"{item.unit_price * Decimal(str(item.quantity)) * (1 - (Decimal(str(item.discount_percent)) if hasattr(item, 'discount_percent') and item.discount_percent else Decimal('0')) / Decimal('100')):,.2f}",
                    "is_return_item": Decimal(str(item.quantity)) < Decimal("0"),
                }
                for item in voucher.items
            ]

        if is_stockpile_principal_receipt and not items_context:
            linked_stockpile = (voucher.child_stockpiles or [None])[0]
            stockpile_code = (
                linked_stockpile.stockpile_number
                if linked_stockpile and linked_stockpile.stockpile_number
                else f"ACOP-{voucher.id.hex[:8].upper()}"
            )
            stockpile_description = (
                linked_stockpile.description
                if linked_stockpile and linked_stockpile.description
                else (linked_stockpile.name if linked_stockpile else None)
            )
            if not stockpile_description:
                stockpile_description = (
                    voucher.notes or "Remito principal de acopio"
                )

            items_context = [
                {
                    "code": stockpile_code,
                    "description": stockpile_description,
                    "quantity": "1",
                    "unit_price": f"{Decimal(str(voucher.total or 0)):,.2f}",
                    "discount": "0",
                    "subtotal": f"{Decimal(str(voucher.total or 0)):,.2f}",
                    "is_return_item": False,
                }
            ]

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
                "name": voucher.client.name if voucher.client else "Consumidor Final",
                "document_type": voucher.client.document_type if voucher.client else "",
                "document_number": voucher.client.document_number if voucher.client else "",
                "address": (
                    f"{voucher.client.street or ''} {voucher.client.street_number or ''}".strip()
                    if voucher.client
                    else ""
                ),
                "city": voucher.client.city if voucher.client and voucher.client.city else "",
                "tax_condition": voucher.client.tax_condition if voucher.client else "",
                "phone": voucher.client.phone if voucher.client and voucher.client.phone else "",
            },
            "voucher": {
                "letter": letter,
                "code_type": "000",
                "type_name": type_name,
                "sale_point": voucher.sale_point,
                "comp_number": voucher.number,
                "number": f"{voucher.sale_point}-{voucher.number}",
                "date": voucher.date.strftime("%d/%m/%Y"),
                "show_prices": show_prices,
                "is_current_account": bool(voucher.is_current_account),
                "is_return_receipt": bool(voucher.is_return_receipt),
                "is_stockpile_receipt": is_stockpile_receipt,
                "acopio_info": acopio_info,
                "customer_credit_amount": f"{abs(Decimal(str(voucher.total or 0))):,.2f}",
                "is_withdrawal_authorized": bool(voucher.is_withdrawal_authorized),
                "withdrawal_client_name": voucher.withdrawal_client_name,
                "withdrawal_client_display_name": withdrawal_client_display_name,
                "is_subclient_withdrawal": is_subclient_withdrawal,
                "cae": voucher.cae,
                "cae_due_date": voucher.cae_expiration.strftime("%d/%m/%Y")
                if voucher.cae_expiration
                else None,
                "qr_data": voucher.qr_data if hasattr(voucher, "qr_data") else None,
                # Vendedor que emitió el comprobante
                "seller": voucher.created_by_user.name if voucher.created_by_user else None,
                "seller_email": voucher.created_by_user.email if voucher.created_by_user else None,
            },
            "items": items_context,
            "totals": (
                {
                    "subtotal": f"{abs_raw:,.2f}",
                    "discount": "0%",
                    "iva": "21%",
                    "total": f"{abs_raw + iva_no_discount:,.2f}",
                }
                if hide_discount
                else {
                    "subtotal": f"{abs_item_sum:,.2f}",
                    "discount": f"{general_discount_pct_rounded:g}%",
                    "iva": "21%",
                    "total": f"{abs_total:,.2f}",
                }
            ),
            "copy": {
                "type": copy_type,
                "hide_discount": hide_discount,
                "label": "DUPLICADO - Para el comercio" if copy_type == "duplicado" else "ORIGINAL - Para el cliente",
            },
        }

        if type_name == "COMPROBANTE X":
            return pdf_service.generate_comprobante_x_pdf(context)
        return pdf_service.generate_voucher_pdf(context)

    async def list_pending_quotations(
        self,
        business_id: UUID,
        page: int = 1,
        per_page: int = 100,
        search: str | None = None,
        voucher_type: VoucherType | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        include_current_account: bool = True,
    ) -> tuple[builtins.list[Voucher], int]:
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
            Voucher.is_return_receipt.is_(False),
            Voucher.deleted_at.is_(None),
        ]

        if not include_current_account:
            base_conditions.extend(
                [
                    Voucher.is_current_account.is_(False),
                    Voucher.is_current_account_closure.is_(False),
                ]
            )

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
                selectinload(Voucher.created_by_user),
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
        billing_client_id: UUID | None = None,
        pending_only: bool | None = None,
        search: str | None = None,
    ) -> tuple[builtins.list[Voucher], int]:
        """Lista remitos de cuenta corriente para control/cierre."""
        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type == VoucherType.RECEIPT,
            or_(
                Voucher.is_current_account.is_(True),
                Voucher.billing_client_id.is_not(None),
            ),
            Voucher.deleted_at.is_(None),
        ]

        if billing_client_id:
            base_conditions.append(
                or_(
                    Voucher.billing_client_id == billing_client_id,
                    and_(
                        Voucher.billing_client_id.is_(None),
                        Voucher.client_id == billing_client_id,
                    ),
                )
            )

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
        receipt_ids: builtins.list[UUID] | None,
        close_all: bool,
        notes: str | None,
    ) -> CurrentAccountClosePreviewResponse:
        """
        Previsualiza un cierre de cuenta corriente SIN persistir nada.
        Calcula totales y items que tendría el comprobante de cierre.
        """
        billing_client = await self._get_client_or_raise(billing_client_id, business_id)

        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type == VoucherType.RECEIPT,
            or_(
                Voucher.is_current_account.is_(True),
                Voucher.billing_client_id.is_not(None),
            ),
            or_(
                Voucher.billing_client_id == billing_client_id,
                and_(
                    Voucher.billing_client_id.is_(None),
                    Voucher.client_id == billing_client_id,
                ),
            ),
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
                selectinload(Voucher.created_by_user),
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
        items: list[CurrentAccountCloseItemPreview] = []
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
general_discount=general_discount,
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
        receipt_ids: builtins.list[UUID] | None,
        close_all: bool,
        notes: str | None,
        user_id: UUID,
    ) -> Voucher:
        """Cierra una cuenta corriente creando cotización consolidada pendiente de facturar."""
        billing_client = await self._get_client_or_raise(billing_client_id, business_id)

        base_conditions = [
            Voucher.business_id == business_id,
            Voucher.voucher_type == VoucherType.RECEIPT,
            or_(
                Voucher.is_current_account.is_(True),
                Voucher.billing_client_id.is_not(None),
            ),
            or_(
                Voucher.billing_client_id == billing_client_id,
                and_(
                    Voucher.billing_client_id.is_(None),
                    Voucher.client_id == billing_client_id,
                ),
            ),
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

        self._ensure_current_account_feature_enabled(business)

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
                selectinload(Voucher.created_by_user),
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
        closure_items: list[CurrentAccountClosureHistoryItem] = []

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

            receipt_summaries: list[CurrentAccountClosureReceiptSummary] = []
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
        payments: builtins.list[dict[str, Any]] | None,
        fiscal_client_id: UUID | None,
        user_id: UUID,
        is_current_account: bool = False,
        payment_days: int | None = None,
        price_strategy: Literal["historical", "current"] = "historical",
        cash_register_id: UUID | None = None,
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
            payments: Métodos de pago (requerido salvo factura en cuenta corriente)
            fiscal_client_id: Cliente fiscal final (opcional)
            is_current_account: Si la factura queda pendiente de pago en cuenta corriente
            payment_days: Plazo de pago en días para cuenta corriente
            price_strategy: Estrategia de precios ('historical' | 'current')
            user_id: ID del usuario que realiza la conversión
            cash_register_id: ID de la caja abierta (para registrar movimientos)

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

        if is_current_account and not payment_days:
            raise ValueError("Debe indicar los días de plazo para la factura en cuenta corriente")

        # 3. Obtener business para numeración
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        if is_current_account:
            self._ensure_current_account_feature_enabled(business)

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
            is_current_account=is_current_account,
            payment_days=payment_days if is_current_account else None,
            is_paid=not is_current_account,
            paid_amount=None if is_current_account else Decimal("0"),
        )

        # Flushear la factura primero para obtener su ID antes
        # de construir los items
        self.db.add(invoice)
        await self.db.flush()

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
            voucher_id=invoice.id,
            user_id=user_id,
            reason="Factura",
        )

        # 7. Asignar totales
        invoice.subtotal = total_subtotal
        invoice.iva_amount = total_iva
        invoice.total = total_final

        # Los items ya fueron flusheados dentro de
        # _build_invoice_items_from_source_vouchers

        await self._create_voucher_payments(
            voucher_id=invoice.id,
            business_id=business_id,
            payments=payments,
            total_expected=total_final,
            require_payments=not is_current_account,
            cash_register_id=cash_register_id,
            user_id=user_id,
            voucher_full_number=invoice.full_number,
        )

        # 10. Marcar la cotización como facturada
        quotation.invoiced_voucher_id = invoice.id

        await self.db.commit()
        await self.db.refresh(invoice)

        return await self.get_by_id(invoice.id, business_id)

    async def compile_quotations_to_invoice(
        self,
        business_id: UUID,
        quotation_ids: builtins.list[UUID],
        payments: builtins.list[dict[str, Any]] | None,
        fiscal_client_id: UUID | None,
        price_strategy: Literal["historical", "current"] = "historical",
        general_discount: Decimal = Decimal("0"),
        user_id: UUID = None,
        is_current_account: bool = False,
        payment_days: int | None = None,
        cash_register_id: UUID | None = None,
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
            payments: Métodos de pago (requerido salvo factura en cuenta corriente)
            fiscal_client_id: Cliente fiscal final (opcional)
            price_strategy: Estrategia de precios ('historical' | 'current')
            general_discount: Descuento general (%) override. Si es 0, usa max de cotizaciones.
            user_id: ID del usuario que realiza la compilación
            is_current_account: Si la factura queda pendiente de pago en cuenta corriente
            payment_days: Plazo de pago en días para cuenta corriente
            cash_register_id: ID de la caja abierta (para registrar movimientos)

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

        if is_current_account and not payment_days:
            raise ValueError("Debe indicar los días de plazo para la factura en cuenta corriente")

        # 8. Obtener business para numeración
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        if is_current_account:
            self._ensure_current_account_feature_enabled(business)

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
            general_discount=general_discount,
            is_current_account=is_current_account,
            payment_days=payment_days if is_current_account else None,
            is_paid=not is_current_account,
            paid_amount=None if is_current_account else Decimal("0"),
        )

        # Flushear la factura primero para obtener su ID antes
        # de construir los items
        self.db.add(invoice)
        await self.db.flush()

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
            invoice_general_discount=general_discount,
            metadata_strategy="source",
            voucher_id=invoice.id,
            user_id=user_id,
            reason="Factura",
        )

        # 14. Asignar totales
        invoice.subtotal = total_subtotal
        invoice.iva_amount = total_iva
        invoice.total = total_final

        # Los items ya fueron flusheados dentro de
        # _build_invoice_items_from_source_vouchers

        # 16. Crear pagos
        await self._create_voucher_payments(
            voucher_id=invoice.id,
            business_id=business_id,
            payments=payments,
            total_expected=invoice.total,
            require_payments=not is_current_account,
            cash_register_id=cash_register_id,
            user_id=user_id,
            voucher_full_number=invoice.full_number,
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
        items_data: builtins.list[dict[str, Any]],
        user_id: UUID,
        cash_register_id: UUID | None = None,
    ) -> Voucher:
        """
        Crea una Nota de Crédito a partir de una factura original.

        Args:
            business_id: ID del negocio
            original_voucher_id: ID de la factura original
            reason: Motivo de la NC
            items_data: Lista de items a devolver
            user_id: ID del usuario que crea la NC
            cash_register_id: ID de la caja abierta (para registrar movimientos)

        Returns:
            Voucher de tipo CREDIT_NOTE creado

        Raises:
            ValueError: Si hay errores de validación
        """

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
            sale_point=business.electronic_sale_point or business.sale_point or "0001",
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
    ) -> builtins.list[dict[str, Any]]:
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
