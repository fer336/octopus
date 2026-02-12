"""
Servicio de Importación/Exportación Excel.
Maneja la carga masiva de productos.
"""
import io
from decimal import Decimal
from typing import BinaryIO, List, Tuple
from uuid import UUID

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.category import Category
from app.models.supplier import Supplier
from app.schemas.product import ProductCreate, ProductUpdate
from app.schemas.excel_schemas import ProductImportRow, ImportPreviewResponse, ImportConfirmRequest, ImportConfirmResponse


class ExcelService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _parse_discounts(self, discounts_str: str) -> Tuple[Decimal, Decimal, Decimal]:
        """Parsea el string de descuentos (ej: '10+5+2') en tres valores."""
        if not discounts_str or pd.isna(discounts_str):
            return Decimal(0), Decimal(0), Decimal(0)
        
        discounts_str = str(discounts_str).strip()
        if not discounts_str or discounts_str == '0':
            return Decimal(0), Decimal(0), Decimal(0)
        
        try:
            parts = discounts_str.replace(',', '.').split('+')
            discounts = []
            for part in parts[:3]:  # Solo tomar los primeros 3
                part = part.strip()
                if part:
                    discounts.append(Decimal(part))
            
            d1 = discounts[0] if len(discounts) > 0 else Decimal(0)
            d2 = discounts[1] if len(discounts) > 1 else Decimal(0)
            d3 = discounts[2] if len(discounts) > 2 else Decimal(0)
            
            return d1, d2, d3
        except (ValueError, IndexError):
            return Decimal(0), Decimal(0), Decimal(0)
    
    def _calculate_prices(self, list_price: Decimal, d1: Decimal, d2: Decimal, d3: Decimal, 
                         extra_cost: Decimal, iva_rate: Decimal) -> Tuple[Decimal, Decimal, str]:
        """Calcula precio neto y final, igual que el modelo Product."""
        # Precio con bonificaciones (neto base)
        net_base = list_price * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
        
        # Aplicar cargo extra sobre el neto
        net_with_extra = net_base * (1 + extra_cost / 100)
        
        # Precio final con IVA
        sale = net_with_extra * (1 + iva_rate / 100)
        
        net_price = round(net_with_extra, 2)
        sale_price = round(sale, 2)
        
        # Formato de descuento para mostrar
        discounts = [d for d in [d1, d2, d3] if d > 0]
        discount_display = "+".join([str(int(d)) for d in discounts]) if discounts else None
        
        return net_price, sale_price, discount_display

    async def preview_import(self, business_id: UUID, file_content: bytes) -> ImportPreviewResponse:
        """
        Parsea el Excel y retorna un preview de los productos a importar.
        Incluye validaciones y cálculos de precios.
        """
        try:
            df = pd.read_excel(io.BytesIO(file_content))
        except Exception as e:
            raise ValueError(f"Error al leer el archivo Excel: {str(e)}")
        
        # Validar columnas requeridas
        required_cols = ['codigo', 'nombre', 'precio_lista']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Faltan columnas requeridas: {', '.join(missing_cols)}")
        
        # Obtener todas las categorías y proveedores para mapeo
        categories_query = select(Category).where(Category.deleted_at.is_(None))
        categories_result = await self.db.execute(categories_query)
        categories = {cat.name.lower(): cat for cat in categories_result.scalars().all()}
        
        suppliers_query = select(Supplier).where(Supplier.deleted_at.is_(None))
        suppliers_result = await self.db.execute(suppliers_query)
        suppliers = {sup.name.lower(): sup for sup in suppliers_result.scalars().all()}
        
        rows: List[ProductImportRow] = []
        valid_count = 0
        error_count = 0
        new_count = 0
        existing_count = 0
        
        for index, row in df.iterrows():
            row_number = index + 2  # +2 porque Excel empieza en 1 y la fila 1 es header
            
            code = str(row.get('codigo', '')).strip()
            if not code:
                rows.append(ProductImportRow(
                    row_number=row_number,
                    code="",
                    description="",
                    has_errors=True,
                    error_message="El código es obligatorio"
                ))
                error_count += 1
                continue
            
            description = str(row.get('nombre', '')).strip()
            if not description:
                rows.append(ProductImportRow(
                    row_number=row_number,
                    code=code,
                    description="",
                    has_errors=True,
                    error_message="La descripción es obligatoria"
                ))
                error_count += 1
                continue
            
            # Parsear campos
            try:
                supplier_code = str(row.get('codigo_proveedor', '')) if pd.notna(row.get('codigo_proveedor')) else None
                list_price = Decimal(str(row.get('precio_lista', 0)))
                
                if list_price <= 0:
                    raise ValueError("El precio de lista debe ser mayor a 0")
                
                d1, d2, d3 = self._parse_discounts(row.get('bonificaciones', ''))
                extra_cost = Decimal(str(row.get('cargo_extra', 0))) if pd.notna(row.get('cargo_extra')) else Decimal(0)
                iva_rate = Decimal(str(row.get('iva', 21))) if pd.notna(row.get('iva')) else Decimal(21)
                current_stock = int(row.get('stock', 0)) if pd.notna(row.get('stock')) else 0
                
                # Calcular precios
                net_price, sale_price, discount_display = self._calculate_prices(
                    list_price, d1, d2, d3, extra_cost, iva_rate
                )
                
                # Buscar categoría si se especifica
                category_id = None
                category_name = None
                if pd.notna(row.get('categoria')):
                    cat_name = str(row.get('categoria')).strip().lower()
                    category = categories.get(cat_name)
                    if category:
                        category_id = category.id
                        category_name = category.name
                
                # Buscar proveedor si se especifica
                supplier_id = None
                supplier_name = None
                if pd.notna(row.get('proveedor')):
                    sup_name = str(row.get('proveedor')).strip().lower()
                    supplier = suppliers.get(sup_name)
                    if supplier:
                        supplier_id = supplier.id
                        supplier_name = supplier.name
                
                # Verificar si el producto ya existe
                existing_query = select(Product).where(
                    Product.code == code,
                    Product.business_id == business_id,
                    Product.deleted_at.is_(None)
                )
                existing_result = await self.db.execute(existing_query)
                existing_product = existing_result.scalar_one_or_none()
                
                is_new = existing_product is None
                existing_id = existing_product.id if existing_product else None
                
                if is_new:
                    new_count += 1
                else:
                    existing_count += 1
                
                rows.append(ProductImportRow(
                    row_number=row_number,
                    code=code,
                    supplier_code=supplier_code,
                    description=description,
                    category_id=category_id,
                    category_name=category_name,
                    supplier_id=supplier_id,
                    supplier_name=supplier_name,
                    list_price=list_price,
                    discount_1=d1,
                    discount_2=d2,
                    discount_3=d3,
                    extra_cost=extra_cost,
                    iva_rate=iva_rate,
                    current_stock=current_stock,
                    net_price=net_price,
                    sale_price=sale_price,
                    discount_display=discount_display,
                    has_errors=False,
                    is_new=is_new,
                    existing_id=existing_id
                ))
                valid_count += 1
                
            except Exception as e:
                rows.append(ProductImportRow(
                    row_number=row_number,
                    code=code,
                    description=description,
                    has_errors=True,
                    error_message=f"Error al procesar: {str(e)}"
                ))
                error_count += 1
        
        return ImportPreviewResponse(
            total_rows=len(df),
            valid_rows=valid_count,
            rows_with_errors=error_count,
            new_products=new_count,
            existing_products=existing_count,
            rows=rows
        )
    
    async def confirm_import(self, business_id: UUID, request: ImportConfirmRequest) -> ImportConfirmResponse:
        """
        Confirma la importación de productos después del preview.
        Crea/actualiza productos en la base de datos.
        """
        created = 0
        updated = 0
        errors: List[str] = []
        
        for row in request.rows:
            # Saltar filas con errores
            if row.has_errors:
                errors.append(f"Fila {row.row_number}: {row.error_message}")
                continue
            
            try:
                if row.is_new:
                    # Crear nuevo producto
                    new_product = Product(
                        business_id=business_id,
                        code=row.code,
                        supplier_code=row.supplier_code,
                        description=row.description,
                        category_id=row.category_id,
                        supplier_id=row.supplier_id,
                        list_price=row.list_price,
                        discount_1=row.discount_1,
                        discount_2=row.discount_2,
                        discount_3=row.discount_3,
                        extra_cost=row.extra_cost,
                        iva_rate=row.iva_rate,
                        current_stock=row.current_stock,
                        cost_price=Decimal(0),  # Se puede calcular después
                    )
                    new_product.calculate_prices()
                    self.db.add(new_product)
                    created += 1
                else:
                    # Actualizar producto existente
                    if row.existing_id:
                        query = select(Product).where(Product.id == row.existing_id)
                        result = await self.db.execute(query)
                        existing_product = result.scalar_one_or_none()
                        
                        if existing_product:
                            existing_product.code = row.code
                            existing_product.supplier_code = row.supplier_code
                            existing_product.description = row.description
                            existing_product.category_id = row.category_id
                            existing_product.supplier_id = row.supplier_id
                            existing_product.list_price = row.list_price
                            existing_product.discount_1 = row.discount_1
                            existing_product.discount_2 = row.discount_2
                            existing_product.discount_3 = row.discount_3
                            existing_product.extra_cost = row.extra_cost
                            existing_product.iva_rate = row.iva_rate
                            existing_product.current_stock = row.current_stock
                            existing_product.calculate_prices()
                            updated += 1
                        else:
                            errors.append(f"Fila {row.row_number}: Producto existente no encontrado")
            except Exception as e:
                errors.append(f"Fila {row.row_number}: {str(e)}")
        
        await self.db.commit()
        
        return ImportConfirmResponse(
            created=created,
            updated=updated,
            errors=errors
        )
    
    async def import_products(self, business_id: UUID, file_content: bytes) -> dict:
        """
        Importa productos desde un archivo Excel.
        Retorna un resumen de la operación.
        """
        try:
            df = pd.read_excel(io.BytesIO(file_content))
        except Exception as e:
            raise ValueError(f"Error al leer el archivo Excel: {str(e)}")

        # Normalizar columnas
        # Mapeo esperado:
        # codigo -> code
        # codigo_proveedor -> supplier_code
        # nombre -> description
        # stock -> current_stock
        # precio_lista -> list_price
        # bonificaciones -> discount_display (se debe parsear)
        # cargo_extra -> extra_cost
        
        column_map = {
            'codigo': 'code',
            'codigo_proveedor': 'supplier_code',
            'nombre': 'description',
            'stock': 'current_stock',
            'precio_lista': 'list_price',
            'bonificaciones': 'discounts',
            'cargo_extra': 'extra_cost'
        }
        
        # Validar columnas requeridas
        required_cols = ['codigo', 'nombre', 'precio_lista']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Faltan columnas requeridas: {', '.join(missing_cols)}")

        summary = {
            "processed": 0,
            "created": 0,
            "updated": 0,
            "errors": []
        }

        for index, row in df.iterrows():
            summary["processed"] += 1
            try:
                code = str(row.get('codigo', '')).strip()
                if not code:
                    continue

                # Parsear descuentos
                discounts_str = str(row.get('bonificaciones', '0'))
                discounts = [Decimal(d.strip()) for d in discounts_str.split('+') if d.strip().replace('.', '', 1).isdigit()]
                
                d1 = discounts[0] if len(discounts) > 0 else Decimal(0)
                d2 = discounts[1] if len(discounts) > 1 else Decimal(0)
                d3 = discounts[2] if len(discounts) > 2 else Decimal(0)

                # Datos del producto
                product_data = {
                    "code": code,
                    "supplier_code": str(row.get('codigo_proveedor', '')) if pd.notna(row.get('codigo_proveedor')) else None,
                    "description": str(row.get('nombre', '')),
                    "current_stock": int(row.get('stock', 0)) if pd.notna(row.get('stock')) else 0,
                    "list_price": Decimal(str(row.get('precio_lista', 0))),
                    "discount_1": d1,
                    "discount_2": d2,
                    "discount_3": d3,
                    "extra_cost": Decimal(str(row.get('cargo_extra', 0))) if pd.notna(row.get('cargo_extra')) else Decimal(0),
                    "iva_rate": Decimal("21.00"), # Default
                    "business_id": business_id
                }

                # Buscar si existe
                query = select(Product).where(
                    Product.code == code,
                    Product.business_id == business_id,
                    Product.deleted_at.is_(None)
                )
                result = await self.db.execute(query)
                existing_product = result.scalar_one_or_none()

                if existing_product:
                    # Actualizar
                    for key, value in product_data.items():
                        if key != "business_id":
                            setattr(existing_product, key, value)
                    
                    existing_product.calculate_prices()
                    summary["updated"] += 1
                else:
                    # Crear
                    new_product = Product(**product_data)
                    new_product.calculate_prices()
                    self.db.add(new_product)
                    summary["created"] += 1

            except Exception as e:
                summary["errors"].append(f"Fila {index + 2}: {str(e)}")

        await self.db.commit()
        return summary

    async def export_products(self, business_id: UUID) -> bytes:
        """
        Exporta productos a Excel con formato profesional.
        Solo incluye las columnas esenciales para importación.
        """
        from sqlalchemy.orm import selectinload
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        
        # Obtener productos con relaciones cargadas
        query = (
            select(Product)
            .options(
                selectinload(Product.category),
                selectinload(Product.supplier)
            )
            .where(
                Product.business_id == business_id,
                Product.deleted_at.is_(None)
            )
            .order_by(Product.code)
        )
        
        result = await self.db.execute(query)
        products = result.scalars().all()

        # Crear workbook manualmente para control total del formato
        wb = Workbook()
        ws = wb.active
        ws.title = "Productos"
        
        # Definir columnas (EXACTAMENTE las que pediste)
        headers = [
            'codigo', 'codigo_proveedor', 'nombre', 'categoria_id', 
            'proveedor_id', 'precio_lista', 'descuento_suma', 'cargo_extra',
            'precio_venta', 'iva', 'stock_actual'
        ]
        
        # Escribir headers con estilo
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.font = Font(bold=True, color="FFFFFF", size=11)
            cell.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = Border(
                left=Side(style='thin'),
                right=Side(style='thin'),
                top=Side(style='thin'),
                bottom=Side(style='thin')
            )
        
        # Escribir datos
        for row_idx, p in enumerate(products, 2):
            # Calcular descuento_suma (suma simple de descuentos)
            descuento_suma = float(p.discount_1 or 0) + float(p.discount_2 or 0) + float(p.discount_3 or 0)
            
            row_data = [
                p.code or '',
                p.supplier_code or '',
                p.description or '',
                str(p.category_id) if p.category_id else '',
                str(p.supplier_id) if p.supplier_id else '',
                float(p.list_price) if p.list_price else 0.0,
                descuento_suma,
                float(p.extra_cost) if p.extra_cost else 0.0,
                float(p.sale_price) if p.sale_price else 0.0,
                float(p.iva_rate) if p.iva_rate else 21.0,
                int(p.current_stock) if p.current_stock else 0,
            ]
            
            for col_idx, value in enumerate(row_data, 1):
                cell = ws.cell(row=row_idx, column=col_idx, value=value)
                
                # Alineación según tipo
                if col_idx == 3:  # nombre
                    cell.alignment = Alignment(horizontal="left", vertical="center")
                elif col_idx in [1, 2, 4, 5]:  # códigos e IDs
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:  # números
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                
                # Formato de números
                if col_idx in [6, 8, 9]:  # precios
                    cell.number_format = '#,##0.00'
                elif col_idx in [7]:  # descuento_suma
                    cell.number_format = '0.00'
                elif col_idx in [11]:  # stock
                    cell.number_format = '0'
                
                # Bordes
                cell.border = Border(
                    left=Side(style='thin', color='D9D9D9'),
                    right=Side(style='thin', color='D9D9D9'),
                    top=Side(style='thin', color='D9D9D9'),
                    bottom=Side(style='thin', color='D9D9D9')
                )
                
                # Alternar color de filas
                if row_idx % 2 == 0:
                    cell.fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
        
        # Ajustar anchos de columna
        column_widths = {
            'A': 15,  # codigo
            'B': 18,  # codigo_proveedor
            'C': 40,  # nombre
            'D': 10,  # categoria_id (mismo que iva)
            'E': 10,  # proveedor_id (mismo que iva)
            'F': 15,  # precio_lista
            'G': 16,  # descuento_suma
            'H': 14,  # cargo_extra
            'I': 15,  # precio_venta
            'J': 10,  # iva
            'K': 14,  # stock_actual
        }
        
        for col, width in column_widths.items():
            ws.column_dimensions[col].width = width
        
        # Freeze primera fila (header)
        ws.freeze_panes = "A2"
        
        # Guardar a BytesIO
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        return output.getvalue()
    
    async def export_full_backup(self, business_id: UUID) -> bytes:
        """
        Exporta TODOS los productos (incluso eliminados) como backup completo de la DB.
        Incluye TODOS los campos para poder restaurar.
        """
        from sqlalchemy.orm import selectinload
        
        # Obtener TODOS los productos, incluso los eliminados
        query = (
            select(Product)
            .options(
                selectinload(Product.category),
                selectinload(Product.supplier)
            )
            .where(Product.business_id == business_id)
            .order_by(Product.created_at)
        )
        
        result = await self.db.execute(query)
        products = result.scalars().all()

        data = []
        for p in products:
            data.append({
                'id': str(p.id),
                'codigo': p.code,
                'codigo_proveedor': p.supplier_code or '',
                'nombre': p.description,
                'detalles': p.details or '',
                'categoria': p.category.name if p.category else '',
                'categoria_id': str(p.category_id) if p.category_id else '',
                'proveedor': p.supplier.name if p.supplier else '',
                'proveedor_id': str(p.supplier_id) if p.supplier_id else '',
                'precio_costo': float(p.cost_price),
                'precio_lista': float(p.list_price),
                'descuento_1': float(p.discount_1),
                'descuento_2': float(p.discount_2),
                'descuento_3': float(p.discount_3),
                'bonificaciones': p.discount_display or "0",
                'cargo_extra': float(p.extra_cost),
                'precio_neto': float(p.net_price),
                'precio_venta': float(p.sale_price),
                'iva': float(p.iva_rate),
                'stock_actual': p.current_stock,
                'stock_minimo': p.minimum_stock,
                'unidad': p.unit,
                'activo': p.is_active,
                'fecha_creacion': p.created_at.isoformat() if p.created_at else '',
                'fecha_actualizacion': p.updated_at.isoformat() if p.updated_at else '',
                'fecha_eliminacion': p.deleted_at.isoformat() if p.deleted_at else '',
            })

        df = pd.DataFrame(data)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Backup_Productos')
        
        return output.getvalue()
    
    async def delete_all_products(self, business_id: UUID) -> dict:
        """
        Elimina TODOS los productos de un negocio (soft delete).
        Retorna un resumen de la operación.
        """
        from datetime import datetime
        
        query = select(Product).where(
            Product.business_id == business_id,
            Product.deleted_at.is_(None)
        )
        
        result = await self.db.execute(query)
        products = result.scalars().all()
        
        count = 0
        now = datetime.utcnow()
        
        for product in products:
            product.deleted_at = now
            count += 1
        
        await self.db.commit()
        
        return {
            "deleted_count": count,
            "message": f"Se eliminaron {count} productos correctamente"
        }
