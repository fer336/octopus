"""
Servicio de Productos.
Contiene toda la lógica de negocio para productos.
"""

from __future__ import annotations

import builtins
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import asc, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.brand import Brand
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.product_lot import ProductLot
from app.schemas.product import ProductBulkUpdateItem, ProductCreate, ProductListParams, ProductUpdate
from app.schemas.product_lot import ProductLotCreate
from app.services.brand_service import BrandService
from app.services.product_lot_service import ProductLotService


class ProductService:
    """Servicio para gestión de productos."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, business_id: UUID, data: ProductCreate) -> Product:
        """Crea un nuevo producto con cálculo automático de precios.

        Si se especifica current_stock > 0, crea un lote inicial.
        expiration_date se usa en el lote inicial (no en el producto).
        """
        from datetime import date
        # Separar campos de lote de los del producto
        initial_stock = data.current_stock
        exp_date = date.fromisoformat(data.expiration_date) if data.expiration_date else None

        create_data = data.model_dump(
            exclude={"current_stock", "expiration_date", "brand_name"}
        )
        await self._sync_brand_fields(business_id, create_data, data)
        product = Product(
            business_id=business_id,
            **create_data,
        )
        product.calculate_prices()

        self.db.add(product)

        # Crear lote inicial si hay stock
        if initial_stock > 0:
            await self.db.flush()  # Obtener ID del producto
            lot = ProductLot(
                product_id=product.id,
                business_id=business_id,
                code=f"INIT-{str(product.id)[:8]}",
                quantity=initial_stock,
                initial_quantity=initial_stock,
                expiration_date=exp_date,
                received_date=date.today(),
            )
            self.db.add(lot)

        await self.db.commit()
        await self.db.refresh(product, attribute_names=["lots"])
        return product

    async def get_by_id(
        self,
        product_id: UUID,
        business_id: UUID,
        include_deleted: bool = False,
    ) -> Product | None:
        """Obtiene un producto por ID."""
        query = select(Product).where(
            Product.id == product_id,
            Product.business_id == business_id,
        )
        query = query.options(selectinload(Product.lots), selectinload(Product.brand_ref))
        if not include_deleted:
            query = query.where(Product.deleted_at.is_(None))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_code(
        self,
        code: str,
        business_id: UUID,
    ) -> Product | None:
        """Obtiene un producto por código interno."""
        query = select(Product).where(
            Product.code == code,
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
        )
        query = query.options(selectinload(Product.lots), selectinload(Product.brand_ref))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list(
        self,
        business_id: UUID,
        params: ProductListParams,
    ) -> tuple[list[Product], int]:
        """Lista productos con paginación, búsqueda y filtros."""
        # Query base
        base_conditions = [
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
        ]

        # Aplicar filtros
        uses_brand_join = False  # se activa si el search multi-campo o brand filter lo requiere
        if params.code:
            base_conditions.append(Product.code == params.code)

        if params.supplier_code:
            base_conditions.append(Product.supplier_code == params.supplier_code)

        _SEARCHABLE_FIELDS_MAP = {
            "code": Product.code,
            "supplier_code": Product.supplier_code,
            "description": Product.description,
            "brand": Product.brand,
            "line": Product.line,
            "application_area": Product.application_area,
            "finish": Product.finish,
        }

        if params.search:
            if params.search_field and params.search_field in _SEARCHABLE_FIELDS_MAP:
                # Búsqueda ILIKE solo en el campo específico
                field = _SEARCHABLE_FIELDS_MAP[params.search_field]
                base_conditions.append(field.ilike(f"%{params.search}%"))
            else:
                # Búsqueda multi-campo estándar
                search_filter = or_(
                    Product.code.ilike(f"%{params.search}%"),
                    Product.supplier_code.ilike(f"%{params.search}%"),
                    Product.description.ilike(f"%{params.search}%"),
                    Product.brand.ilike(f"%{params.search}%"),
                    Brand.name.ilike(f"%{params.search}%"),
                    Product.line.ilike(f"%{params.search}%"),
                    Product.application_area.ilike(f"%{params.search}%"),
                    Product.finish.ilike(f"%{params.search}%"),
                    Product.customer_terms.ilike(f"%{params.search}%"),
                )
                base_conditions.append(search_filter)
                uses_brand_join = True

        if params.category_id:
            base_conditions.append(Product.category_id == params.category_id)

        if params.supplier_id:
            base_conditions.append(Product.supplier_id == params.supplier_id)

        if params.brand_id:
            base_conditions.append(Product.brand_id == params.brand_id)

        if params.brand:
            uses_brand_join = True
            base_conditions.append(
                or_(
                    Product.brand.ilike(f"%{params.brand}%"),
                    Brand.name.ilike(f"%{params.brand}%"),
                )
            )

        if params.line:
            base_conditions.append(Product.line.ilike(f"%{params.line}%"))

        if params.application_area:
            base_conditions.append(
                Product.application_area.ilike(f"%{params.application_area}%")
            )

        if params.finish:
            base_conditions.append(Product.finish.ilike(f"%{params.finish}%"))

        if params.quality_tier:
            base_conditions.append(
                Product.quality_tier.ilike(f"%{params.quality_tier}%")
            )

        if params.is_active is not None:
            base_conditions.append(Product.is_active == params.is_active)

        stock_by_product = (
            select(
                ProductLot.product_id.label("product_id"),
                func.coalesce(func.sum(ProductLot.quantity), 0).label("stock"),
            )
            .where(
                ProductLot.business_id == business_id,
                ProductLot.deleted_at.is_(None),
            )
            .group_by(ProductLot.product_id)
            .subquery()
        )
        current_stock_expr = func.coalesce(stock_by_product.c.stock, 0)

        if params.low_stock:
            base_conditions.append(current_stock_expr <= Product.minimum_stock)

        # Query de conteo
        count_query = select(func.count(Product.id)).where(*base_conditions)
        if uses_brand_join:
            count_query = count_query.outerjoin(Brand, Product.brand_id == Brand.id)
        if params.low_stock:
            count_query = count_query.outerjoin(
                stock_by_product,
                stock_by_product.c.product_id == Product.id,
            )
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        sort_map = {
            "description": Product.description,
            "sale_price": Product.sale_price,
            "current_stock": current_stock_expr,
        }
        sort_column = sort_map.get(params.sort_by, Product.description)
        sort_direction = desc if params.sort_order == "desc" else asc

        # Query paginada
        offset = (params.page - 1) * params.per_page

        # Orden por relevancia si hay search_field
        if params.search and params.search_field and params.search_field in _SEARCHABLE_FIELDS_MAP:
            field = _SEARCHABLE_FIELDS_MAP[params.search_field]
            prefix_match = field.ilike(f"{params.search}%")
            order_by = [case((prefix_match, 0), else_=1), field.asc()]
        else:
            order_by = [sort_direction(sort_column), Product.description.asc()]

        query = (
            select(Product)
            .options(selectinload(Product.lots), selectinload(Product.brand_ref))
            .where(*base_conditions)
            .outerjoin(
                stock_by_product,
                stock_by_product.c.product_id == Product.id,
            )
            .order_by(*order_by)
            .offset(offset)
            .limit(params.per_page)
        )

        if uses_brand_join:
            query = query.outerjoin(Brand, Product.brand_id == Brand.id)

        result = await self.db.execute(query)
        products = list(result.scalars().all())

        return products, total

    async def update(
        self,
        product_id: UUID,
        business_id: UUID,
        data: ProductUpdate,
        user_id: UUID | None = None,
    ) -> Product | None:
        """Actualiza un producto y registra cambios de precio."""
        product = await self.get_by_id(product_id, business_id)
        if not product:
            return None

        # Guardar precios anteriores para el historial
        old_list_price = product.list_price
        old_net_price = product.net_price
        old_sale_price = product.sale_price

        # Aplicar actualizaciones
        update_data = data.model_dump(exclude={"brand_name"}, exclude_unset=True)
        await self._sync_brand_fields(business_id, update_data, data)
        for field, value in update_data.items():
            setattr(product, field, value)

        # Recalcular precios si cambió algo relacionado
        price_fields = {
            "list_price",
            "discount_1",
            "discount_2",
            "discount_3",
            "iva_rate",
            "extra_cost",
            "profit_margin",
        }
        if price_fields & set(update_data.keys()):
            product.calculate_prices()

            # Registrar en historial si el precio cambió
            if product.sale_price != old_sale_price:
                history = PriceHistory(
                    product_id=product.id,
                    changed_by=user_id,
                    old_list_price=old_list_price,
                    old_net_price=old_net_price,
                    old_sale_price=old_sale_price,
                    new_list_price=product.list_price,
                    new_net_price=product.net_price,
                    new_sale_price=product.sale_price,
                    change_reason="Manual",
                )
                self.db.add(history)

        # Enqueue MELI sync for price changes (same transaction — outbox pattern)
        if price_fields & set(update_data.keys()) and product.sale_price != old_sale_price:
            try:
                from app.services.meli.sync import enqueue_product_sync
                await enqueue_product_sync(self.db, product.id, business_id, {"price"})
            except Exception:
                logger.warning("MELI price sync enqueue failed for product %s", product.id, exc_info=True)

        await self.db.commit()
        refreshed = await self.get_by_id(product.id, business_id)
        return refreshed if refreshed else product

    async def bulk_update(
        self,
        business_id: UUID,
        items: builtins.list[ProductBulkUpdateItem],
        user_id: UUID | None = None,
    ) -> tuple[builtins.list[Product], builtins.list[UUID]]:
        """Actualiza varios productos en una única transacción."""
        product_ids = [item.id for item in items]
        result = await self.db.execute(
            select(Product)
            .options(selectinload(Product.lots), selectinload(Product.brand_ref))
            .where(
                Product.id.in_(product_ids),
                Product.business_id == business_id,
                Product.deleted_at.is_(None),
            )
        )
        products_by_id = {product.id: product for product in result.scalars().all()}

        updated_products: list[Product] = []
        not_found_ids: list[UUID] = []
        price_fields = {
            "list_price",
            "discount_1",
            "discount_2",
            "discount_3",
            "iva_rate",
            "extra_cost",
            "profit_margin",
        }

        for item in items:
            product = products_by_id.get(item.id)
            if not product:
                not_found_ids.append(item.id)
                continue

            old_list_price = product.list_price
            old_net_price = product.net_price
            old_sale_price = product.sale_price

            update_data = item.model_dump(exclude={"id", "brand_name"}, exclude_unset=True)
            await self._sync_brand_fields(business_id, update_data, item)
            desired_stock = update_data.pop("current_stock", None)
            for field, value in update_data.items():
                setattr(product, field, value)

            if desired_stock is not None:
                current_stock = product.current_stock
                stock_delta = desired_stock - current_stock

                if stock_delta > 0:
                    self.db.add(
                        ProductLot(
                            product_id=product.id,
                            business_id=business_id,
                            code=f"BULK-{str(product.id)[:8]}",
                            quantity=stock_delta,
                            initial_quantity=stock_delta,
                            received_date=date.today(),
                        )
                    )
                elif stock_delta < 0:
                    lot_service = ProductLotService(self.db)
                    await lot_service.fifo_consume(
                        product_id=product.id,
                        business_id=business_id,
                        quantity=abs(stock_delta),
                    )

            if price_fields & set(update_data.keys()):
                product.calculate_prices()

                if product.sale_price != old_sale_price:
                    self.db.add(
                        PriceHistory(
                            product_id=product.id,
                            changed_by=user_id,
                            old_list_price=old_list_price,
                            old_net_price=old_net_price,
                            old_sale_price=old_sale_price,
                            new_list_price=product.list_price,
                            new_net_price=product.net_price,
                            new_sale_price=product.sale_price,
                            change_reason="Actualización masiva",
                        )
                    )

            updated_products.append(product)

        await self.db.commit()

        if not updated_products:
            return [], not_found_ids

        updated_ids = [product.id for product in updated_products]
        refreshed_result = await self.db.execute(
            select(Product)
            .options(selectinload(Product.lots), selectinload(Product.brand_ref))
            .where(
                Product.id.in_(updated_ids),
                Product.business_id == business_id,
                Product.deleted_at.is_(None),
            )
        )
        refreshed_by_id = {
            product.id: product for product in refreshed_result.scalars().all()
        }

        return [
            refreshed_by_id[product_id]
            for product_id in updated_ids
            if product_id in refreshed_by_id
        ], not_found_ids

    async def get_price_history(
        self,
        product_id: UUID,
        business_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[builtins.list[PriceHistory], int]:
        """Retorna el historial de precios de un producto."""
        query = select(PriceHistory).where(
            PriceHistory.product_id == product_id,
        )
        # Verificar que el producto existe y pertenece al negocio
        product = await self.get_by_id(product_id, business_id)
        if not product:
            return [], 0

        count_result = await self.db.execute(
            select(func.count(PriceHistory.id)).where(
                PriceHistory.product_id == product_id,
            )
        )
        total = count_result.scalar() or 0

        result = await self.db.execute(
            query.order_by(PriceHistory.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        entries = list(result.scalars().all())
        return entries, total

    async def _sync_brand_fields(
        self,
        business_id: UUID,
        product_data: dict,
        source: ProductCreate | ProductUpdate | ProductBulkUpdateItem,
    ) -> None:
        """Resuelve marca canónica y mantiene el string legacy sincronizado."""
        source_fields: set[str] = getattr(source, "model_fields_set", set())
        provided_brand_id = "brand_id" in source_fields
        provided_brand_name = "brand_name" in source_fields
        provided_brand = "brand" in source_fields

        brand_id = product_data.get("brand_id")
        raw_name = None
        if provided_brand_name:
            raw_name = getattr(source, "brand_name", None)
        elif provided_brand:
            raw_name = product_data.get("brand")

        service = BrandService(self.db)
        if brand_id:
            brand = await service.get_by_id(brand_id, business_id)
            if not brand:
                raise ValueError("Marca no encontrada")
            product_data["brand"] = brand.name
            return

        if raw_name and str(raw_name).strip():
            brand = await service.resolve_or_create(business_id, str(raw_name))
            product_data["brand_id"] = brand.id
            product_data["brand"] = brand.name
            return

        if provided_brand_id and brand_id is None:
            product_data["brand"] = None

        if (provided_brand_name or provided_brand) and not raw_name:
            product_data["brand_id"] = None
            product_data["brand"] = None

    async def restore_price(
        self,
        product_id: UUID,
        business_id: UUID,
        entry_id: UUID,
        user_id: UUID | None = None,
        reason: str | None = None,
    ) -> tuple[Product | None, PriceHistory | None]:
        """Restaura el precio de un producto desde un entry de PriceHistory.

        Retorna (producto_actualizado, nuevo_entry_de_historial) o (None, None) si no se encuentra.
        """
        # Verificar producto
        product = await self.get_by_id(product_id, business_id)
        if not product:
            return None, None

        # Buscar el entry del historial
        result = await self.db.execute(
            select(PriceHistory).where(PriceHistory.id == entry_id)
        )
        history_entry = result.scalar_one_or_none()
        if not history_entry:
            return None, None

        # Guardar precios actuales antes de restaurar
        old_list_price = product.list_price
        old_net_price = product.net_price
        old_sale_price = product.sale_price

        # Restaurar precios
        product.list_price = history_entry.old_list_price
        product.net_price = history_entry.old_net_price
        product.sale_price = history_entry.old_sale_price

        # Registrar la restauración como un nuevo entry en el historial
        new_entry = PriceHistory(
            product_id=product.id,
            changed_by=user_id,
            old_list_price=old_list_price,
            old_net_price=old_net_price,
            old_sale_price=old_sale_price,
            new_list_price=product.list_price,
            new_net_price=product.net_price,
            new_sale_price=product.sale_price,
            change_reason=reason or "Restauración desde historial",
        )
        self.db.add(new_entry)

        await self.db.commit()
        await self.db.refresh(product)

        return product, new_entry

    async def bulk_stock_delta(
        self,
        business_id: UUID,
        items: builtins.list[tuple[UUID, int, str | None]],
        user_id: UUID | None = None,
    ) -> builtins.list[tuple[UUID, bool, str | None]]:
        """Ajusta stock de múltiples productos por delta.

        Cada item es (product_id, delta, reason).
        Retorna lista de (product_id, success, error_message).
        """
        results: list[tuple[UUID, bool, str | None]] = []
        for product_id, delta, reason in items:
            try:
                product = await self.update_stock(
                    product_id=product_id,
                    business_id=business_id,
                    quantity_change=delta,
                    user_id=user_id,
                    reason=reason,
                )
                if product:
                    results.append((product_id, True, None))
                else:
                    results.append((product_id, False, "Producto no encontrado"))
            except ValueError as e:
                results.append((product_id, False, str(e)))
            except Exception as e:
                results.append((product_id, False, f"Error interno: {str(e)}"))
        return results

    async def soft_delete(self, product_id: UUID, business_id: UUID) -> bool:
        """Elimina un producto (soft delete)."""
        product = await self.get_by_id(product_id, business_id)
        if not product:
            return False

        product.deleted_at = datetime.utcnow()
        await self.db.commit()
        return True

    async def update_stock(
        self,
        product_id: UUID,
        business_id: UUID,
        quantity_change: int,
        user_id: UUID | None = None,
        reason: str | None = None,
    ) -> Product | None:
        """Actualiza el stock de un producto usando lotes.

        quantity_change > 0 → crea nuevo lote con esa cantidad.
        quantity_change < 0 → consume via FIFO desde lotes activos.
        quantity_change == 0 → no-op.

        Si se provee user_id, registra Auditoría de ajuste de stock
        y pasa la atribución a las operaciones de lote internas.
        """
        product = await self.get_by_id(product_id, business_id)
        if not product:
            return None

        lot_service = ProductLotService(self.db)
        before_stock = product.current_stock

        if quantity_change > 0:
            lot_data = ProductLotCreate(quantity=quantity_change)
            await lot_service.create(
                product_id, business_id, lot_data, user_id=user_id,
            )
        elif quantity_change < 0:
            await lot_service.fifo_consume(
                product_id=product_id,
                business_id=business_id,
                quantity=abs(quantity_change),
                user_id=user_id,
                reason=reason or "Ajuste de stock",
            )
        # quantity_change == 0: no-op

        # Registrar auditoría de ajuste de stock
        if user_id and quantity_change != 0:
            from app.models.audit_log import AuditLog

            after_stock = before_stock + quantity_change
            audit = AuditLog(
                user_id=user_id,
                business_id=business_id,
                action="adjust",
                resource_type="stock_adjustment",
                resource_id=product_id,
                details={
                    "delta": quantity_change,
                    "reason": reason,
                    "before_stock": before_stock,
                    "after_stock": after_stock,
                },
            )
            self.db.add(audit)
            await self.db.flush()

        # Enqueue MELI sync for stock changes (same transaction — outbox pattern)
        if quantity_change != 0:
            try:
                from app.services.meli.sync import enqueue_product_sync
                await enqueue_product_sync(self.db, product_id, business_id, {"stock"})
            except Exception:
                logger.warning("MELI stock sync enqueue failed for product %s", product_id, exc_info=True)

        await self.db.commit()

        refreshed = await self.get_by_id(product.id, business_id)
        return refreshed if refreshed else product
