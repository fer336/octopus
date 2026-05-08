"""
Servicio de Acopio (Stockpile).
Maneja la lógica de negocio de acopios: crear, listar, retirar.
"""
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any, List
from uuid import UUID, uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Business, Stockpile, StockpileItem, StockpileStatus, Voucher, VoucherStatus, VoucherType
from app.models.client import Client
from app.models.product import Product

logger = logging.getLogger("uvicorn")


class StockpileService:
    """Servicio para manipulacion de acopios."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _generate_stockpile_number(self, business_id: UUID) -> str:
        """
        Genera el siguiente número de acopio para el negocio.
        Formato: ACOPIO-0001, ACOPIO-0002, etc.
        Se basa en el máximo número existente + 1 para evitar duplicados.
        Includes uniqueness check in a loop to handle race conditions.
        """
        from sqlalchemy import and_
        
        for attempt in range(10):  # Max 10 attempts to find unique number
            # Buscar el máximo número existente del negocio
            result = await self.db.execute(
                select(func.max(Stockpile.stockpile_number)).where(
                    Stockpile.business_id == business_id,
                    Stockpile.stockpile_number.isnot(None),
                )
            )
            max_number = result.scalar()
            
            if max_number:
                # Extraer el número y sumar 1
                try:
                    current_num = int(max_number.split('-')[-1])
                    count = current_num + 1
                except (ValueError, IndexError):
                    count = 1
            else:
                count = 1
            
            candidate = f"ACOPIO-{count:04d}"
            
            # Verify this candidate doesn't exist
            check = await self.db.execute(
                select(Stockpile.id).where(
                    and_(
                        Stockpile.business_id == business_id,
                        Stockpile.stockpile_number == candidate,
                    )
                )
            )
            if check.scalar_one_or_none() is None:
                # Found unique number
                return candidate
            
            # Otherwise, try again (count will increment in next loop)
            # The transaction ensures uniqueness across concurrent requests - need to re-fetch max
        
        # Fallback: use UUID if cannot find unique number after attempts
        return f"ACOPIO-{uuid4().hex[:8].upper()}"

    async def _create_principal_receipt(
        self,
        *,
        business_id: UUID,
        client_id: UUID,
        created_by: UUID | None,
        stockpile_name: str,
        amount: Decimal,
        notes: str | None = None,
    ) -> Voucher:
        """Crea el remito principal que documenta el nacimiento del acopio.

        Por ahora no genera ítems sintéticos porque `voucher_items.product_id` es
        obligatorio. El remito queda con totales y observación auditable; el
        renglón PDF sintético requiere una migración específica o producto sistema.
        """
        business = await self.db.get(Business, business_id)
        if not business:
            raise ValueError("Negocio no encontrado")

        last_number = int(business.last_receipt_number or "0")
        next_number = last_number + 1
        business.last_receipt_number = str(next_number).zfill(8)

        receipt_notes = notes or (
            f"Remito principal de acopio: {stockpile_name}. "
            f"Importe acopiado: ${amount}."
        )

        voucher = Voucher(
            business_id=business_id,
            client_id=client_id,
            created_by=created_by,
            voucher_type=VoucherType.RECEIPT,
            status=VoucherStatus.CONFIRMED,
            sale_point=business.sale_point or "0001",
            number=str(next_number).zfill(8),
            date=datetime.now().date(),
            notes=receipt_notes,
            show_prices="S",
            general_discount=Decimal("0.00"),
            subtotal=amount,
            iva_amount=Decimal("0.00"),
            total=amount,
        )
        self.db.add(voucher)
        await self.db.flush()
        return voucher

    async def create(
        self,
        business_id: UUID,
        client_id: UUID,
        created_by: UUID | None,
        name: str,
        currency: str,
        exchange_rate: Decimal | None,
        billing_client_id: UUID | None,
        items_data: list[dict],
        expiration_mode: str | None = None,
        due_date: date | None = None,
        principal_voucher_id: UUID | None = None,
    ) -> tuple[Stockpile, list[StockpileItem]]:
        """
        Crea un nuevo acopio con sus ítems.

        Args:
            business_id: ID del negocio
            client_id: ID del cliente que paga
            created_by: ID del usuario que crea
            name: Nombre/Obra del acopio
            currency: Moneda (ARS, USD)
            exchange_rate: Cotización del día (si USD)
            billing_client_id: Cliente para la factura (opcional)
            items_data: Lista de {"product_id": UUID, "quantity": Decimal}

        Returns:
            Tupla (Stockpile, list[StockpileItem])
        """
        from datetime import datetime

        logger.info(f"Creating stockpile: business={business_id}, client={client_id}")

        # Crear acopio
        stockpile = Stockpile(
            business_id=business_id,
            client_id=client_id,
            billing_client_id=billing_client_id,
            created_by=created_by,
            name=name,
            currency=currency,
            exchange_rate=exchange_rate,
            status=StockpileStatus.OPEN,
            expiration_mode=expiration_mode or "none",
            due_date=due_date,
            principal_voucher_id=principal_voucher_id,
        )
        self.db.add(stockpile)
        await self.db.flush()  # Obtener ID

        # Procesar cada ítem
        stockpile_items: list[StockpileItem] = []
        initial_amount = Decimal("0")

        for item_data in items_data:
            product_id = item_data["product_id"]
            quantity = item_data["quantity"]

            # Obtener producto
            product = await self.db.get(Product, product_id)
            if not product:
                logger.warning(f"Product {product_id} not found, skipping")
                continue

            # Validar que pertenece al business
            if product.business_id != business_id:
                logger.warning(f"Product {product_id} not owned by business {business_id}")
                continue

            # Obtener precios actuales para el snapshot
            product.calculate_prices()
            unit_price = product.net_price or Decimal("0")
            iva_rate = product.iva_rate or Decimal("21")
            iva_amount = (unit_price * iva_rate / 100).quantize(Decimal("0.01"))
            subtotal = unit_price
            total = unit_price + iva_amount

            # Cantidades
            qty_initial = quantity
            qty_withdrawn = Decimal("0")
            qty_remaining = quantity

            # Crear ítem
            item = StockpileItem(
                stockpile_id=stockpile.id,
                product_id=product_id,
                quantity_initial=qty_initial,
                quantity_withdrawn=qty_withdrawn,
                quantity_remaining=qty_remaining,
                currency=currency,
                frozen_unit_price=unit_price,
                frozen_iva_rate=iva_rate,
                frozen_iva_amount=iva_amount,
                frozen_subtotal=subtotal,
                frozen_total=total,
                product_code=product.code,
                product_description=product.description,
            )
            self.db.add(item)
            stockpile_items.append(item)

            # Calcular monto total
            initial_amount += total * quantity

        # Actualizar montos del acopio
        stockpile.initial_amount = initial_amount.quantize(Decimal("0.01"))
        stockpile.withdrawn_amount = Decimal("0")
        stockpile.remaining_amount = initial_amount.quantize(Decimal("0.01"))

        if stockpile.principal_voucher_id is None:
            principal_receipt = await self._create_principal_receipt(
                business_id=business_id,
                client_id=client_id,
                created_by=created_by,
                stockpile_name=name,
                amount=stockpile.initial_amount,
            )
            stockpile.principal_voucher_id = principal_receipt.id

        await self.db.commit()
        await self.db.refresh(stockpile)
        for stockpile_item in stockpile_items:
            await self.db.refresh(stockpile_item)

        logger.info(
            f"Stockpile {stockpile.id} created with {len(stockpile_items)} items, "
            f"amount={initial_amount}"
        )
        return stockpile, stockpile_items

    async def create_by_amount(
        self,
        business_id: UUID,
        client_id: UUID,
        created_by: UUID | None,
        name: str,
        description: str | None = None,
        currency: str = "ARS",
        exchange_rate: Decimal | None = None,
        billing_client_id: UUID | None = None,
        amount: Decimal = Decimal("0"),
        discount_percent: Decimal = Decimal("0"),
        expiration_mode: str | None = None,
        due_date: date | None = None,
        principal_voucher_id: UUID | None = None,
    ) -> tuple[Stockpile, StockpileItem]:
        """
        Crea un acopio por importe fijo, sin asociarlo a productos del catálogo.

        Se registra un ítem sintético (`product_id=None`) para conservar un
        detalle auditable del importe original sin inventar productos globales.
        """
        amount = amount.quantize(Decimal("0.01"))
        discount_percent = discount_percent.quantize(Decimal("0.01"))

        client = await self.db.get(Client, client_id)
        if not client or client.business_id != business_id:
            raise ValueError("Cliente no encontrado para este negocio")

        if billing_client_id:
            billing_client = await self.db.get(Client, billing_client_id)
            if not billing_client or billing_client.business_id != business_id:
                raise ValueError("Cliente de facturación no encontrado para este negocio")

        # Generar número de acopio (ACOPIO-0001, etc.)
        stockpile_number = await self._generate_stockpile_number(business_id)

        stockpile = Stockpile(
            business_id=business_id,
            client_id=client_id,
            billing_client_id=billing_client_id,
            created_by=created_by,
            name=name,
            description=description,
            stockpile_number=stockpile_number,
            currency=currency,
            exchange_rate=exchange_rate,
            discount_percent=discount_percent,
            status=StockpileStatus.OPEN,
            expiration_mode=expiration_mode or "none",
            due_date=due_date,
            principal_voucher_id=principal_voucher_id,
            initial_amount=amount,
            withdrawn_amount=Decimal("0.00"),
            remaining_amount=amount,
        )
        self.db.add(stockpile)
        await self.db.flush()

        if stockpile.principal_voucher_id is None:
            principal_receipt = await self._create_principal_receipt(
                business_id=business_id,
                client_id=client_id,
                created_by=created_by,
                stockpile_name=name,
                amount=amount,
                notes=(
                    f"Remito principal de acopio {stockpile_number}: {description or name}. "
                    f"Importe acopiado: ${amount}."
                ),
            )
            stockpile.principal_voucher_id = principal_receipt.id

        # Usar la descripción proporcionada o el nombre del acopio
        item_description = description or f"Acopio por importe - ${amount}"

        item = StockpileItem(
            stockpile_id=stockpile.id,
            product_id=None,
            quantity_initial=Decimal("1.00"),
            quantity_withdrawn=Decimal("0.00"),
            quantity_remaining=Decimal("1.00"),
            currency=currency,
            frozen_unit_price=amount,
            frozen_iva_rate=Decimal("0.00"),
            frozen_iva_amount=Decimal("0.00"),
            frozen_subtotal=amount,
            frozen_total=amount,
            product_code=stockpile_number,  # Usar el número de acopio como código
            product_description=item_description,
        )
        self.db.add(item)

        await self.db.commit()
        await self.db.refresh(stockpile)
        await self.db.refresh(item)

        logger.info(
            f"Stockpile by amount {stockpile.id} created: number={stockpile_number}, amount={amount}, "
            f"discount={discount_percent}%"
        )
        return stockpile, item

    async def list(
        self,
        business_id: UUID,
        client_id: UUID | None = None,
        status: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[Stockpile], int]:
        """
        Lista acopios con filtros.
        """
        from sqlalchemy.orm import selectinload
        
        query = select(Stockpile).options(selectinload(Stockpile.client)).where(Stockpile.business_id == business_id)

        if client_id:
            query = query.where(Stockpile.client_id == client_id)
        if status:
            query = query.where(Stockpile.status == status)

        # Contar total
        from sqlalchemy import func

        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0

        # Paginar
        query = query.order_by(Stockpile.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        stockpiles = result.scalars().all()

        logger.info(f"Listed {len(stockpiles)} stockpiles, total={total}")
        return list(stockpiles), total

    async def get_by_id(
        self, stockpile_id: UUID, business_id: UUID
    ) -> Stockpile | None:
        """Obtiene un acopio por ID."""
        from sqlalchemy.orm import selectinload
        
        result = await self.db.execute(
            select(Stockpile)
            .options(
                selectinload(Stockpile.client),
                selectinload(Stockpile.billing_client),
                selectinload(Stockpile.items),
            )
            .where(
                Stockpile.id == stockpile_id,
                Stockpile.business_id == business_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_items(
        self, stockpile_id: UUID
    ) -> List[StockpileItem]:
        """Obtiene los ítems de un acopio."""
        result = await self.db.execute(
            select(StockpileItem).where(
                StockpileItem.stockpile_id == stockpile_id
            )
        )
        return list(result.scalars().all())

    async def withdraw(
        self,
        stockpile: Stockpile,
        items_data: List[dict[str, Any]],
    ) -> tuple[List[StockpileItem], List[StockpileItem]]:
        """
        Retira productos del acopio.

        Actualiza quantity_withdrawn y quantity_remaining de cada ítem.
        Actualiza withdrawn_amount y remaining_amount del acopio.

        Returns:
            Tupla (list[StockpileItem actualizados], list[StockpileItem con faltantes])
        """
        from datetime import datetime

        logger.info(f"Withdraw from stockpile {stockpile.id}")

        if stockpile.status == StockpileStatus.CANCELLED:
            raise ValueError("Acopio cancelado")
        if stockpile.status == StockpileStatus.COMPLETED:
            raise ValueError("Acopio ya completado")

        updated_items: list[StockpileItem] = []
        insufficient_items: list[StockpileItem] = []

        from sqlalchemy import update

        for item_data in items_data:
            product_id = item_data["product_id"]
            quantity = item_data["quantity"]

            # Buscar ítem por product_id
            result = await self.db.execute(
                select(StockpileItem).where(
                    StockpileItem.stockpile_id == stockpile.id,
                    StockpileItem.product_id == product_id,
                )
            )
            item = result.scalar_one_or_none()

            if not item:
                logger.warning(f"Item not found for product {product_id}")
                continue

            # Validar stock disponible
            if item.quantity_remaining < quantity:
                insufficient_items.append(item)
                logger.warning(
                    f"Insufficient stock for {item.product_code}: "
                    f"{item.quantity_remaining} < {quantity}"
                )
                continue

            # Actualizar cantidades
            item.quantity_withdrawn += quantity
            item.quantity_remaining -= quantity
            updated_items.append(item)

        if not updated_items:
            raise ValueError("No hay productos disponibles para retirar")

        # Recalcular montos del acopio
        new_withdrawn = Decimal("0")
        for item in stockpile.items:
            if item.quantity_withdrawn:
                new_withdrawn += (
                    (item.frozen_unit_price + item.frozen_iva_amount)
                    * item.quantity_withdrawn
                )

        stockpile.withdrawn_amount = new_withdrawn.quantize(Decimal("0.01"))
        stockpile.remaining_amount = (
            stockpile.initial_amount - new_withdrawn
        ).quantize(Decimal("0.01"))

        # Actualizar estado
        if stockpile.remaining_amount <= 0:
            stockpile.status = StockpileStatus.COMPLETED
            stockpile.completed_at = datetime.utcnow()

        # Recargar ítems
        items = await self.get_items(stockpile.id)

        await self.db.commit()
        logger.info(f"Withdraw complete: updated={len(updated_items)}")

        return updated_items, insufficient_items

    async def close(
        self, stockpile: Stockpile, force: bool = False
    ) -> Stockpile:
        """Cierra un acopio manualmente."""
        from datetime import datetime

        if stockpile.status == StockpileStatus.COMPLETED:
            raise ValueError("Acopio ya completado")
        if stockpile.status == StockpileStatus.CANCELLED:
            raise ValueError("Acopio ya cancelado")

        # Validar que no tenga saldo pendiente si no es force
        if not force and stockpile.remaining_amount > 0:
            raise ValueError(
                "El acopio aún tiene saldo disponible. "
                "Use force=True para cerrar igual."
            )

        stockpile.status = StockpileStatus.COMPLETED
        stockpile.completed_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(stockpile)

        logger.info(f"Stockpile {stockpile.id} closed")
        return stockpile

    async def cancel(self, stockpile: Stockpile) -> Stockpile:
        """Cancela un acopio. Solo se permite si no tiene remitos parciales asociados."""
        from datetime import datetime
        from app.models.voucher import Voucher

        if stockpile.status == StockpileStatus.CANCELLED:
            raise ValueError("Acopio ya cancelado")
        # Verificar que NO haya remitos hijos asociados (vouchers con stockpile_id = este stockpile)
        # El remito principal (principal_voucher_id) NO cuenta como hijo
        result = await self.db.execute(
            select(func.count()).select_from(Voucher).where(
                Voucher.stockpile_id == stockpile.id,
                Voucher.deleted_at.is_(None),
            )
        )
        child_remitos_count = result.scalar() or 0

        if child_remitos_count > 0:
            raise ValueError(
                f"No se puede cancelar el acopio porque tiene {child_remitos_count} remito(s) parcial(es) asociado(s). "
                "Cancele primero los remitos vinculados."
            )

        stockpile.status = StockpileStatus.CANCELLED
        stockpile.completed_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(stockpile)

        logger.info(f"Stockpile {stockpile.id} cancelled")
        return stockpile

    async def list_open_by_client(
        self, business_id: UUID, client_id: UUID
    ) -> List[dict[str, Any]]:
        """
        Lista acopios abiertos para un cliente.
        Solo retorna status OPEN o PARTIAL.
        """
        from sqlalchemy import and_
        from app.models.voucher import Voucher

        result = await self.db.execute(
            select(Stockpile, Voucher.sale_point, Voucher.number)
            .outerjoin(Voucher, Voucher.id == Stockpile.principal_voucher_id)
            .where(
                and_(
                    Stockpile.business_id == business_id,
                    Stockpile.client_id == client_id,
                    Stockpile.status.in_(
                        [StockpileStatus.OPEN, StockpileStatus.PARTIAL]
                    ),
                )
            )
            .order_by(Stockpile.created_at.desc())
        )
        return [
            {
                "stockpile": stockpile,
                "principal_voucher_number": (
                    f"{sale_point}-{number}" if sale_point and number else None
                ),
            }
            for stockpile, sale_point, number in result.all()
        ]

    async def get_summary(
        self, stockpile_id: UUID, business_id: UUID
    ) -> dict | None:
        """
        Obtiene summary de un acopio para Remito UI.
        """
        from sqlalchemy import func, select

        # Obtener acopio
        stockpile = await self.get_by_id(stockpile_id, business_id)
        if not stockpile:
            return None

        # Contar child remitos (vouchers asociados)
        child_remitos_count = 0
        if stockpile.principal_voucher_id:
            # Contar vouchers que referencian este stockpile como principal
            from app.models.voucher import Voucher

            result = await self.db.execute(
                select(func.count())
                .select_from(Voucher)
                .where(Voucher.stockpile_id == stockpile_id)
            )
            child_remitos_count = result.scalar() or 0

        # Obtener número de voucher principal
        principal_voucher_number = None
        if stockpile.principal_voucher_id:
            from app.models.voucher import Voucher

            result = await self.db.execute(
                select(Voucher.number).where(
                    Voucher.id == stockpile.principal_voucher_id
                )
            )
            principal_voucher_number = result.scalar()

        # Obtener ítems
        items = await self.get_items(stockpile_id)

        return {
            "stockpile_id": stockpile.id,
            "name": stockpile.name,
            "status": stockpile.status,
            "created_at": stockpile.created_at,
            "snapshot_date": stockpile.created_at,
            "prices_valid_at": stockpile.created_at,
            "initial_amount": stockpile.initial_amount,
            "withdrawn_amount": stockpile.withdrawn_amount,
            "remaining_amount": stockpile.remaining_amount,
            "child_remitos_count": child_remitos_count,
            "principal_voucher_id": stockpile.principal_voucher_id,
            "principal_voucher_number": principal_voucher_number,
            "items": items,
        }

    async def validate_withdrawal(
        self, stockpile_id: UUID, business_id: UUID, withdrawal_amount: Decimal
    ) -> dict:
        """
        Valida si un retiro puede realizarse.
        """
        from sqlalchemy import and_

        # Obtener acopio
        result = await self.db.execute(
            select(Stockpile).where(
                and_(
                    Stockpile.id == stockpile_id,
                    Stockpile.business_id == business_id,
                )
            )
        )
        stockpile = result.scalar_one_or_none()

        if not stockpile:
            return {
                "allowed": False,
                "withdrawal_amount": withdrawal_amount,
                "remaining_amount": Decimal("0"),
                "exceeded_amount": None,
                "message": "Acopio no encontrado",
            }

        if stockpile.status == StockpileStatus.CANCELLED:
            return {
                "allowed": False,
                "withdrawal_amount": withdrawal_amount,
                "remaining_amount": stockpile.remaining_amount,
                "exceeded_amount": None,
                "message": "Acopio cancelado",
            }

        if stockpile.status == StockpileStatus.COMPLETED:
            return {
                "allowed": False,
                "withdrawal_amount": withdrawal_amount,
                "remaining_amount": stockpile.remaining_amount,
                "exceeded_amount": None,
                "message": "Acopio ya completado",
            }

        if withdrawal_amount <= 0:
            return {
                "allowed": False,
                "withdrawal_amount": withdrawal_amount,
                "remaining_amount": stockpile.remaining_amount,
                "exceeded_amount": None,
                "message": "El monto debe ser mayor a 0",
            }

        if withdrawal_amount > stockpile.remaining_amount:
            exceeded = withdrawal_amount - stockpile.remaining_amount
            return {
                "allowed": False,
                "withdrawal_amount": withdrawal_amount,
                "remaining_amount": stockpile.remaining_amount,
                "exceeded_amount": exceeded,
                "message": f"Monto excede el saldo disponible por ${exceeded}",
            }

        return {
            "allowed": True,
            "withdrawal_amount": withdrawal_amount,
            "remaining_amount": stockpile.remaining_amount,
            "exceeded_amount": None,
            "message": "Retiro autorizado",
        }

    async def get_frozen_items(
        self, stockpile_id: UUID, business_id: UUID
    ) -> List[StockpileItem] | None:
        """
        Obtiene los ítems congelados de un acopio.
        """
        from sqlalchemy import and_

        # Verificar que el acopio pertenece al business
        result = await self.db.execute(
            select(Stockpile).where(
                and_(
                    Stockpile.id == stockpile_id,
                    Stockpile.business_id == business_id,
                )
            )
        )
        stockpile = result.scalar_one_or_none()

        if not stockpile:
            return None

        # Obtener ítems
        return await self.get_items(stockpile_id)
