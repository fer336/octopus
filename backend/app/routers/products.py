"""
Router de Productos.
Endpoints para gestión de productos e inventario.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import io

from app.database import get_db
from app.models.product import Product
from app.schemas.base import MessageResponse, PaginatedResponse, BulkDeleteResponse
from app.schemas.product import ProductCreate, ProductListParams, ProductResponse, ProductUpdate
from app.schemas.excel_schemas import ImportPreviewResponse, ImportConfirmRequest, ImportConfirmResponse
from app.schemas.price_update import (
    PriceUpdateRequest, PriceUpdatePreviewResponse, PriceUpdateApplyResponse,
    PriceUpdatePreviewItem, UpdateType, FieldToUpdate
)
from app.services.product_service import ProductService
from app.services.excel_service import ExcelService
from app.utils.security import get_current_business, get_current_user

router = APIRouter(prefix="/products", tags=["Productos"])


@router.delete("/test-delete")
async def test_delete_endpoint(
    current_user = Depends(get_current_user),
):
    """Endpoint de test para verificar que el auth funciona en DELETE."""
    import logging
    logger = logging.getLogger("uvicorn")
    logger.info(f"TEST DELETE - user: {current_user.email}")
    
    return {
        "status": "ok",
        "user_email": current_user.email,
        "message": "Test exitoso - Auth funciona"
    }


@router.delete("/test-delete-2")
async def test_delete_endpoint_2():
    """Endpoint de test SIN autenticación."""
    import logging
    logger = logging.getLogger("uvicorn")
    logger.info(f"TEST DELETE 2 - SIN AUTH")
    
    return {
        "status": "ok",
        "message": "Test exitoso sin auth"
    }


@router.post("/bulk-delete-alt")
async def bulk_delete_alt(
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """ALTERNATIVA: Usa POST en vez de DELETE para evitar problemas de CORS."""
    import logging
    from uuid import UUID as PyUUID
    from app.models.business import Business
    from datetime import datetime
    
    logger = logging.getLogger("uvicorn")
    logger.info(f"=== BULK DELETE ALT (POST) START ===")
    
    try:
        # Obtener business
        query = select(Business).where(
            Business.owner_id == current_user.id,
            Business.deleted_at.is_(None),
        )
        result = await db.execute(query)
        business = result.scalar_one_or_none()
        
        if not business:
            return {"deleted_count": 0, "message": "No se encontró el negocio"}
        
        business_id = PyUUID(str(business.id))
        
        # Obtener productos
        products_query = select(Product).where(
            Product.business_id == business_id,
            Product.deleted_at.is_(None)
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
            "message": f"Se eliminaron {count} productos correctamente"
        }
        
    except Exception as e:
        logger.error(f"ERROR: {str(e)}", exc_info=True)
        await db.rollback()
        return {
            "deleted_count": 0,
            "message": f"Error: {str(e)}"
        }


@router.get("", response_model=PaginatedResponse[ProductResponse])
async def list_products(
    search: Optional[str] = Query(None, description="Buscar por código o descripción"),
    category_id: Optional[UUID] = Query(None, description="Filtrar por categoría"),
    supplier_id: Optional[UUID] = Query(None, description="Filtrar por proveedor"),
    is_active: Optional[bool] = Query(True, description="Filtrar por estado activo"),
    low_stock: Optional[bool] = Query(None, description="Filtrar productos con stock bajo"),
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
        is_active=is_active,
        low_stock=low_stock,
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
    quantity: int = Query(..., description="Cantidad a agregar (positivo) o restar (negativo)"),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Actualiza el stock de un producto."""
    service = ProductService(db)
    product = await service.update_stock(product_id, business_id, quantity)

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Producto no encontrado",
        )

    return ProductResponse.model_validate(product)


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
    if not file.filename or not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un Excel (.xlsx, .xls)"
        )
    
    content = await file.read()
    service = ExcelService(db)
    
    try:
        preview = await service.preview_import(business_id, content)
        return preview
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/import/confirm", response_model=ImportConfirmResponse)
async def confirm_import_excel(
    request: ImportConfirmRequest,
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """
    Confirma la importación de productos después del preview.
    Crea/actualiza productos en la base de datos.
    """
    service = ExcelService(db)
    
    try:
        result = await service.confirm_import(business_id, request)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al confirmar importación: {str(e)}"
        )


@router.post("/import/excel", response_model=dict)
async def import_products_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    business_id: UUID = Depends(get_current_business),
):
    """Importa productos desde un archivo Excel (método directo sin preview)."""
    if not file.filename or not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser un Excel (.xlsx, .xls)"
        )
    
    content = await file.read()
    service = ExcelService(db)
    
    try:
        summary = await service.import_products(business_id, content)
        return summary
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


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
        headers={"Content-Disposition": f"attachment; filename={filename}"}
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
    filename = f"backup-productos-completo-{datetime.now().strftime('%Y%m%d-%H%M%S')}.xlsx"
    
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.delete("/bulk-delete")
async def bulk_delete_products(
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Elimina TODOS los productos del negocio (soft delete).
    CUIDADO: Esta acción afecta a todos los productos.
    """
    import logging
    from uuid import UUID as PyUUID
    from app.models.business import Business
    from datetime import datetime
    
    logger = logging.getLogger("uvicorn")
    
    try:
        logger.info(f"=== BULK DELETE START ===")
        logger.info(f"User: {current_user.email}")
        
        # Obtener business directamente aquí
        query = select(Business).where(
            Business.owner_id == current_user.id,
            Business.deleted_at.is_(None),
        )
        result = await db.execute(query)
        business = result.scalar_one_or_none()
        
        if not business:
            logger.error("No business found")
            return {"deleted_count": 0, "message": "No se encontró el negocio"}
        
        business_id = PyUUID(str(business.id))
        logger.info(f"Business ID: {business_id}")
        
        # Obtener productos
        products_query = select(Product).where(
            Product.business_id == business_id,
            Product.deleted_at.is_(None)
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
            "message": f"Se eliminaron {count} productos correctamente"
        }
        
    except Exception as e:
        logger.error(f"=== BULK DELETE ERROR ===", exc_info=True)
        await db.rollback()
        return {
            "deleted_count": 0,
            "message": f"Error: {str(e)}"
        }

@router.post("/price-update/preview", response_model=PriceUpdatePreviewResponse)
async def preview_price_update(
    request: PriceUpdateRequest,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
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
        .options(
            selectinload(Product.category),
            selectinload(Product.supplier)
        )
        .where(
            Product.id.in_(request.product_ids),
            Product.business_id == business_id,
            Product.deleted_at.is_(None)
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
        change_percentage = ((new_value - current_value) / current_value * D("100")) if current_value > 0 else D("0")
        
        items.append(PriceUpdatePreviewItem(
            id=product.id,
            code=product.code,
            description=product.description,
            category_name=product.category.name if product.category else None,
            supplier_name=product.supplier.name if product.supplier else None,
            current_value=current_value,
            new_value=new_value,
            change_amount=change_amount,
            change_percentage=round(change_percentage, 2)
        ))
    
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
        items=items
    )


@router.post("/price-update/apply", response_model=PriceUpdateApplyResponse)
async def apply_price_update(
    request: PriceUpdateRequest,
    db: AsyncSession = Depends(get_db),
    business_id = Depends(get_current_business),
):
    """Aplica actualización masiva de precios."""
    from decimal import Decimal as D
    
    query = select(Product).where(
        Product.id.in_(request.product_ids),
        Product.business_id == business_id,
        Product.deleted_at.is_(None)
    )
    
    result = await db.execute(query)
    products = result.scalars().all()
    
    field_attr = {
        FieldToUpdate.LIST_PRICE: "list_price",
        FieldToUpdate.DISCOUNT_1: "discount_1",
        FieldToUpdate.DISCOUNT_2: "discount_2",
        FieldToUpdate.DISCOUNT_3: "discount_3",
        FieldToUpdate.EXTRA_COST: "extra_cost",
        FieldToUpdate.CURRENT_STOCK: "current_stock",
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
        
        if request.field in [FieldToUpdate.LIST_PRICE, FieldToUpdate.DISCOUNT_1, 
                             FieldToUpdate.DISCOUNT_2, FieldToUpdate.DISCOUNT_3, 
                             FieldToUpdate.EXTRA_COST]:
            product.calculate_prices()
        
        count += 1
    
    await db.commit()
    
    return PriceUpdateApplyResponse(
        updated_count=count,
        message=f"Se actualizaron {count} productos correctamente"
    )
