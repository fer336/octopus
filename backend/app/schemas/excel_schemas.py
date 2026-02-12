"""
Schemas para importación/exportación de productos via Excel.
"""
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import Field, field_serializer

from app.schemas.base import BaseSchema


class ProductImportRow(BaseSchema):
    """Representa una fila del Excel para importar/editar."""
    
    row_number: int = Field(..., description="Número de fila en el Excel (para referencia)")
    code: str = Field(..., max_length=50, description="Código del producto")
    supplier_code: Optional[str] = Field(None, max_length=50)
    description: str = Field(..., max_length=500)
    
    category_id: Optional[UUID] = None
    category_name: Optional[str] = Field(None, description="Nombre de categoría (para display)")
    supplier_id: Optional[UUID] = None
    supplier_name: Optional[str] = Field(None, description="Nombre de proveedor (para display)")
    
    list_price: Decimal = Field(default=Decimal("0"), ge=0)
    discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    extra_cost: Decimal = Field(default=Decimal("0"), ge=0)
    iva_rate: Decimal = Field(default=Decimal("21.00"))
    
    current_stock: int = Field(default=0, ge=0)
    minimum_stock: int = Field(default=0, ge=0)
    unit: str = Field(default="unidad")
    
    # Campos calculados (read-only en preview)
    net_price: Optional[Decimal] = Field(None, description="Precio sin IVA (calculado)")
    sale_price: Optional[Decimal] = Field(None, description="Precio final con IVA (calculado)")
    discount_display: Optional[str] = Field(None, description="Formato de descuentos (ej: '10+5')")
    
    # Estado de validación
    has_errors: bool = Field(default=False, description="Indica si la fila tiene errores")
    error_message: Optional[str] = Field(None, description="Mensaje de error si existe")
    is_new: bool = Field(default=True, description="True si es nuevo, False si actualiza existente")
    existing_id: Optional[UUID] = Field(None, description="ID del producto existente si aplica")

    # Serializar Decimals como float para JSON
    @field_serializer('list_price', 'discount_1', 'discount_2', 'discount_3', 'extra_cost', 'iva_rate', 'net_price', 'sale_price')
    def serialize_decimal(self, value: Optional[Decimal]) -> Optional[float]:
        """Convierte Decimal a float para JSON."""
        return float(value) if value is not None else None


class ImportPreviewResponse(BaseSchema):
    """Respuesta del endpoint de preview."""
    
    total_rows: int = Field(..., description="Total de filas procesadas")
    valid_rows: int = Field(..., description="Filas válidas para importar")
    rows_with_errors: int = Field(..., description="Filas con errores")
    new_products: int = Field(..., description="Productos nuevos a crear")
    existing_products: int = Field(..., description="Productos existentes a actualizar")
    
    rows: List[ProductImportRow] = Field(..., description="Datos parseados del Excel")


class ImportConfirmRequest(BaseSchema):
    """Request para confirmar la importación después del preview."""
    
    rows: List[ProductImportRow] = Field(..., description="Filas validadas y/o editadas")


class ImportConfirmResponse(BaseSchema):
    """Respuesta del endpoint de confirm."""
    
    created: int = Field(..., description="Productos creados")
    updated: int = Field(..., description="Productos actualizados")
    errors: List[str] = Field(default_factory=list, description="Errores durante la confirmación")
