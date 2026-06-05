"""
Schemas para importación/exportación de productos via Excel.
"""
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field, field_serializer

from app.schemas.base import BaseSchema


class ImportDetectResponse(BaseSchema):
    """Respuesta del endpoint de detección de columnas de un Excel."""

    columns: list[str] = Field(..., description="Nombres de las columnas detectadas")
    sample_rows: list[list] = Field(
        ..., description="Hasta 3 filas de muestra con valores crudos"
    )
    total_rows: int = Field(..., description="Total de filas de datos (sin header)")


class ProductImportRow(BaseSchema):
    """Representa una fila del Excel para importar/editar."""

    row_number: int = Field(..., description="Número de fila en el Excel (para referencia)")
    code: str = Field(..., max_length=50, description="Código del producto")
    supplier_code: str | None = Field(None, max_length=50)
    description: str = Field(..., max_length=500)

    category_id: UUID | None = None
    category_name: str | None = Field(None, description="Nombre de categoría (para display)")
    category_is_new: bool = Field(
        default=False, description="True si la categoría será creada al confirmar"
    )
    supplier_id: UUID | None = None
    supplier_name: str | None = Field(None, description="Nombre de proveedor (para display)")
    supplier_is_new: bool = Field(
        default=False, description="True si el proveedor será creado al confirmar"
    )
    brand_id: UUID | None = None
    brand_name: str | None = Field(None, description="Nombre de marca (para display)")
    brand_is_new: bool = Field(
        default=False, description="True si la marca será creada al confirmar"
    )

    list_price: Decimal = Field(default=Decimal("0"), ge=0)
    discount_1: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_2: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_3: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    extra_cost: Decimal = Field(default=Decimal("0"), ge=0)
    profit_margin: Decimal = Field(default=Decimal("0"), ge=0)
    iva_rate: Decimal = Field(default=Decimal("21.00"))

    current_stock: int = Field(default=0, ge=0)
    minimum_stock: int = Field(default=0, ge=0)
    unit: str = Field(default="unidad")
    units_per_pack: int | None = Field(None, ge=1, description="Cantidad por pack")
    expiration_date: str | None = Field(
        None, description="Fecha de vencimiento (YYYY-MM-DD)"
    )

    # Campos de empaquetado (F1a)
    quantity_per_package: Decimal | None = Field(
        None, description="Cantidad de unidades base por paquete de compra"
    )
    sell_per_unit: bool = Field(
        default=True, description="True si se vende por unidad (fraccionado), False si se vende por paquete completo"
    )
    # Indica si la columna 'fraccionado' fue mapeada explícitamente por el operador
    # Solo cuando es True se escribe sell_per_unit al confirmar (W-02 guard)
    sell_per_unit_mapped: bool = Field(
        default=False, description="True si la columna fraccionado fue mapeada explícitamente"
    )

    # Campos calculados (read-only en preview)
    net_price: Decimal | None = Field(None, description="Precio sin IVA (calculado)")
    sale_price: Decimal | None = Field(None, description="Precio final con IVA (calculado)")
    discount_display: str | None = Field(None, description="Formato de descuentos (ej: '10+5')")

    # Estado de validación
    has_errors: bool = Field(default=False, description="Indica si la fila tiene errores")
    error_message: str | None = Field(None, description="Mensaje de error si existe")
    is_new: bool = Field(default=True, description="True si es nuevo, False si actualiza existente")
    existing_id: UUID | None = Field(None, description="ID del producto existente si aplica")
    status: Literal["nuevo", "actualizar", "error", "repetido"] = Field(
        default="nuevo", description="Estado de la fila en el proceso de importación"
    )

    # Serializar Decimals como float para JSON
    @field_serializer('list_price', 'discount_1', 'discount_2', 'discount_3', 'extra_cost', 'profit_margin', 'iva_rate', 'net_price', 'sale_price', 'quantity_per_package')
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        """Convierte Decimal a float para JSON."""
        return float(value) if value is not None else None


class ImportPreviewResponse(BaseSchema):
    """Respuesta del endpoint de preview."""

    total_rows: int = Field(..., description="Total de filas procesadas")
    valid_rows: int = Field(..., description="Filas válidas para importar")
    rows_with_errors: int = Field(..., description="Filas con errores")
    new_products: int = Field(..., description="Productos nuevos a crear")
    existing_products: int = Field(..., description="Productos existentes a actualizar")
    duplicate_rows: int = Field(default=0, description="Filas marcadas como repetido (intra-archivo o DB)")

    rows: list[ProductImportRow] = Field(..., description="Datos parseados del Excel")


class ImportConfirmRequest(BaseSchema):
    """Request para confirmar la importación después del preview."""

    rows: list[ProductImportRow] = Field(..., description="Filas validadas y/o editadas")


class ImportConfirmResponse(BaseSchema):
    """Respuesta del endpoint de confirm."""

    created: int = Field(..., description="Productos creados")
    updated: int = Field(..., description="Productos actualizados")
    errors: list[str] = Field(default_factory=list, description="Errores durante la confirmación")
    skipped_duplicates: int = Field(default=0, description="Filas omitidas por estar marcadas como repetido")
