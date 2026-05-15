# Tasks: Product Lots — Stock con lotes y vencimiento

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2500-3500 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Foundation) → PR 2 (Services) → PR 3 (Frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Modelo + migración + schemas + endpoints base | PR 1 | Base: main. No rompe nada existente. |
| 2 | ProductLotService, cambios en ProductService, VoucherService FIFO, revert | PR 2 | Base: main. Depende de PR 1 para los modelos. |
| 3 | Frontend: Products.tsx + modal de lotes | PR 3 | Base: main. Depende de PR 2 para los endpoints. |

---

## Phase 1: Foundation — Modelo, migración, schemas, endpoints base

- [ ] 1.1 Crear `backend/app/models/product_lot.py`: `ProductLot` con FK a `products` y `businesses`, `code`, `quantity`, `initial_quantity`, `expiration_date`, `cost_price`, `received_date`, + BaseModel timestamps + `deleted_at`
- [ ] 1.2 Agregar `active_lots` relationship y `@property current_stock` (suma de lotes) y `@property next_expiration` (min fecha no vencidos con stock) a `Product`
- [ ] 1.3 Eliminar columna `expiration_date` del modelo `Product`, dejar `current_stock` como columna temporal (se dropea en migration final)
- [ ] 1.4 Agregar `product_lot_id: UUID, nullable=True, FK a product_lots.id` a `VoucherItem`
- [ ] 1.5 Crear `backend/app/schemas/product_lot.py`: `ProductLotCreate`, `ProductLotUpdate`, `ProductLotResponse`
- [ ] 1.6 Modificar `backend/app/schemas/product.py`: hacer `current_stock` read-only en `ProductResponse` + agregar `next_expiration`, `lots_count`; eliminar `expiration_date` de create/update; agregar `current_stock` como opcional en `ProductCreate` para crear lote inicial
- [ ] 1.7 Generar migración Alembic: crear `product_lots`, agregar `product_lot_id` a `voucher_items`
- [ ] 1.8 Agregar endpoints en `backend/app/routers/products.py`: `GET /{id}/lots`, `POST /{id}/lots`, `PATCH /api/tenant/product-lots/{id}`
- [ ] 1.9 Agregar valores a `FieldToUpdate` si CURRENT_STOCK sigue siendo necesario o marcar como deprecado

## Phase 2: Servicios — Lógica FIFO e integración con ventas

- [ ] 2.1 Crear `backend/app/services/product_lot_service.py` con `create()`, `list_by_product()`, `fifo_consume()` (SELECT FOR UPDATE, ORDER BY expiration ASC NULLS LAST, received_date ASC), `restore_lot()`
- [ ] 2.2 Modificar `ProductService.create()`: si `current_stock > 0`, crear producto + lote inicial vía `ProductLotService`; ignorar `expiration_date`
- [ ] 2.3 Modificar `ProductService.update()`: ignorar `current_stock` y `expiration_date` si vienen en payload
- [ ] 2.4 Modificar `ProductService.update_stock()`: si `quantity_change > 0` crear lote, si `< 0` consumir vía `fifo_consume()`
- [ ] 2.5 Modificar `ProductService.list()`: `sort_by=current_stock` y `low_stock` filter usar subquery SUM(lots.quantity); `bulk_update()` ignorar `current_stock` y `expiration_date`
- [ ] 2.6 Modificar `VoucherService._build_items_and_totals()`: si NO es cotización, reemplazar `product.current_stock -= qty` por `ProductLotService.fifo_consume()` y setear `VoucherItem.product_lot_id`
- [ ] 2.7 Modificar `VoucherService._build_invoice_items_from_source_vouchers()`: mismo FIFO para conversión cotización/factura
- [ ] 2.8 Modificar `VoucherService._revert_stock_from_voucher()`: restaurar stock al lote original usando `VoucherItem.product_lot_id`

## Phase 3: Migración de datos y limpieza

- [ ] 3.1 Crear script/migración: por cada producto con `current_stock > 0`, insertar `ProductLot(code=LEGACY-{product_id[:8]}, quantity=current_stock, initial_quantity=current_stock, expiration_date=product.expiration_date, received_date=product.created_at)`
- [ ] 3.2 Migración Alembic: dropear columna `current_stock` de `products` y columna `expiration_date` de `products`
- [ ] 3.3 Modificar schemas/product.py `ProductCreate`: `current_stock` pasa de columna de BD a campo opcional solo para crear lote inicial

## Phase 4: Frontend — Productos y modal de lotes

- [ ] 4.1 Modificar `frontend/src/pages/Products.tsx`: eliminar campo `expiration_date` del create/edit form; `current_stock` read-only en edición (muestra suma de lotes); columna "Vencimiento" usa `next_expiration`
- [ ] 4.2 Agregar indicador visual: rojo si `next_expiration < today`, amarillo si <= 30 días
- [ ] 4.3 Agregar botón "Lotes" por fila → modal con tabla de lotes (código, cantidad, vence, costo, recibido)
- [ ] 4.4 Agregar formulario "Ingresar stock" dentro del modal → crea lote nuevo via `POST /{id}/lots`
- [ ] 4.5 Agregar hook o query de TanStack Query `useProductLots(productId)` en frontend

## Phase 5: Tests

- [ ] 5.1 Tests unitarios para `ProductLotService.create()` y `list_by_product()`
- [ ] 5.2 Tests unitarios para `fifo_consume()`: consume de lote único, múltiples lotes orden FIFO, stock insuficiente
- [ ] 5.3 Tests de integración: `POST /products/{id}/lots` crear y listar lotes
- [ ] 5.4 Tests de integración: crear venta que consuma stock vía FIFO y verificar lotes afectados
- [ ] 5.5 Tests de integración: revertir voucher y verificar que el stock vuelve al lote original
- [ ] 5.6 Test de migración: verificar que productos legacy reciben lote con datos correctos
