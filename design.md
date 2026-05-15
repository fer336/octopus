# Design: Product Lots — Separar stock en lotes con vencimiento

## Architecture Overview

### Model Relationships

```
┌─────────────────┐       ┌──────────────────────┐
│     Product      │       │     ProductLot        │
├─────────────────┤       ├──────────────────────┤
│ id (PK)         │◄──────│ product_id (FK)       │
│ business_id (FK)│ 1   N │ business_id (FK)      │
│ ...             │       │ code                  │
│ current_stock   │       │ quantity              │
│   (@property)   │       │ initial_quantity      │
│ minimum_stock   │       │ expiration_date       │
│ next_expiration │       │ cost_price            │
│   (@property)   │       │ received_date         │
│ active_lots     │       │ created_at/updated_at │
│   (relationship)│       │ deleted_at            │
└─────────────────┘       └──────────────────────┘
        │ 1                      N │
        │                         │
        │ N                       │ 1
┌─────────────────┐       ┌──────────────────────┐
│   VoucherItem    │       │   *NEW COLUMN*        │
├─────────────────┤       └──────────────────────┘
│ product_id (FK)  │
│ product_lot_id   │── new nullable FK → product_lots.id
│ quantity         │
│ unit_price       │
│ ...              │
└─────────────────┘
```

### Data Flow: Creación de Voucher con FIFO

```
VoucherService.create()
  │
  ├─ _build_items_and_totals()
  │     │
  │     └─ por cada item (si NO es cotización):
  │           ProductLotService.allocate_fifo(
  │               product_id, quantity_required, db
  │           )
  │           │
  │           ├─ BEGIN TX (implícita, misma que voucher)
  │           ├─ SELECT lotes activos WHERE quantity > 0
  │           │     ORDER BY expiration_date ASC NULLS LAST,
  │           │              received_date ASC
  │           │     FOR UPDATE
  │           ├─ Consumir secuencialmente:
  │           │     lote1.qty -= min(lote1.qty, needed)
  │           │     needed -= consumido
  │           │     lote2.qty -= min(lote2.qty, remaining)
  │           │     ...
  │           ├─ Si lote.qty == 0: quantity se queda en 0 (no se borra)
  │           ├─ UPDATE product.current_stock (vía @property en Python,
  │           │    pero como está en la misma sesión, el valor se actualiza)
  │           └─ RETURN last_lot_consumed_id
  │
  ├─ VoucherItem.product_lot_id = last_lot_consumed_id
  │
  └─ COMMIT (libera locks)
```

### Data Flow: Anulación de Voucher (soft_delete)

```
VoucherService.soft_delete()
  │
  ├─ _revert_stock_from_voucher()
  │     │
  │     └─ por cada VoucherItem con product_lot_id:
  │           ProductLotService.return_to_lot(
  │               product_lot_id, quantity_to_return
  │           )
  │           │
  │           ├─ SELECT lot FOR UPDATE
  │           ├─ lot.quantity += original_quantity
  │           └─ Product.current_stock se actualiza vía @property
  │              (en la misma sesión)
  │
  └─ COMMIT
```

### Data Flow: Ingreso de Stock

```
POST /api/product-lots (o PATCH /products/{id}/stock)
  │
  └─ ProductLotService.create_lot(data)
        │
        ├─ INSERT in product_lots
        ├─ Product.current_stock se recalcula vía @property
        │  (necesita refresh o reload de la relación)
        └─ COMMIT
```

## Architecture Decisions

### Decision 1: `current_stock` como @property en lugar de columna DB

| Option | Tradeoff | Decisión |
|--------|----------|----------|
| **@property + subquery en queries** | El @property necesita `active_lots` cargados. Las queries de listado con filtros/sort por stock requieren subquery explícita en SQL. El `FieldToUpdate.CURRENT_STOCK` se elimina del price update. | **Elegido** |
| column_property con subquery | Se comporta como columna en queries pero es derivada. No se puede asignar directamente. Puede causar N+1 si se accede sin eager loading. | Rechazado — menos explícito, conflictos con `deferred()` en async |
| Columna denormalizada + trigger | Consistencia garantizada por trigger DB. Código SQL más simple. Pero requiere trigger PostgreSQL y la lógica duplicada DB/código. | Rechazado — complejidad adicional, fuera del stack actual |

**Rationale**: La @property es el approach más explícito y mantenible. Para las queries de listado, se usa un scalar subquery de SQLAlchemy en `ProductService.list()` exclusivamente para filtros y ordenamiento. El resto del tiempo, `selectinload(Product.active_lots)` carga los datos.

**Impacto concreto**:
- `ProductService.list()`: cuando `sort_by='current_stock'` o `low_stock=True`, se inyecta un `scalar_subquery` en el WHERE/ORDER BY
- `products.py` router: el endpoint `price-update/apply` ya no soporta `FieldToUpdate.CURRENT_STOCK` (se elimina del field_map)
- `excel_service.py`: ya no mapea `current_stock` como columna de producto (el stock llega por lotes)
- `stock_report_service.py`: cambia `Product.current_stock` → usa el @property (cargando productos con `selectinload('lots')`)
- `_revert_stock_from_voucher()`: cambia de modificar `product.current_stock` a llamar `ProductLotService.return_to_lot()`

### Decision 2: `expiration_date` eliminada, reemplazada por `next_expiration` @property

**Rationale**: La fecha de vencimiento ahora pertenece al lote, no al producto. `next_expiration` computa `MIN(expiration_date)` de lotes activos.

**Impacto**: Se elimina de:
- `Product` model column
- `ProductCreate`, `ProductUpdate`, `ProductResponse` schemas
- `frontend/src/api/productsService.ts` (Product, ProductCreate, ProductUpdate interfaces)
- `frontend/src/types/index.ts` (Product interface)
- `excel_service.py` (import/export ya no mapea `vencimiento` → `expiration_date`)
- `backup_service.py` (si referencia el campo)

### Decision 3: Row-level locking con `SELECT ... FOR UPDATE`

**Rationale**: Dos ventas simultáneas al mismo producto pueden causar sobreventa (race condition). `FOR UPDATE` lockea las filas de `product_lots` seleccionadas dentro de la transacción, forzando a la segunda transacción a esperar.

**Implementation**: `ProductLotService.allocate_fifo()` usa `with_for_update()` en el select de lotes activos. La transacción es la misma que la del voucher (se pasa la misma `db` session).

## Detailed Design

### 1. New Model: `ProductLot`

**File**: `backend/app/models/product_lot.py`

```python
class ProductLot(BaseModel):
    __tablename__ = "product_lots"

    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.id"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)

    code = Column(String(50), nullable=False, index=True)  # "LEGACY-abc123", "LOTE-20260513-001"
    quantity = Column(Integer, default=0, nullable=False)    # Stock actual en este lote
    initial_quantity = Column(Integer, default=0, nullable=False)

    expiration_date = Column(Date, nullable=True)   # NULL = sin vencimiento
    cost_price = Column(Numeric(12, 2), nullable=True)
    received_date = Column(Date, nullable=False, default=date.today)

    # Relationships
    product = relationship("Product", back_populates="lots")
    business = relationship("Business")
```

### 2. Product Model Changes

**File**: `backend/app/models/product.py`

```python
# REMOVE columns:
#   current_stock = Column(Integer, ...)       # LÍNEA 91
#   expiration_date = Column(Date, ...)        # LÍNEA 97

# ADD relationship:
lots = relationship(
    "ProductLot",
    back_populates="product",
    lazy="selectin",
    primaryjoin="and_(ProductLot.product_id == Product.id, "
                 "ProductLot.deleted_at.is_(None))",
)

# ADD @property:
@property
def active_lots(self) -> list[ProductLot]:
    """Lotes activos (no eliminados, con stock > 0)."""
    return [lot for lot in self.lots
            if not lot.is_deleted and lot.quantity > 0]

@property
def current_stock(self) -> int:
    return sum(lot.quantity for lot in self.active_lots)

@property
def next_expiration(self) -> date | None:
    """Fecha de vencimiento más próxima entre lotes con stock."""
    dates = [lot.expiration_date for lot in self.active_lots
             if lot.expiration_date]
    return min(dates) if dates else None

# MODIFY @property is_low_stock — ya funciona porque usa self.current_stock
```

### 3. VoucherItem Changes

**File**: `backend/app/models/voucher_item.py`

```python
# ADD column:
product_lot_id = Column(
    UUID(as_uuid=True),
    ForeignKey("product_lots.id"),
    nullable=True,
    index=True,
)

# ADD relationship:
product_lot = relationship("ProductLot")
```

### 4. ProductLotService (NEW)

**File**: `backend/app/services/product_lot_service.py`

```python
class ProductLotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_lot(
        self,
        business_id: UUID,
        product_id: UUID,
        quantity: int,
        expiration_date: date | None = None,
        cost_price: Decimal | None = None,
        code: str | None = None,
    ) -> ProductLot:
        """Crea un nuevo lote. code autogenerado si no se provee."""
        ...

    async def allocate_fifo(
        self,
        product_id: UUID,
        quantity_required: int,
    ) -> tuple[list[tuple[UUID, int]], UUID | None]:
        """
        FIFO allocation with row-level locking.
        Returns (list of (lot_id, consumed_qty), last_lot_id).
        Raises ValueError if insufficient stock.
        Locks rows with FOR UPDATE.
        """
        if quantity_required <= 0:
            return [], None

        # SELECT lotes activos con FOR UPDATE
        query = (
            select(ProductLot)
            .where(
                ProductLot.product_id == product_id,
                ProductLot.deleted_at.is_(None),
                ProductLot.quantity > 0,
            )
            .order_by(ProductLot.expiration_date.asc().nullslast(),
                      ProductLot.received_date.asc())
            .with_for_update()
        )
        result = await self.db.execute(query)
        lots = list(result.scalars().all())

        total_available = sum(l.quantity for l in lots)
        if quantity_required > total_available:
            raise ValueError(
                f"Stock insuficiente: requerido {quantity_required}, "
                f"disponible {total_available}"
            )

        remaining = quantity_required
        consumed_lots: list[tuple[UUID, int]] = []
        last_lot_id: UUID | None = None

        for lot in lots:
            if remaining <= 0:
                break
            consume = min(lot.quantity, remaining)
            lot.quantity -= consume
            remaining -= consume
            consumed_lots.append((lot.id, consume))
            last_lot_id = lot.id

        return consumed_lots, last_lot_id

    async def return_to_lot(
        self,
        lot_id: UUID,
        quantity: int,
    ) -> ProductLot:
        """Devuelve stock a un lote específico (anulación de voucher)."""
        lot = await self.db.get(ProductLot, lot_id)
        if not lot or lot.is_deleted:
            raise ValueError("Lote no encontrado")
        lot.quantity += quantity
        return lot

    async def list_by_product(
        self,
        product_id: UUID,
        business_id: UUID,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[ProductLot], int]:
        """Lista lotes de un producto con paginación."""
        ...
```

### 5. ProductService Changes

**File**: `backend/app/services/product_service.py`

```python
# MODIFY list() — low_stock filter y sort_by='current_stock' usan subquery
from app.models.product_lot import ProductLot

# En el método list(), agregar subquery condicionalmente:
lot_sum_subq = (
    select(func.coalesce(func.sum(ProductLot.quantity), 0))
    .where(
        ProductLot.product_id == Product.id,
        ProductLot.deleted_at.is_(None),
        ProductLot.quantity > 0,
    )
    .correlate(Product)
    .scalar_subquery()
)

# Reemplazar low_stock filter:
if params.low_stock:
    base_conditions.append(lot_sum_subq <= Product.minimum_stock)

# Para sort_by='current_stock':
sort_map = {
    "description": Product.description,
    "sale_price": Product.sale_price,
    "current_stock": lot_sum_subq,  # ← antes era Product.current_stock
}
```

**REWRITE `update_stock()`** para delegar en ProductLotService:

```python
async def update_stock(
    self,
    product_id: UUID,
    business_id: UUID,
    quantity_change: int,
) -> Product | None:
    product = await self.get_by_id(product_id, business_id)
    if not product:
        return None

    lot_service = ProductLotService(self.db)
    if quantity_change > 0:
        await lot_service.create_lot(
            business_id=business_id,
            product_id=product_id,
            quantity=quantity_change,
            code=f"AJUSTE-{uuid4().hex[:8].upper()}",
        )
    elif quantity_change < 0:
        await lot_service.allocate_fifo(
            product_id=product_id,
            quantity_required=abs(quantity_change),
        )

    await self.db.commit()
    await self.db.refresh(product)
    return product
```

### 6. VoucherService Changes

**File**: `backend/app/services/voucher_service.py`

```python
# En _build_items_and_totals():
# Reemplazar:
#   product.current_stock -= int(item_data.quantity)
# Por:
from app.services.product_lot_service import ProductLotService

lot_service = ProductLotService(self.db)
_, last_lot_id = await lot_service.allocate_fifo(
    product_id=product.id,
    quantity_required=int(item_data.quantity),
)

# Asignar product_lot_id al item (solo si no es cotización)
if last_lot_id:
    voucher_item.product_lot_id = last_lot_id
```

Lo mismo en `_build_invoice_items_from_source_vouchers()`:

```python
# Reemplazar línea 676:
#   product.current_stock -= int(source_item.quantity)
# Por:
if not source_item.quantity < 0:  # evitar revertir devoluciones dos veces
    _, last_lot_id = await lot_service.allocate_fifo(
        product_id=product.id,
        quantity_required=int(source_item.quantity),
    )
```

**REWRITE `_revert_stock_from_voucher()`**:

```python
def _revert_stock_from_voucher(self, voucher: Voucher) -> None:
    for item in voucher.items:
        if item.product_lot_id and item.quantity:
            # Sincrónico: usamos db.execute directo
            lot = self.db.get(ProductLot, item.product_lot_id)
            if lot and not lot.is_deleted:
                lot.quantity += int(item.quantity)
```

### 7. Router Endpoints (NEW)

**File**: `backend/app/routers/product_lots.py`

```
GET    /api/products/{product_id}/lots     → listar lotes de un producto
POST   /api/product-lots                    → crear lote manual
GET    /api/product-lots/{id}               → detalle de lote

Dependency: require_module_access("products") (mismo módulo que productos)
```

**File**: `backend/app/routers/products.py` — cambios menores:

```python
# price-update/preview y apply:
# REMOVER FieldToUpdate.CURRENT_STOCK del field_map
# El stock ya no se actualiza por price update

# PATCH /products/{id}/stock:
# Se mantiene pero delega en ProductLotService (ver arriba)
```

### 8. Schema Changes

**File**: `backend/app/schemas/product_lot.py` (NEW)

```python
class ProductLotCreate(BaseSchema):
    product_id: UUID
    quantity: int = Field(..., gt=0)
    expiration_date: date | None = None
    cost_price: Decimal | None = None
    code: str | None = None  # autogenerado si no se provee

class ProductLotResponse(BaseResponse):
    product_id: UUID
    business_id: UUID
    code: str
    quantity: int
    initial_quantity: int
    expiration_date: date | None
    cost_price: Decimal | None
    received_date: date
```

**File**: `backend/app/schemas/product.py` — cambios:

```python
# ProductCreate: REMOVER current_stock y expiration_date
# ProductUpdate: REMOVER current_stock y expiration_date
# ProductResponse: current_stock: int (se mantiene, computado), REMOVER expiration_date, AGREGAR next_expiration: str | None
```

### 9. Frontend Changes

**File**: `frontend/src/api/productsService.ts`

```typescript
// Product: REMOVER expiration_date, AGREGAR next_expiration? (opcional en v1)
// ProductCreate: REMOVER current_stock, expiration_date
// ProductUpdate: REMOVER current_stock, expiration_date
```

**File**: `frontend/src/types/index.ts`

```typescript
// Product: REMOVER expiration_date (línea ~55)
```

### 10. Stock Report Service Changes

**File**: `backend/app/services/reporting/stock_report_service.py`

```python
# _get_products() — AGREGAR selectinload(Product.lots)
query = (
    select(Product)
    .options(
        selectinload(Product.category),
        selectinload(Product.supplier),
        selectinload(Product.lots),  # ← NUEVO para que current_stock @property funcione
    )
    .where(...)
)
```

### 11. Excel Service Changes

**File**: `backend/app/services/excel_service.py`

```python
# confirm_import(): REMOVER línea 290: expiration_date=row.expiration_date
# export_products(): REMOVER columna 'vencimiento' (opcional en v1)
# preview_import(): REMOVER parsing de 'vencimiento'
```

## Migration Plan

### Migration: `abc123def456_add_product_lots.py`

**Step 1 — Create table**:
```python
op.create_table(
    "product_lots",
    sa.Column("id", postgresql.UUID(), ...),
    sa.Column("product_id", postgresql.UUID(), nullable=False),
    sa.Column("business_id", postgresql.UUID(), nullable=False),
    sa.Column("code", sa.String(50), nullable=False),
    sa.Column("quantity", sa.Integer(), default=0, nullable=False),
    sa.Column("initial_quantity", sa.Integer(), default=0, nullable=False),
    sa.Column("expiration_date", sa.Date(), nullable=True),
    sa.Column("cost_price", sa.Numeric(12, 2), nullable=True),
    sa.Column("received_date", sa.Date(), nullable=False),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("deleted_at", sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(["product_id"], ["products.id"], ),
    sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ),
    sa.PrimaryKeyConstraint("id"),
)
op.create_index("ix_product_lots_product_id", "product_lots", ["product_id"])
op.create_index("ix_product_lots_business_id", "product_lots", ["business_id"])
```

**Step 2 — Data migration**:
```python
# Por cada producto con current_stock > 0, crear un lote LEGACY
conn = op.get_bind()
products = conn.execute(
    text("SELECT id, business_id, current_stock, expiration_date FROM products "
         "WHERE deleted_at IS NULL AND current_stock > 0")
).fetchall()

for p in products:
    lot_code = f"LEGACY-{p.id[:8].upper()}"
    conn.execute(
        text(
            "INSERT INTO product_lots "
            "(id, product_id, business_id, code, quantity, initial_quantity, "
            " expiration_date, received_date, created_at, updated_at) "
            "VALUES (gen_random_uuid(), :pid, :bid, :code, :qty, :qty, "
            " :exp_date, CURRENT_DATE, NOW(), NOW())"
        ),
        {
            "pid": p[0],
            "bid": p[1],
            "code": lot_code,
            "qty": p[2],
            "exp_date": p[3],  # puede ser None
        },
    )
```

**Step 3 — Add `product_lot_id` to `voucher_items`**:
```python
op.add_column(
    "voucher_items",
    sa.Column("product_lot_id", postgresql.UUID(), nullable=True),
)
op.create_index("ix_voucher_items_product_lot_id", "voucher_items", ["product_lot_id"])
op.create_foreign_key(
    "fk_voucher_items_product_lot",
    "voucher_items", "product_lots",
    ["product_lot_id"], ["id"],
)
```

**Step 4 — Drop columns from `products`**:
```python
op.drop_column("products", "current_stock")
op.drop_column("products", "expiration_date")
```

**Down migration**: recrear columnas, popular desde lotes, dropear tablas.

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/app/models/product_lot.py` | **Create** | Nuevo modelo ProductLot |
| `backend/app/models/product.py` | **Modify** | current_stock→@property, sacar expiration_date, agregar active_lots, lots relationship, next_expiration |
| `backend/app/models/voucher_item.py` | **Modify** | Agregar product_lot_id FK → product_lots.id |
| `backend/app/models/__init__.py` | **Modify** | Exportar ProductLot |
| `backend/app/schemas/product_lot.py` | **Create** | Schemas ProductLotCreate/Response |
| `backend/app/schemas/product.py` | **Modify** | Sacar current_stock y expiration_date de Create/Update. Response mantiene current_stock (computado), agrega next_expiration |
| `backend/app/services/product_lot_service.py` | **Create** | create_lot, allocate_fifo, return_to_lot, list_by_product |
| `backend/app/services/product_service.py` | **Modify** | list() usa subquery para stock. update_stock delega en lotes |
| `backend/app/services/voucher_service.py` | **Modify** | _build_items_and_totals usa allocate_fifo y asigna product_lot_id. _revert_stock_from_voucher usa return_to_lot |
| `backend/app/services/reporting/stock_report_service.py` | **Modify** | selectinload('lots') + current_stock vía @property |
| `backend/app/services/excel_service.py` | **Modify** | Sacar mapeo de current_stock y expiration_date |
| `backend/app/routers/product_lots.py` | **Create** | Endpoints CRUD de lotes |
| `backend/app/routers/products.py` | **Modify** | Sacar CURRENT_STOCK de price_update field_map |
| `backend/app/routers/__init__.py` | **Modify** | Registrar router product_lots |
| `frontend/src/api/productsService.ts` | **Modify** | Sacar expiration_date de interfaces |
| `frontend/src/types/index.ts` | **Modify** | Sacar expiration_date de Product |
| `backend/alembic/versions/abc123def456_add_product_lots.py` | **Create** | Migration create table + data + drop columns |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit — ProductLotService | `allocate_fifo` con 2 lotes, 1 lote, stock insuficiente, NULL expiration | Pytest + AsyncSession, test con repositorio en memoria o fixture PostgreSQL |
| Unit — ProductLotService | `create_lot` crea lotes con code autogenerado | Verificar code, quantity, product_id |
| Unit — ProductLotService | `return_to_lot` devuelve stock correctamente | fixture con lote, return_to_lot, verificar quantity |
| Integration — VoucherService | Crear voucher con 2 lotes FIFO | Test end-to-end: crear lotes → crear voucher → verificar `VoucherItem.product_lot_id` y lotes consumidos |
| Integration — VoucherService | Soft delete voucher revierte lotes | Crear voucher → soft_delete → verificar lotes restaurados |
| Integration — ProductService | `list()` con sort_by='current_stock' | PaginatedResponse items ordenados correctamente |
| Integration — ProductService | `list()` con low_stock filter | Productos con stock bajo aparecen en resultado |
| Integration — Product | @property `current_stock` | Suma de lotes activos = current_stock |
| Integration — Product | @property `next_expiration` | Fecha correcta entre lotes |
| Migration | Data migration: legacy lot creado | Test offline: correr upgrade, verificar lotes creados, productos sin current_stock columna |
| E2E | Crear venta → PDF → stock correcto | Opcional v1 |

## Key Implementation Details

### Row-level locking

```python
query = (
    select(ProductLot)
    .where(...)
    .order_by(...)
    .with_for_update()  # ← BLOQUEA FILAS
)
```

Esto evita que dos transacciones simultáneas consuman el mismo lote. La segunda transacción espera hasta que la primera haga COMMIT o ROLLBACK. Esto implica:

- La session DB debe estar en una transacción (lo está si usamos `commit()` después)
- El timeout de espera es manejado por PostgreSQL (`lock_timeout`)
- Si la espera excede, PostgreSQL lanza error y la transacción se aborta

### Handling NULL expiration_date

```python
.order_by(ProductLot.expiration_date.asc().nullslast(),
          ProductLot.received_date.asc())
```

Los lotes sin vencimiento (NULL) se consumen DESPUÉS de todos los que tienen fecha. Entre lotes con mismo expiration_date (o ambos NULL), se ordena por received_date (más antiguo primero).

### Performance: product list with stock filter

El subquery para `low_stock` y `sort_by='current_stock'` es eficiente porque:
- Es un `COALESCE(SUM(...), 0)` correlacionado — solo suma filas de `product_lots` para el producto actual
- PostgreSQL ejecuta esto como un `Index Only Scan` si hay índice en `(product_id, quantity)`
- No afecta productos sin lotes (retorna 0)

Índice compuesto a crear en la migración:
```python
op.create_index(
    "ix_product_lots_product_quantity",
    "product_lots",
    ["product_id", "quantity"],
    postgresql_where=text("deleted_at IS NULL AND quantity > 0"),
)
```

### Transaction boundaries

- `allocate_fifo` se llama DENTRO de la transacción del voucher (antes del `commit()`)
- Si el voucher falla por otra razón (pagos, ARCA, etc.), el ROLLBACK revierte también el consumo de lotes (misma transacción)
- `return_to_lot` también se ejecuta dentro de la transacción del `soft_delete`

**No se necesita transacción anidada** porque `allocate_fifo` y `return_to_lot` usan la misma `AsyncSession` que el voucher. SQLAlchemy maneja todo como una sola transacción hasta el `commit()`.

## Open Questions

- [ ] `update_stock` del router PATCH /products/{id}/stock: en v1 se mantiene delegando en lotes, pero ¿el frontend llama a este endpoint? ¿O usamos POST /product-lots en su lugar?
- [ ] El `FieldToUpdate.CURRENT_STOCK` se elimina del price update. ¿Hay algún reporte/script que dependa de poder ajustar stock masivamente por API?
- [ ] ¿`next_expiration` se expone en ProductResponse desde v1 o solo agregamos `current_stock` y `next_expiration` queda para v2?
- [ ] Frontend Products.tsx: ¿muestra `expiration_date` actualmente? Si sí, hay que ocultar la columna. ¿O se reemplaza por `next_expiration`?
