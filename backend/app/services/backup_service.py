"""
Servicio de Backup para Tenants.
Genera dumps SQL lógicos aislados para un tenant específico.
"""

import json
import logging
from decimal import Decimal
from datetime import datetime
from typing import List
from uuid import UUID

logger = logging.getLogger(__name__)

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.category import Category
from app.models.client import Client
from app.models.payment import Payment
from app.models.payment_method import PaymentMethodCatalog
from app.models.price_history import PriceHistory
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder
from app.models.supplier import Supplier
from app.models.tenant_membership import TenantMembership
from app.models.tenant_secret import TenantSecret
from app.models.user import User
from app.models.voucher import Voucher
from app.models.cash_register import CashMovement, CashRegister
from app.models.ai_provider_config import AIProviderConfig
from app.models.voucher_item import VoucherItem
from app.models.purchase_order import PurchaseOrderItem


class BackupService:
    """Servicio para generación de backups SQL por tenant."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _escape_sql_string(self, value: str) -> str:
        """Escapa strings para SQL INSERT."""
        if value is None:
            return "NULL"
        escaped = value.replace("'", "''")
        return f"'{escaped}'"

    def _escape_sql_value(self, value) -> str:
        """Escapa valores para SQL INSERT basándose en tipo."""
        if value is None:
            return "NULL"
        elif isinstance(value, (int, float)):
            return str(value)
        elif isinstance(value, bool):
            return "TRUE" if value else "FALSE"
        elif isinstance(value, datetime):
            return f"'{value.isoformat()}'"
        elif isinstance(value, UUID):
            return f"'{value}'"
        elif isinstance(value, dict):
            json_str = json.dumps(value).replace("'", "''")
            return f"'{json_str}'"
        elif isinstance(value, list):
            json_str = json.dumps(value).replace("'", "''")
            return f"'{json_str}'"
        else:
            return self._escape_sql_string(str(value))

    def _generate_insert_sql(
        self, table_name: str, columns: List[str], rows: List[tuple]
    ) -> str:
        """Genera SQL INSERT statements para una tabla."""
        if not rows:
            return ""

        sql_parts = []
        sql_parts.append(f"-- Inserting into {table_name}")
        sql_parts.append("")

        for row in rows:
            values = ", ".join(self._escape_sql_value(val) for val in row)
            sql_parts.append(
                f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({values});"
            )

        sql_parts.append("")
        return "\n".join(sql_parts)

    async def generate_tenant_backup_sql(self, business_id: UUID) -> str:
        """
        Genera un dump SQL completo del tenant.
        Incluye todas las tablas relevantes filtradas por business_id.
        Ordenado por dependencias para facilitar restore.
        """
        sql_parts = []
        sql_parts.append("-- =======================================================")
        sql_parts.append(f"-- BACKUP SQL FOR BUSINESS {business_id}")
        sql_parts.append(f"-- Generated on {datetime.utcnow().isoformat()}")
        sql_parts.append("-- =======================================================")
        sql_parts.append("")

        # Paso 1: Business (la base del tenant)
        business_query = select(Business).where(Business.id == business_id)
        business_result = await self.db.execute(business_query)
        business = business_result.scalar_one_or_none()

        if not business:
            raise ValueError(f"Business {business_id} not found")

        # Obtener columnas de la tabla business
        columns = [col.name for col in Business.__table__.columns]
        business_data = [tuple(getattr(business, col) for col in columns)]
        sql_parts.append(
            self._generate_insert_sql("businesses", columns, business_data)
        )

        # Paso 2: Users asociados al business (via memberships)
        memberships_query = select(TenantMembership).where(
            TenantMembership.business_id == business_id
        )
        memberships_result = await self.db.execute(memberships_query)
        memberships = memberships_result.scalars().all()

        user_ids = [m.user_id for m in memberships]

        if user_ids:
            users_query = select(User).where(User.id.in_(user_ids))
            users_result = await self.db.execute(users_query)
            users = users_result.scalars().all()

            # Incluir también el owner
            owner_already_included = any(u.id == business.owner_id for u in users)
            if not owner_already_included:
                owner_query = select(User).where(User.id == business.owner_id)
                owner_result = await self.db.execute(owner_query)
                owner = owner_result.scalar_one_or_none()
                if owner:
                    users.append(owner)
                    user_ids.append(business.owner_id)

        # Generar SQL para users (sin duplicados)
        seen_user_ids = set()
        user_data = []
        for user in users:
            if user.id not in seen_user_ids:
                user_columns = [col.name for col in User.__table__.columns]
                user_data.append(tuple(getattr(user, col) for col in user_columns))
                seen_user_ids.add(user.id)

        if user_data:
            sql_parts.append(
                self._generate_insert_sql("users", user_columns, user_data)
            )

        # Paso 3: Tenant Memberships
        membership_columns = [col.name for col in TenantMembership.__table__.columns]
        membership_data = [
            tuple(getattr(m, col) for col in membership_columns) for m in memberships
        ]
        sql_parts.append(
            self._generate_insert_sql(
                "tenant_memberships", membership_columns, membership_data
            )
        )

        # Paso 4: Payment Methods Catalog
        payment_methods_query = select(PaymentMethodCatalog).where(
            PaymentMethodCatalog.business_id == business_id
        )
        payment_methods_result = await self.db.execute(payment_methods_query)
        payment_methods = payment_methods_result.scalars().all()

        if payment_methods:
            pm_columns = [col.name for col in PaymentMethodCatalog.__table__.columns]
            pm_data = [
                tuple(getattr(pm, col) for col in pm_columns) for pm in payment_methods
            ]
            sql_parts.append(
                self._generate_insert_sql(
                    "payment_methods_catalog", pm_columns, pm_data
                )
            )

        # Paso 5: Categories (solo las que tienen productos del tenant)
        categories_query = text("""
            SELECT DISTINCT c.* FROM categories c
            JOIN products p ON c.id = p.category_id
            WHERE p.business_id = :business_id
            ORDER BY c.id
        """)
        categories_result = await self.db.execute(
            categories_query, {"business_id": business_id}
        )
        categories = categories_result.fetchall()

        if categories:
            cat_columns = [col.name for col in Category.__table__.columns]
            cat_data = [row for row in categories]
            sql_parts.append(
                self._generate_insert_sql("categories", cat_columns, cat_data)
            )

        # Paso 6: Suppliers (solo los que tienen productos del tenant)
        suppliers_query = text("""
            SELECT DISTINCT s.* FROM suppliers s
            JOIN products pr ON s.id = pr.supplier_id
            WHERE pr.business_id = :business_id
            ORDER BY s.id
        """)
        suppliers_result = await self.db.execute(
            suppliers_query, {"business_id": business_id}
        )
        suppliers_with_products = suppliers_result.fetchall()

        # También incluir suppliers de purchase orders
        suppliers_po_query = text("""
            SELECT DISTINCT s.* FROM suppliers s
            JOIN purchase_orders po ON s.id = po.supplier_id
            WHERE po.business_id = :business_id
            ORDER BY s.id
        """)
        suppliers_po_result = await self.db.execute(
            suppliers_po_query, {"business_id": business_id}
        )
        suppliers_with_orders = suppliers_po_result.fetchall()

        # Combinar sin duplicados por id
        all_suppliers = list(suppliers_with_products) + list(suppliers_with_orders)
        seen_supplier_ids = set()
        supplier_data = []

        for supp in all_suppliers:
            if supp.id not in seen_supplier_ids:
                supplier_data.append(supp)
                seen_supplier_ids.add(supp.id)

        if supplier_data:
            supp_columns = [col.name for col in Supplier.__table__.columns]
            supp_data_tuples = [
                tuple(
                    getattr(s, col) if hasattr(s, col) else s[i]
                    for i, col in enumerate(supp_columns)
                )
                for s in supplier_data
            ]
            sql_parts.append(
                self._generate_insert_sql("suppliers", supp_columns, supp_data_tuples)
            )

        # Paso 7: Products
        products_query = (
            select(Product)
            .where(Product.business_id == business_id)
            .order_by(Product.id)
        )
        products_result = await self.db.execute(products_query)
        products = products_result.scalars().all()

        if products:
            prod_columns = [col.name for col in Product.__table__.columns]
            prod_data = [
                tuple(getattr(p, col) for col in prod_columns) for p in products
            ]
            sql_parts.append(
                self._generate_insert_sql("products", prod_columns, prod_data)
            )

        # Paso 8: Price History
        price_history_query = (
            select(PriceHistory)
            .join(Product)
            .where(Product.business_id == business_id)
            .order_by(PriceHistory.id)
        )
        price_history_result = await self.db.execute(price_history_query)
        price_histories = price_history_result.scalars().all()

        if price_histories:
            ph_columns = [col.name for col in PriceHistory.__table__.columns]
            ph_data = [
                tuple(getattr(ph, col) for col in ph_columns) for ph in price_histories
            ]
            sql_parts.append(
                self._generate_insert_sql("price_histories", ph_columns, ph_data)
            )

        # Paso 9: Clients
        clients_query = (
            select(Client).where(Client.business_id == business_id).order_by(Client.id)
        )
        clients_result = await self.db.execute(clients_query)
        clients = clients_result.scalars().all()

        if clients:
            client_columns = [col.name for col in Client.__table__.columns]
            client_data = [
                tuple(getattr(c, col) for col in client_columns) for c in clients
            ]
            sql_parts.append(
                self._generate_insert_sql("clients", client_columns, client_data)
            )

        # Paso 10: Tenant Secrets
        secrets_query = select(TenantSecret).where(
            TenantSecret.business_id == business_id
        )
        secrets_result = await self.db.execute(secrets_query)
        secrets = secrets_result.scalars().all()

        if secrets:
            sec_columns = [col.name for col in TenantSecret.__table__.columns]
            sec_data = [tuple(getattr(s, col) for col in sec_columns) for s in secrets]
            sql_parts.append(
                self._generate_insert_sql("tenant_secrets", sec_columns, sec_data)
            )

        # Paso 11: AI Provider Configs
        ai_configs_query = select(AIProviderConfig).where(
            AIProviderConfig.business_id == business_id
        )
        ai_configs_result = await self.db.execute(ai_configs_query)
        ai_configs = ai_configs_result.scalars().all()

        if ai_configs:
            ai_columns = [col.name for col in AIProviderConfig.__table__.columns]
            ai_data = [tuple(getattr(a, col) for col in ai_columns) for a in ai_configs]
            sql_parts.append(
                self._generate_insert_sql("ai_provider_configs", ai_columns, ai_data)
            )

        # Paso 12: Vouchers
        vouchers_query = (
            select(Voucher)
            .where(Voucher.business_id == business_id)
            .order_by(Voucher.id)
        )
        vouchers_result = await self.db.execute(vouchers_query)
        vouchers = vouchers_result.scalars().all()

        if vouchers:
            voucher_columns = [col.name for col in Voucher.__table__.columns]
            voucher_data = [
                tuple(getattr(v, col) for col in voucher_columns) for v in vouchers
            ]
            sql_parts.append(
                self._generate_insert_sql("vouchers", voucher_columns, voucher_data)
            )

        # Paso 13: Voucher Items
        voucher_items_query = (
            select(VoucherItem)
            .join(Voucher)
            .where(Voucher.business_id == business_id)
            .order_by(VoucherItem.id)
        )
        voucher_items_result = await self.db.execute(voucher_items_query)
        voucher_items = voucher_items_result.scalars().all()

        if voucher_items:
            vi_columns = [col.name for col in VoucherItem.__table__.columns]
            vi_data = [
                tuple(getattr(vi, col) for col in vi_columns) for vi in voucher_items
            ]
            sql_parts.append(
                self._generate_insert_sql("voucher_items", vi_columns, vi_data)
            )

        # Paso 14: Payments
        payments_query = (
            select(Payment)
            .join(Voucher)
            .where(Voucher.business_id == business_id)
            .order_by(Payment.id)
        )
        payments_result = await self.db.execute(payments_query)
        payments = payments_result.scalars().all()

        if payments:
            payment_columns = [col.name for col in Payment.__table__.columns]
            payment_data = [
                tuple(getattr(p, col) for col in payment_columns) for p in payments
            ]
            sql_parts.append(
                self._generate_insert_sql("payments", payment_columns, payment_data)
            )

        # Paso 15: Cash Registers
        cash_registers_query = (
            select(CashRegister)
            .where(CashRegister.business_id == business_id)
            .order_by(CashRegister.id)
        )
        cash_registers_result = await self.db.execute(cash_registers_query)
        cash_registers = cash_registers_result.scalars().all()

        if cash_registers:
            cr_columns = [col.name for col in CashRegister.__table__.columns]
            cr_data = [
                tuple(getattr(cr, col) for col in cr_columns) for cr in cash_registers
            ]
            sql_parts.append(
                self._generate_insert_sql("cash_registers", cr_columns, cr_data)
            )

        # Paso 16: Cash Movements
        cash_movements_query = (
            select(CashMovement)
            .join(CashRegister)
            .where(CashRegister.business_id == business_id)
            .order_by(CashMovement.id)
        )
        cash_movements_result = await self.db.execute(cash_movements_query)
        cash_movements = cash_movements_result.scalars().all()

        if cash_movements:
            cm_columns = [col.name for col in CashMovement.__table__.columns]
            cm_data = [
                tuple(getattr(cm, col) for col in cm_columns) for cm in cash_movements
            ]
            sql_parts.append(
                self._generate_insert_sql("cash_movements", cm_columns, cm_data)
            )

        # Paso 17: Purchase Orders
        po_query = (
            select(PurchaseOrder)
            .where(PurchaseOrder.business_id == business_id)
            .order_by(PurchaseOrder.id)
        )
        po_result = await self.db.execute(po_query)
        pos = po_result.scalars().all()

        if pos:
            po_columns = [col.name for col in PurchaseOrder.__table__.columns]
            po_data = [tuple(getattr(p, col) for col in po_columns) for p in pos]
            sql_parts.append(
                self._generate_insert_sql("purchase_orders", po_columns, po_data)
            )

        # Paso 18: Purchase Order Items
        po_items_query = (
            select(PurchaseOrderItem)
            .join(PurchaseOrder)
            .where(PurchaseOrder.business_id == business_id)
            .order_by(PurchaseOrderItem.id)
        )
        po_items_result = await self.db.execute(po_items_query)
        po_items = po_items_result.scalars().all()

        if po_items:
            poi_columns = [col.name for col in PurchaseOrderItem.__table__.columns]
            poi_data = [
                tuple(getattr(poi, col) for col in poi_columns) for poi in po_items
            ]
            sql_parts.append(
                self._generate_insert_sql("purchase_order_items", poi_columns, poi_data)
            )

        sql_parts.append("")
        sql_parts.append("-- =======================================================")
        sql_parts.append("-- END BACKUP SQL FOR BUSINESS")
        sql_parts.append("-- =======================================================")

        return "\n".join(sql_parts)

    async def import_products_from_sql(
        self, business_id: UUID, sql_content: str
    ) -> dict:
        """
        Importa productos desde SQL.
        Ejecuta los INSERT statements encontrados en el contenido.
        Solo importa productos, categorías y proveedores relacionados.
        """
        import re

        errors = []
        imported_products = 0
        imported_categories = 0
        imported_suppliers = 0

        # Patrón más robusto para parsear INSERT statements completos
        insert_pattern = re.compile(
            r"INSERT\s+INTO\s+(products|categories|suppliers)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*;",
            re.IGNORECASE | re.DOTALL,
        )

        # Extraer todos los INSERTs del SQL
        inserts = [m.groups() for m in insert_pattern.finditer(sql_content)]

        logger.info(f"Found {len(inserts)} INSERT statements for SQL import")

        # Log sample de SQL para debug
        sample_sql = sql_content[:500] if sql_content else "empty"
        logger.info(f"SQL sample: {sample_sql}")

        # Ver primeras para debug
        for i, (table, cols, vals) in enumerate(inserts[:3]):
            logger.info(f"  {i}: table={table}, columns={cols[:50]}...")

        if not inserts:
            return {
                "imported": 0,
                "imported_categories": 0,
                "imported_suppliers": 0,
                "errors": [
                    "No se encontraron INSERT válidos para products/categories/suppliers"
                ],
                "total_errors": 1,
            }

        # Crear mappings de datos
        category_map = {}  # old_id -> new_id
        supplier_map = {}  # old_id -> new_id
        # Primera pasada: importar categorías y suppliers (necesarios para productos)
        for table_name, columns_str, values_str in inserts:
            columns = [c.strip() for c in columns_str.split(",")]

            # Parsear valores
            values = self._parse_sql_values(values_str)

            # Crear diccionario de datos
            data = dict(zip(columns, values))

            logger.debug(f"Processing {table_name}: {list(data.keys())}")

            if table_name.lower() == "categories":
                try:
                    async with self.db.begin_nested():
                        # Crear nueva categoría
                        new_category = Category(
                            name=(
                                self._sql_to_text(data.get("name"))
                                or self._sql_to_text(data.get("description"))
                                or "Sin categoría"
                            ),
                            description=self._sql_to_text(data.get("description")),
                            business_id=business_id,
                            created_at=datetime.utcnow(),
                            updated_at=datetime.utcnow(),
                            deleted_at=None,
                        )
                        self.db.add(new_category)
                        await self.db.flush()

                        # Mapear IDs
                        if "id" in data and self._sql_to_uuid_str(data["id"]):
                            category_map[self._sql_to_uuid_str(data["id"])] = (
                                new_category.id
                            )

                    imported_categories += 1
                except Exception as e:
                    errors.append(f"Error importando categoría: {str(e)}")

            elif table_name.lower() == "suppliers":
                try:
                    async with self.db.begin_nested():
                        # Crear nuevo supplier
                        new_supplier = Supplier(
                            name=self._sql_to_text(data.get("name")) or "Sin proveedor",
                            cuit=self._sql_to_text(data.get("cuit")),
                            contact_name=self._sql_to_text(data.get("contact_name")),
                            phone=self._sql_to_text(data.get("phone")),
                            email=self._sql_to_text(data.get("email")),
                            address=self._sql_to_text(data.get("address")),
                            city=self._sql_to_text(data.get("city")),
                            province=self._sql_to_text(data.get("province")),
                            notes=self._sql_to_text(data.get("notes")),
                            default_discount_1=self._sql_to_decimal(
                                data.get("default_discount_1"), Decimal("0")
                            ),
                            default_discount_2=self._sql_to_decimal(
                                data.get("default_discount_2"), Decimal("0")
                            ),
                            default_discount_3=self._sql_to_decimal(
                                data.get("default_discount_3"), Decimal("0")
                            ),
                            business_id=business_id,
                            created_at=datetime.utcnow(),
                            updated_at=datetime.utcnow(),
                            deleted_at=None,
                        )
                        self.db.add(new_supplier)
                        await self.db.flush()

                        # Mapear IDs
                        if "id" in data and self._sql_to_uuid_str(data["id"]):
                            supplier_map[self._sql_to_uuid_str(data["id"])] = (
                                new_supplier.id
                            )

                    imported_suppliers += 1
                except Exception as e:
                    errors.append(f"Error importando supplier: {str(e)}")

        # Segunda pasada: importar productos
        for table_name, columns_str, values_str in inserts:
            if table_name.lower() != "products":
                continue

            columns = [c.strip() for c in columns_str.split(",")]
            values = self._parse_sql_values(values_str)
            data = dict(zip(columns, values))

            try:
                # Mapear category_id y supplier_id a los nuevos IDs
                old_category_id = self._sql_to_uuid_str(data.get("category_id"))
                old_supplier_id = self._sql_to_uuid_str(data.get("supplier_id"))

                new_category_id = None
                new_supplier_id = None

                if old_category_id and old_category_id in category_map:
                    new_category_id = category_map[old_category_id]

                if old_supplier_id and old_supplier_id in supplier_map:
                    new_supplier_id = supplier_map[old_supplier_id]

                # Mapear campos del SQL al modelo de Producto
                # El SQL puede tener: description, unit_price, cost_price, stock,
                # min_stock, max_stock, location, image_url, is_active
                # El modelo espera: description, list_price, cost_price, current_stock,
                # minimum_stock, unit, is_active, etc.

                list_price = self._sql_to_decimal(
                    data.get("list_price") or data.get("unit_price"), Decimal("0")
                )
                cost_price = self._sql_to_decimal(data.get("cost_price"), Decimal("0"))

                # Obtener valores numéricos
                stock_val = self._sql_to_int(
                    data.get("current_stock") or data.get("stock"), 0
                )
                min_stock_val = self._sql_to_int(
                    data.get("minimum_stock") or data.get("min_stock"), 0
                )

                # Crear nuevo producto
                async with self.db.begin_nested():
                    new_product = Product(
                        code=self._sql_to_text(data.get("code"))
                        or f"IMP-{imported_products + 1}",
                        # Compatibilidad: dumps viejos traen `barcode` pero el modelo actual no tiene esa columna.
                        # Lo mapeamos a supplier_code si supplier_code no viene informado.
                        supplier_code=(
                            self._sql_to_text(data.get("supplier_code"))
                            or self._sql_to_text(data.get("barcode"))
                        ),
                        description=self._sql_to_text(data.get("description"))
                        or self._sql_to_text(data.get("name"))
                        or "Sin descripción",
                        details=self._sql_to_text(data.get("details")),
                        brand=self._sql_to_text(data.get("brand")),
                        line=self._sql_to_text(data.get("line")),
                        application_area=self._sql_to_text(
                            data.get("application_area")
                        ),
                        finish=self._sql_to_text(data.get("finish")),
                        quality_tier=self._sql_to_text(data.get("quality_tier")),
                        attributes_json=self._sql_to_text(data.get("attributes_json")),
                        customer_terms=self._sql_to_text(data.get("customer_terms")),
                        list_price=list_price,
                        cost_price=cost_price,
                        discount_1=self._sql_to_decimal(
                            data.get("discount_1"), Decimal("0")
                        ),
                        discount_2=self._sql_to_decimal(
                            data.get("discount_2"), Decimal("0")
                        ),
                        discount_3=self._sql_to_decimal(
                            data.get("discount_3"), Decimal("0")
                        ),
                        discount_display=self._sql_to_text(
                            data.get("discount_display")
                        ),
                        extra_cost=self._sql_to_decimal(
                            data.get("extra_cost"), Decimal("0")
                        ),
                        profit_margin=self._sql_to_decimal(
                            data.get("profit_margin"), Decimal("0")
                        ),
                        net_price=self._sql_to_decimal(
                            data.get("net_price"), list_price
                        ),
                        sale_price=self._sql_to_decimal(
                            data.get("sale_price"), list_price
                        ),
                        iva_rate=self._sql_to_decimal(
                            data.get("iva_rate"), Decimal("21")
                        ),
                        current_stock=stock_val,
                        minimum_stock=min_stock_val,
                        unit=self._sql_to_text(data.get("unit")) or "unidad",
                        is_active=self._sql_to_bool(data.get("is_active"), True),
                        business_id=business_id,
                        category_id=new_category_id,
                        supplier_id=new_supplier_id,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                        deleted_at=None,
                    )
                    # Recalcular para mantener consistencia con reglas del dominio
                    new_product.calculate_prices()

                    self.db.add(new_product)
                    await self.db.flush()
                imported_products += 1

            except Exception as e:
                errors.append(
                    f"Error importando producto {data.get('code', data.get('name', 'unknown'))}: {str(e)}"
                )

        # Commit final
        await self.db.commit()

        return {
            "imported": imported_products,
            "imported_categories": imported_categories,
            "imported_suppliers": imported_suppliers,
            "errors": errors[:20]
            if len(errors) > 20
            else errors,  # limitar a 20 errores
            "total_errors": len(errors),
        }

    def _sql_to_text(self, value):
        if value is None:
            return None
        v = str(value).strip()
        if not v or v.upper() == "NULL":
            return None
        return v

    def _sql_to_uuid_str(self, value):
        text_value = self._sql_to_text(value)
        return text_value

    def _sql_to_bool(self, value, default: bool = False) -> bool:
        if value is None:
            return default
        v = str(value).strip().upper()
        if v in {"TRUE", "T", "1", "YES", "Y"}:
            return True
        if v in {"FALSE", "F", "0", "NO", "N", "NULL", ""}:
            return False
        return default

    def _sql_to_int(self, value, default: int = 0) -> int:
        text_value = self._sql_to_text(value)
        if text_value is None:
            return default
        try:
            return int(float(text_value))
        except Exception:
            return default

    def _sql_to_decimal(self, value, default: Decimal = Decimal("0")) -> Decimal:
        text_value = self._sql_to_text(value)
        if text_value is None:
            return default
        try:
            return Decimal(str(text_value))
        except Exception:
            return default

    def _parse_sql_values(self, values_str: str) -> list:
        """Parsea los valores de un SQL INSERT."""
        import re

        values = []
        current = ""
        in_string = False
        escape_next = False

        for char in values_str:
            if escape_next:
                current += char
                escape_next = False
                continue

            if char == "\\":
                escape_next = True
                continue

            if char == "'":
                in_string = not in_string
                current += char
            elif char == "," and not in_string:
                values.append(current.strip())
                current = ""
            else:
                current += char

        if current.strip():
            values.append(current.strip())

        # Limpiar valores
        cleaned = []
        for v in values:
            v = v.strip()
            # Remover comillas externas si es string
            if len(v) >= 2:
                if (v.startswith("'") and v.endswith("'")) or (
                    v.startswith('"') and v.endswith('"')
                ):
                    v = v[1:-1]
            # Reemplazar escapes de comillas
            v = v.replace("''", "'")
            cleaned.append(v)

        return cleaned
