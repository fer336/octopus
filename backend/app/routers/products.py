"""
Router de Productos.
Endpoints para gestión de productos e inventario.
"""

import io
import math
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.base import MessageResponse, PaginatedResponse
from app.schemas.excel_schemas import (
    ImportConfirmRequest,
    ImportConfirmResponse,
    ImportPreviewResponse,
)
from app.schemas.price_update import (
    ExcelPriceUpdateColumnPreviewResponse,
    ExcelPriceUpdateMappingRequest,
    ExcelPriceUpdatePreviewItem,
    ExcelPriceUpdatePreviewResponse,
    FieldToUpdate,
    PriceUpdateApplyResponse,
    PriceUpdatePreviewItem,
    PriceUpdatePreviewResponse,
    PriceUpdateRequest,
    UpdateType,
)
from app.schemas.price_history import PriceHistoryResponse, PriceRestoreRequest, PriceRestoreResponse
from app.schemas.price_sync import SyncPriceFromLotRequest, SyncPriceFromLotResponse
from app.schemas.product import (
    ProductBulkUpdateRequest,
    ProductBulkUpdateResponse,
    ProductCreate,
    ProductListParams,
    ProductResponse,
    ProductUpdate,
    StockDeltaRequest,
    StockDeltaResponse,
    StockDeltaResult,
)
from app.services.backup_service import BackupService
from app.services.excel_service import ExcelService
from app.services.product_lot_service import ProductLotService
from app.services.product_service import ProductService
from app.utils.security import (
    get_current_business,
    get_current_user,
    require_module_access,
)

router = APIRouter(
    prefix="/products",
    tags=["Productos"],
    dependencies=[Depends(require_module_access("products"))],
)


def _clean_excel_value(value: Any) -> Any:
    """Normaliza valores de pandas para poder serializarlos como JSON."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _parse_excel_price(value: Any) -> Decimal:
    """Parsea precios de Excel tolerando moneda, puntos de miles y coma decimal."""
    if value is None:
        raise ValueError("Precio vacío")

    raw = str(value).strip()
    if not raw:
        raise ValueError("Precio vacío")

    normalized = raw.replace("$", "").replace(" ", "")
    if "," in normalized and "." in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    else:
        normalized = normalized.replace(",", ".")

    price = Decimal(normalized)
    if price <= 0:
        raise ValueError("El precio debe ser mayor a 0")
    return price


def _preview_product_sale_price(product: Product, list_price: Decimal) -> Decimal:
    """Calcula el precio final reutilizando Product.calculate_prices sin persistir cambios."""
    original_values = {
        "list_price": product.list_price,
        "net_price": product.net_price,
        "sale_price": product.sale_price,
        "discount_display": product.discount_display,
    }

    product.list_price = list_price
    product.calculate_prices()
    new_sale_price = Decimal(str(product.sale_price))

    for field, value in original_values.items():
        setattr(product, field, value)

    return new_sale_price


@router.delete("/test-delete")
async def test_delete_endpoint(
    current_user=Depends(get_current_user),
):
    """Endpoint de test para verificar que el auth funciona en DELETE."""
    import logging

    logger = logging.getLogger("uvicorn")
    logger.info(f"TEST DELETE - user: {current_user.email}")

    return {
        "status": "ok",
        "user_email": current_user.email,
        "message": "Test exitoso - Auth funciona",
    }


@router.delete("/test-delete-2")
async def test_delete_endpoint_2():
    """Endpoint de test SIN autenticación."""
    import logging

    logger = logging.getLogger("uvicorn")
    logger.info("TEST DELETE 2 - SIN AUTH")

    return {"status": "ok", "message": "Test exitoso sin auth"}


@router.post("/bulk-delete-alt")
async def bulk_delete_alt(
    current_user=Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """ALTERNATIVA: Usa POST en vez de DELETE para evitar problemas de CORS."""
    import logging
    from datetime import datetime

    logger = logging.getLogger("uvicorn")
    logger.info("=== BULK DELETE ALT (POST) START ===")

    try:
        logger.info(f"User: {current_user.email} | Business ID: {business_id}")

        # Obtener productos
        products_query = select(Product).where(
            Product.business_id == business_id, Product.deleted_at.is_(None)
        )
        products_result = await db.execute(products_query)
        products = products_result.scalars().all()

        # Eliminar
        count = 0
        now = datetime.utcnow()
        for product in products:
            product.deleted_at = now
            count += 1

        await db.commit()
        logger.info(f"=== DELETED {count} PRODUCTS ===")

        return {
            "deleted_count": count,
            "message": f"Se eliminaron {count} productos correctamente",
        }

    except Exception as e:
        logger.error(f"ERROR: {str(e)}", exc_info=True)
        await db.rollback()
        return {"deleted_count": 0, "message": f"Error: {str(e)}"}


@router.get("", response_model=PaginatedResponse[ProductResponse])
async def list_products(
    search: str | None = Query(None, description="Buscar por código o descripción"),
    category_id: UUID | None = Query(None, description="Filtrar por categoría"),
    supplier_id: UUID | None = Query(None, description="Filtrar por proveedor"),
    brand: str | None = Query(None, description="Filtrar por marca"),
    line: str | None = Query(None, description="Filtrar por línea"),
    application_area: str | None = Query(
        None, description="Filtrar por aplicación/uso (lavatorio, bidet, etc.)"
    ),
    finish: str | None = Query(None, description="Filtrar por terminación"),
    quality_tier: str | None = Query(
        None, description="Filtrar por nivel de calidad"
    ),
    is_active: bool | None = Query(True, description="Filtrar por estado activo"),
    low_stock: bool | None = Query(
        None, description="Filtrar productos con stock bajo"
    ),
    sort_by: str = Query(
        "description",
        pattern="^(description|sale_price|current_stock)$",
        description="Campo de ordenamiento",
    ),
    sort_order: str = Query(
        "asc",
        pattern="^(asc|desc)$",
        description="Dirección de ordenamiento",
    ),
    page: int = Query(1, ge=1, description="Número de página"),
    per_page: int = Query(20, ge=1, le=100, description="Elementos por página"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Lista productos con paginación, búsqueda y filtros.
    Busca en: código interno, código de proveedor y descripción.
    """
    service = ProductService(db)
    params = ProductListParams(
        search=search,
        category_id=category_id,
        supplier_id=supplier_id,
        brand=brand,
        line=line,
        application_area=application_area,
        finish=finish,
        quality_tier=quality_tier,
        is_active=is_active,
        low_stock=low_stock,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )

    products, total = await service.list(business_id, params)
    pages = (total + per_page - 1) // per_page if per_page else 0

    return PaginatedResponse(
        items=[ProductResponse.model_validate(p) for p in products],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Crea un nuevo producto."""
    service = ProductService(db)

    # Verificar si el código ya existe
    existing = await service.get_by_code(data.code, business_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ya existe un producto con el código '{data.code}'",
        )

    product = await service.create(business_id, data)
    return ProductResponse.model_validate(product)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene un producto por ID."""
    service = ProductService(db)
    product = await service.get_by_id(product_id, business_id)

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    return ProductResponse.model_validate(product)


@router.post("/bulk-update", response_model=ProductBulkUpdateResponse)
async def bulk_update_products(
    data: ProductBulkUpdateRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Actualiza varios productos en una sola transacción."""
    service = ProductService(db)
    products, not_found_ids = await service.bulk_update(
        business_id,
        data.products,
        current_user.id,
    )

    return ProductBulkUpdateResponse(
        updated_count=len(products),
        not_found_ids=not_found_ids,
        products=[ProductResponse.model_validate(product) for product in products],
    )


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """Actualiza un producto existente."""
    service = ProductService(db)
    product = await service.update(product_id, business_id, data, current_user.id)

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    return ProductResponse.model_validate(product)


@router.delete("/{product_id}", response_model=MessageResponse)
async def delete_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Elimina un producto (soft delete)."""
    service = ProductService(db)
    deleted = await service.soft_delete(product_id, business_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    return MessageResponse(message="Producto eliminado correctamente")


@router.patch("/{product_id}/stock", response_model=ProductResponse)
async def update_stock(
    product_id: UUID,
    quantity: int = Query(
        ..., description="Cantidad a agregar (positivo) o restar (negativo)"
    ),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    """Actualiza el stock de un producto."""
    service = ProductService(db)
    product = await service.update_stock(
        product_id,
        business_id,
        quantity,
        user_id=current_user.id,
        reason="Ajuste manual desde panel de productos",
    )

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    return ProductResponse.model_validate(product)


@router.get("/{product_id}/price-history")
async def list_price_history(
    product_id: UUID,
    page: int = Query(1, ge=1, description="Número de página"),
    per_page: int = Query(20, ge=1, le=100, description="Elementos por página"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Obtiene el historial de precios de un producto."""
    from app.schemas.base import PaginatedResponse

    service = ProductService(db)
    entries, total = await service.get_price_history(
        product_id=product_id,
        business_id=business_id,
        limit=per_page,
        offset=(page - 1) * per_page,
    )

    if total == 0:
        # Verificar que el producto existe
        product = await service.get_by_id(product_id, business_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Producto no encontrado",
            )

    pages = (total + per_page - 1) // per_page if per_page else 0
    return PaginatedResponse(
        items=[PriceHistoryResponse.model_validate(e) for e in entries],
        total=total,
        page=page,
        per_page=per_page,
        pages=pages,
    )


@router.post("/{product_id}/price-history/{entry_id}/restore", response_model=PriceRestoreResponse)
async def restore_price(
    product_id: UUID,
    entry_id: UUID,
    request: PriceRestoreRequest = PriceRestoreRequest(),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    """Restaura el precio de un producto desde un entry del historial."""
    service = ProductService(db)
    product, new_entry = await service.restore_price(
        product_id=product_id,
        business_id=business_id,
        entry_id=entry_id,
        user_id=current_user.id,
        reason=request.reason,
    )

    if not product or not new_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto o entry de historial no encontrado",
        )

    return PriceRestoreResponse(
        product_id=product.id,
        restored_list_price=product.list_price,
        restored_net_price=product.net_price,
        restored_sale_price=product.sale_price,
        new_history_entry_id=new_entry.id,
        message="Precio restaurado correctamente",
    )


@router.post("/stock-delta", response_model=StockDeltaResponse)
async def bulk_stock_delta(
    request: StockDeltaRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    """Ajusta stock de múltiples productos por delta (+/-)."""
    service = ProductService(db)
    items = [
        (item.product_id, item.delta, item.reason)
        for item in request.items
    ]
    results = await service.bulk_stock_delta(
        business_id=business_id,
        items=items,
        user_id=current_user.id,
    )

    return StockDeltaResponse(
        results=[
            StockDeltaResult(product_id=pid, success=ok, error=err)
            for pid, ok, err in results
        ],
        total_success=sum(1 for _, ok, _ in results if ok),
        total_failures=sum(1 for _, ok, _ in results if not ok),
    )


@router.post("/import/preview", response_model=ImportPreviewResponse)
async def preview_import_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Parsea el Excel y retorna un preview de los productos a importar.
    Permite al usuario revisar y editar antes de confirmar.
    """
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un Excel (.xlsx, .xls)",
        )

    content = await file.read()
    service = ExcelService(db)

    try:
        preview = await service.preview_import(business_id, content)
        return preview
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/import/confirm", response_model=ImportConfirmResponse)
async def confirm_import_excel(
    request: ImportConfirmRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user: User = Depends(get_current_user),
):
    """
    Confirma la importación de productos después del preview.
    Crea/actualiza productos en la base de datos.
    Los lotes creados se atribuyen al usuario autenticado.
    """
    service = ExcelService(db)

    try:
        result = await service.confirm_import(
            business_id, request, user_id=current_user.id
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al confirmar importación: {str(e)}",
        )


@router.post("/import/excel", response_model=dict)
async def import_products_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Importa productos desde un archivo Excel (método directo sin preview)."""
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un Excel (.xlsx, .xls)",
        )

    content = await file.read()
    service = ExcelService(db)

    try:
        summary = await service.import_products(business_id, content)
        return summary
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/export/excel")
async def export_products_excel(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Exporta productos activos a un archivo Excel con categorías y proveedores."""
    service = ExcelService(db)
    content = await service.export_products(business_id)

    from datetime import datetime

    filename = f"productos-{datetime.now().strftime('%Y%m%d-%H%M%S')}.xlsx"

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/backup")
async def export_full_backup(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Exporta un backup completo de TODOS los productos (incluso eliminados).
    Incluye todos los campos para restauración completa.
    """
    service = ExcelService(db)
    content = await service.export_full_backup(business_id)

    from datetime import datetime

    filename = (
        f"backup-productos-completo-{datetime.now().strftime('%Y%m%d-%H%M%S')}.xlsx"
    )

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/sql")
async def export_products_sql(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Exporta los productos en formato SQL (INSERT statements).
    Solo disponible si el tenant tiene la feature flag habilitada.
    Requiere permiso 'sql_backup' y feature flag activada.
    """
    import logging
    import traceback

    from sqlalchemy import select

    from app.models.business import Business
    from app.services.backup_service import BackupService

    logger = logging.getLogger("uvicorn")

    # 1. Verificar feature flag sql_backup_enabled en Business
    business_query = select(Business).where(Business.id == business_id)
    business_result = await db.execute(business_query)
    business = business_result.scalar_one_or_none()

    if not business or not business.sql_backup_enabled:
        logger.warning(
            f"[export_products_sql] Feature flag not enabled for business {business_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Funcionalidad de backup SQL no habilitada para este plan",
        )

    service = BackupService(db)

    try:
        logger.info(
            f"[export_products_sql] Starting SQL export for business {business_id}"
        )
        sql_content = await service.generate_tenant_backup_sql(business_id)
        logger.info(
            f"[export_products_sql] SQL export completed, length: {len(sql_content)}"
        )
    except ValueError as e:
        logger.error(f"[export_products_sql] ValueError: {e}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"[export_products_sql] Exception: {e}")
        logger.error(f"[export_products_sql] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar backup SQL: {str(e)}",
        )

    from datetime import datetime

    filename = f"backup-productos-{datetime.now().strftime('%Y%m%d')}.sql"

    return StreamingResponse(
        io.StringIO(sql_content),
        media_type="application/sql",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import/sql")
async def import_products_sql(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    data: dict = ...,
):
    """
    Importa productos desde SQL (INSERT statements).
    Solo disponible si el tenant tiene la feature flag habilitada.
    """
    from sqlalchemy import select

    from app.models.business import Business
    from app.services.backup_service import BackupService

    # Verificar feature flag
    business_query = select(Business).where(Business.id == business_id)
    business_result = await db.execute(business_query)
    business = business_result.scalar_one_or_none()

    if not business or not business.sql_backup_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Funcionalidad de backup SQL no habilitada para este plan",
        )

    service = BackupService(db)
    sql_content = data.get("sql", "")

    try:
        # Log para debug
        import logging

        logger = logging.getLogger(__name__)
        logger.info(f"Received SQL content: {sql_content[:200]}...")

        result = await service.import_products_from_sql(business_id, sql_content)

        # Incluir debug info en respuesta
        result["debug"] = {
            "sql_length": len(sql_content),
            "sql_sample": sql_content[:100],
        }

        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al importar SQL: {str(e)}",
        )


@router.delete("/bulk-delete")
async def bulk_delete_products(
    current_user=Depends(get_current_user),
    business_id: UUID = Depends(get_current_business),
    db: AsyncSession = Depends(get_db),
):
    """
    Elimina TODOS los productos del negocio (soft delete).
    CUIDADO: Esta acción afecta a todos los productos.
    """
    import logging
    from datetime import datetime

    logger = logging.getLogger("uvicorn")

    try:
        logger.info("=== BULK DELETE START ===")
        logger.info(f"User: {current_user.email}")
        logger.info(f"Business ID: {business_id}")

        # Obtener productos
        products_query = select(Product).where(
            Product.business_id == business_id, Product.deleted_at.is_(None)
        )
        products_result = await db.execute(products_query)
        products = products_result.scalars().all()

        logger.info(f"Found {len(products)} products to delete")

        # Eliminar
        count = 0
        now = datetime.utcnow()
        for product in products:
            product.deleted_at = now
            count += 1

        await db.commit()
        logger.info(f"Deleted {count} products")

        return {
            "deleted_count": count,
            "message": f"Se eliminaron {count} productos correctamente",
        }

    except Exception as e:
        logger.error("=== BULK DELETE ERROR ===", exc_info=True)
        await db.rollback()
        return {"deleted_count": 0, "message": f"Error: {str(e)}"}


@router.post("/price-update/preview", response_model=PriceUpdatePreviewResponse)
async def preview_price_update(
    request: PriceUpdateRequest,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """
    Preview de actualización masiva de precios.
    Muestra los cambios antes de aplicarlos.
    """
    from decimal import Decimal as D

    from sqlalchemy.orm import selectinload

    # Obtener productos con relaciones
    query = (
        select(Product)
        .options(selectinload(Product.category), selectinload(Product.supplier))
        .where(
            Product.id.in_(request.product_ids),
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
        )
    )

    result = await db.execute(query)
    products = result.scalars().all()

    items = []
    field_map = {
        FieldToUpdate.LIST_PRICE: ("list_price", "Precio de Lista"),
        FieldToUpdate.DISCOUNT_1: ("discount_1", "Descuento 1"),
        FieldToUpdate.DISCOUNT_2: ("discount_2", "Descuento 2"),
        FieldToUpdate.DISCOUNT_3: ("discount_3", "Descuento 3"),
        FieldToUpdate.EXTRA_COST: ("extra_cost", "Cargo Extra"),
        FieldToUpdate.CURRENT_STOCK: ("current_stock", "Stock Actual"),
    }

    field_attr, field_name = field_map[request.field]

    for product in products:
        current_value = D(str(getattr(product, field_attr)))

        # Calcular nuevo valor según el tipo
        if request.update_type == UpdateType.INCREASE:
            new_value = current_value * (D("1") + request.value / D("100"))
        elif request.update_type == UpdateType.DECREASE:
            new_value = current_value * (D("1") - request.value / D("100"))
        elif request.update_type == UpdateType.REMOVE_INCREASE:
            new_value = current_value / (D("1") + request.value / D("100"))
        elif request.update_type == UpdateType.SET_VALUE:
            new_value = request.value
        else:
            new_value = current_value

        new_value = round(new_value, 2)
        change_amount = new_value - current_value
        change_percentage = (
            ((new_value - current_value) / current_value * D("100"))
            if current_value > 0
            else D("0")
        )

        items.append(
            PriceUpdatePreviewItem(
                id=product.id,
                code=product.code,
                description=product.description,
                category_name=product.category.name if product.category else None,
                supplier_name=product.supplier.name if product.supplier else None,
                current_value=current_value,
                new_value=new_value,
                change_amount=change_amount,
                change_percentage=round(change_percentage, 2),
            )
        )

    update_descriptions = {
        UpdateType.INCREASE: f"Aumentar {request.value}%",
        UpdateType.DECREASE: f"Disminuir {request.value}%",
        UpdateType.REMOVE_INCREASE: f"Quitar aumento de {request.value}%",
        UpdateType.SET_VALUE: f"Establecer en {request.value}",
    }

    return PriceUpdatePreviewResponse(
        total_products=len(items),
        field_name=field_name,
        update_description=update_descriptions[request.update_type],
        items=items,
    )


@router.post("/price-update/apply", response_model=PriceUpdateApplyResponse)
async def apply_price_update(
    request: PriceUpdateRequest,
    db: AsyncSession = Depends(get_db),
    business_id=Depends(get_current_business),
):
    """Aplica actualización masiva de precios."""
    from decimal import Decimal as D

    from app.schemas.product_lot import ProductLotCreate

    query = select(Product).where(
        Product.id.in_(request.product_ids),
        Product.business_id == business_id,
        Product.deleted_at.is_(None),
    )

    result = await db.execute(query)
    products = result.scalars().all()

    is_stock_field = request.field == FieldToUpdate.CURRENT_STOCK
    is_price_field = not is_stock_field

    if is_stock_field:
        # current_stock ahora es @property → redirigir a lotes
        lot_service = ProductLotService(db)
        count = 0
        for product in products:
            current_stock = int(product.current_stock)
            new_stock = max(0, round(D(str(request.value))))

            if request.update_type == UpdateType.INCREASE:
                diff = new_stock
            elif request.update_type == UpdateType.DECREASE:
                diff = -min(current_stock, new_stock)
            elif request.update_type == UpdateType.SET_VALUE:
                diff = new_stock - current_stock
            else:
                diff = 0

            if diff > 0:
                await lot_service.create(
                    product_id=product.id,
                    business_id=business_id,
                    data=ProductLotCreate(quantity=diff),
                )
                count += 1
            elif diff < 0:
                try:
                    await lot_service.fifo_consume(
                        product_id=product.id,
                        business_id=business_id,
                        quantity=abs(diff),
                    )
                    count += 1
                except ValueError:
                    continue  # Sin stock suficiente, se saltea
            else:
                count += 1  # Sin cambio, igual se cuenta

        return PriceUpdateApplyResponse(
            updated_count=count,
            message=f"Se actualizaron {count} productos correctamente",
        )

    # Campos de precio: lógica normal
    field_attr = {
        FieldToUpdate.LIST_PRICE: "list_price",
        FieldToUpdate.DISCOUNT_1: "discount_1",
        FieldToUpdate.DISCOUNT_2: "discount_2",
        FieldToUpdate.DISCOUNT_3: "discount_3",
        FieldToUpdate.EXTRA_COST: "extra_cost",
    }[request.field]

    count = 0
    for product in products:
        current_value = D(str(getattr(product, field_attr)))

        if request.update_type == UpdateType.INCREASE:
            new_value = current_value * (D("1") + request.value / D("100"))
        elif request.update_type == UpdateType.DECREASE:
            new_value = current_value * (D("1") - request.value / D("100"))
        elif request.update_type == UpdateType.REMOVE_INCREASE:
            new_value = current_value / (D("1") + request.value / D("100"))
        elif request.update_type == UpdateType.SET_VALUE:
            new_value = request.value
        else:
            new_value = current_value

        setattr(product, field_attr, round(new_value, 2))
        product.calculate_prices()
        count += 1

    await db.commit()

    return PriceUpdateApplyResponse(
        updated_count=count, message=f"Se actualizaron {count} productos correctamente"
    )


@router.post(
    "/price-update/excel/columns",
    response_model=ExcelPriceUpdateColumnPreviewResponse,
)
async def preview_price_update_excel_columns(
    file: UploadFile = File(...),
):
    """Lee un Excel de proveedor y devuelve columnas + filas crudas para mapeo manual."""
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un Excel (.xlsx, .xls)",
        )

    try:
        import pandas as pd

        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))
        rows = [
            {str(key): _clean_excel_value(value) for key, value in row.items()}
            for row in df.to_dict(orient="records")
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al leer el archivo Excel: {str(e)}",
        )

    return ExcelPriceUpdateColumnPreviewResponse(
        file_name=file.filename,
        total_rows=len(rows),
        columns=[str(column) for column in df.columns],
        sample_rows=rows[:5],
        rows=rows,
    )


@router.post(
    "/price-update/excel/preview",
    response_model=ExcelPriceUpdatePreviewResponse,
)
async def preview_price_update_excel_mapping(
    request: ExcelPriceUpdateMappingRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Cruza el Excel mapeado contra productos por código de proveedor o código interno."""
    items: list[ExcelPriceUpdatePreviewItem] = []
    matched_count = 0
    error_count = 0

    raw_codes = [
        str(row.get(request.code_column) or "").strip()
        for row in request.rows
        if str(row.get(request.code_column) or "").strip()
    ]
    unique_codes = list(dict.fromkeys(raw_codes))

    result = await db.execute(
        select(Product).where(
            Product.business_id == business_id,
            Product.deleted_at.is_(None),
            (Product.supplier_code.in_(unique_codes)) | (Product.code.in_(unique_codes)),
        )
    )
    products = list(result.scalars().all())
    products_by_supplier_code = {
        str(product.supplier_code).strip(): product
        for product in products
        if product.supplier_code
    }
    products_by_code = {str(product.code).strip(): product for product in products}

    for index, row in enumerate(request.rows, start=2):
        supplier_code = str(row.get(request.code_column) or "").strip()
        if not supplier_code:
            error_count += 1
            items.append(
                ExcelPriceUpdatePreviewItem(
                    row_number=index,
                    supplier_code="",
                    status="error",
                    error_message="Código vacío",
                )
            )
            continue

        try:
            imported_price = _parse_excel_price(row.get(request.price_column))
        except Exception as e:
            error_count += 1
            items.append(
                ExcelPriceUpdatePreviewItem(
                    row_number=index,
                    supplier_code=supplier_code,
                    status="error",
                    error_message=str(e),
                )
            )
            continue

        product = products_by_supplier_code.get(supplier_code) or products_by_code.get(supplier_code)
        if not product:
            error_count += 1
            items.append(
                ExcelPriceUpdatePreviewItem(
                    row_number=index,
                    supplier_code=supplier_code,
                    imported_list_price=imported_price,
                    status="not_found",
                    error_message="No se encontró producto para ese código",
                )
            )
            continue

        matched_count += 1
        items.append(
            ExcelPriceUpdatePreviewItem(
                row_number=index,
                supplier_code=supplier_code,
                imported_list_price=imported_price,
                product_id=product.id,
                product_code=product.code,
                description=product.description,
                current_list_price=product.list_price,
                current_sale_price=product.sale_price,
                new_sale_price=_preview_product_sale_price(product, imported_price),
                status="matched",
            )
        )

    return ExcelPriceUpdatePreviewResponse(
        total_rows=len(request.rows),
        matched_count=matched_count,
        error_count=error_count,
        supplier_name=request.supplier_name,
        items=items,
    )


@router.get("/export/sql-backup")
async def export_tenant_sql_backup(
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Exporta un backup SQL completo del tenant.
    Incluye todas las tablas relevantes con datos filtrados por business_id.
    """
    service = BackupService(db)

    try:
        sql_content = await service.generate_tenant_backup_sql(business_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al generar backup SQL: {str(e)}",
        )

    from datetime import datetime

    filename = (
        f"backup-tenant-{business_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
    )

    return StreamingResponse(
        io.StringIO(sql_content),
        media_type="application/sql",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post(
    "/{product_id}/sync-price-from-lot",
    response_model=SyncPriceFromLotResponse,
)
async def sync_price_from_lot(
    product_id: UUID,
    data: SyncPriceFromLotRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
    current_user=Depends(get_current_user),
):
    """
    Sincroniza el precio de lista del producto desde el costo de un lote.

    - Si no se envía reference_price, usa cost_price del lote.
    - Si no hay precio disponible (lote sin cost_price y sin reference_price), error 400.
    - Si confirm=false: calcula preview y retorna sin persistir.
    - Si confirm=true: actualiza list_price, recalcula precios, crea PriceHistory.
    - Valida que el lote pertenezca al mismo producto y negocio.
    """
    from decimal import Decimal

    from app.models.price_history import PriceHistory
    from app.models.product_lot import ProductLot
    from app.services.product_service import ProductService

    # 1. Verificar que el producto existe
    product_service = ProductService(db)
    product = await product_service.get_by_id(product_id, business_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    # 2. Buscar el lote
    lot_query = select(ProductLot).where(
        ProductLot.id == data.lot_id,
        ProductLot.business_id == business_id,
        ProductLot.deleted_at.is_(None),
    )
    lot_result = await db.execute(lot_query)
    lot = lot_result.scalar_one_or_none()
    if not lot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lote no encontrado",
        )

    # 3. Validar que el lote pertenece al producto
    if lot.product_id != product_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El lote no pertenece al producto especificado",
        )

    # 4. Determinar el precio de referencia
    reference_price = data.reference_price
    if reference_price is None:
        if lot.cost_price is not None and lot.cost_price > 0:
            reference_price = lot.cost_price
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El lote no tiene precio de costo. "
                       "Enviá un reference_price para usar como referencia.",
            )

    # 5. Calcular preview usando calculate_prices()
    original_values = {
        "list_price": product.list_price,
        "net_price": product.net_price,
        "sale_price": product.sale_price,
    }

    product.list_price = reference_price
    product.calculate_prices()
    preview_net = Decimal(str(product.net_price))
    preview_sale = Decimal(str(product.sale_price))
    preview_list = Decimal(str(product.list_price))

    # Restaurar valores originales si es solo preview
    if not data.confirm:
        for field, value in original_values.items():
            setattr(product, field, value)

        return SyncPriceFromLotResponse(
            lot_id=data.lot_id,
            reference_price=reference_price,
            preview_list_price=preview_list,
            preview_net_price=preview_net,
            preview_sale_price=preview_sale,
            confirmed=False,
            message="Preview calculado. Enviá confirm=true para aplicar.",
        )

    # 6. Confirmar: persistir cambios
    old_list = original_values["list_price"]
    old_net = original_values["net_price"]
    old_sale = original_values["sale_price"]

    # El producto ya tiene los valores calculados (se setearon arriba)
    # Crear PriceHistory
    history = PriceHistory(
        product_id=product.id,
        changed_by=current_user.id,
        old_list_price=old_list,
        old_net_price=old_net,
        old_sale_price=old_sale,
        new_list_price=preview_list,
        new_net_price=preview_net,
        new_sale_price=preview_sale,
        change_reason="Sincronizado desde lote",
    )
    db.add(history)

    await db.commit()
    await db.refresh(product)

    return SyncPriceFromLotResponse(
        lot_id=data.lot_id,
        reference_price=reference_price,
        preview_list_price=preview_list,
        preview_net_price=preview_net,
        preview_sale_price=preview_sale,
        confirmed=True,
        price_history_id=history.id,
        message="Precio sincronizado desde lote correctamente.",
    )
