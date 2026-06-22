# Plan de Ejecución: Integración Mercado Libre — OctopusTrack

> Documento para agente de código. Ejecutar las fases en orden. Cada fase termina con criterios de aceptación verificables. No avanzar a la siguiente fase sin cumplirlos.

---

## Contexto del proyecto

- **Repo**: monorepo con `backend/` (FastAPI + SQLAlchemy async + PostgreSQL + Alembic) y `frontend/` (React 18 + TypeScript + TailwindCSS + React Query + Zustand).
- **Multi-tenant**: cada usuario tiene un `business`. Toda entidad nueva debe estar scopeada por `business_id`.
- **Convenciones existentes**: routers en `backend/app/routers/`, lógica de negocio en `backend/app/services/`, modelos en `backend/app/models/`, schemas Pydantic en `backend/app/schemas/`. Respetar el estilo de los módulos existentes (`products`, `suppliers`) para naming, paginación y manejo de errores.
- **Objetivo**: desde OctopusTrack poder (1) conectar la cuenta de Mercado Libre de un negocio vía OAuth, (2) publicar productos del inventario en ML, (3) sincronizar precio y stock automáticamente hacia ML cuando cambian localmente, y (4) recibir ventas de ML vía webhooks y descontar stock localmente.

## Decisiones de arquitectura (no negociables)

1. **Un solo módulo de integración**: todo el código de ML vive en `backend/app/services/meli/` y `backend/app/routers/meli.py`. No esparcir lógica de ML en otros servicios; los servicios existentes solo emiten eventos/llamadas al módulo meli.
2. **Tokens por negocio**: `access_token` (expira en 6 hs) y `refresh_token` se guardan cifrados por `business_id`. El refresh token de ML es **de un solo uso**: cada refresh devuelve un refresh_token nuevo que DEBE persistirse atómicamente. Usar un lock (a nivel DB, `SELECT ... FOR UPDATE`) para evitar dos refresh concurrentes que invaliden el token.
3. **Sincronización saliente asíncrona**: los cambios de precio/stock locales NO llaman a ML inline en el request. Se encolan en una tabla `meli_sync_queue` y un worker los procesa (patrón outbox). Esto evita que un timeout de ML rompa una venta local.
4. **Webhooks idempotentes**: ML puede reenviar la misma notificación varias veces. Procesar órdenes con idempotencia por `order_id`.
5. **Responder webhooks rápido**: el endpoint de notificaciones responde `200` inmediatamente y encola el procesamiento en background. ML espera respuesta en menos de 500 ms.

---

## Fase 0 — Preparación y configuración

### 0.1 Variables de entorno

Agregar a `.env.example` y a `backend/app/config.py` (Settings de Pydantic):

```env
# Mercado Libre
MELI_CLIENT_ID=
MELI_CLIENT_SECRET=
MELI_REDIRECT_URI=http://localhost:8000/api/v1/meli/oauth/callback
MELI_SITE_ID=MLA            # Argentina
MELI_API_BASE=https://api.mercadolibre.com
MELI_AUTH_BASE=https://auth.mercadolibre.com.ar
MELI_TOKEN_ENCRYPTION_KEY=  # Fernet key para cifrar tokens en DB
MELI_WEBHOOK_SECRET=        # opcional, validación adicional propia
```

### 0.2 Dependencias

Agregar a `backend/requirements.txt` si no están:
- `httpx` (cliente HTTP async)
- `cryptography` (Fernet para cifrar tokens)
- `tenacity` (retries con backoff)

### Criterios de aceptación Fase 0
- [ ] `Settings` carga las nuevas variables y la app levanta con `.env.example` copiado.
- [ ] `pip install -r requirements.txt` corre sin errores.

---

## Fase 1 — Modelos y migraciones

Crear `backend/app/models/meli.py` con tres tablas. Generar migración Alembic (`alembic revision --autogenerate -m "add meli integration tables"`).

### 1.1 `meli_credentials`

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| business_id | FK businesses, UNIQUE | una conexión ML por negocio |
| meli_user_id | BigInteger | id del seller en ML |
| meli_nickname | String | para mostrar en UI |
| access_token_enc | Text | cifrado con Fernet |
| refresh_token_enc | Text | cifrado con Fernet |
| expires_at | DateTime(tz) | expiración del access_token |
| scopes | String | |
| status | Enum: `connected`, `revoked`, `error` | |
| created_at / updated_at | | |

### 1.2 `meli_listings`

Mapeo producto local ↔ publicación ML. Es el corazón de la integración.

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| business_id | FK businesses, index | |
| product_id | FK products, index | |
| meli_item_id | String, UNIQUE (ej: `MLA123456789`) | |
| meli_permalink | String | link a la publicación |
| listing_type_id | String (`gold_special`, etc.) | |
| status | String (`active`, `paused`, `closed`, `under_review`) | espejo del estado en ML |
| sync_price | Boolean, default true | si sincroniza precio automáticamente |
| sync_stock | Boolean, default true | si sincroniza stock automáticamente |
| price_markup_pct | Numeric, nullable | recargo % opcional sobre el precio local (cubrir comisión ML) |
| last_synced_at | DateTime(tz), nullable | |
| last_sync_error | Text, nullable | |
| created_at / updated_at | | |

Constraint: UNIQUE (`business_id`, `product_id`, `meli_item_id`).

### 1.3 `meli_sync_queue` (outbox)

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| business_id | FK | |
| listing_id | FK meli_listings, nullable | |
| kind | Enum: `update_stock`, `update_price`, `pause`, `activate`, `process_order` | |
| payload | JSONB | datos necesarios (nuevo stock, order_id, etc.) |
| status | Enum: `pending`, `processing`, `done`, `failed` | |
| attempts | Integer, default 0 | |
| last_error | Text, nullable | |
| created_at / processed_at | | |

Índice parcial sobre `status = 'pending'`.

### 1.4 `meli_orders` (registro idempotente de ventas)

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| business_id | FK | |
| meli_order_id | BigInteger, UNIQUE | idempotencia |
| status | String (estado de la orden en ML) | |
| raw | JSONB | respuesta completa de GET /orders/{id} |
| stock_applied | Boolean, default false | si ya se descontó stock local |
| created_at / updated_at | | |

### Criterios de aceptación Fase 1
- [ ] `alembic upgrade head` corre limpio sobre una DB con el schema actual.
- [ ] Regenerar `database/schema.sql` con `python scripts/generate_schema.py` e incluir las tablas nuevas.
- [ ] Modelos exportados en `models/__init__.py` siguiendo el patrón existente.

---

## Fase 2 — Cliente HTTP de Mercado Libre

Crear `backend/app/services/meli/client.py` con la clase `MeliClient`.

### 2.1 Responsabilidades

- Construir requests a `MELI_API_BASE` con `Authorization: Bearer {token}`.
- **Refresh automático**: antes de cada llamada, si `expires_at` está a menos de 5 minutos, refrescar. Si una llamada devuelve `401`, refrescar una vez y reintentar.
- Refresh: `POST /oauth/token` con `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`. Persistir el nuevo par de tokens **antes** de usar el access_token (transacción con `FOR UPDATE` sobre la fila de `meli_credentials`).
- Retries con backoff exponencial (tenacity) para `429` y `5xx`, máximo 3 intentos. Respetar header `Retry-After` si viene.
- Si el refresh devuelve `invalid_grant`, marcar la credencial como `status='error'` y NO reintentar en loop.

### 2.2 Interfaz mínima

```python
class MeliClient:
    def __init__(self, session: AsyncSession, business_id: UUID): ...
    async def get(self, path: str, **kw) -> dict: ...
    async def post(self, path: str, json: dict) -> dict: ...
    async def put(self, path: str, json: dict) -> dict: ...
    # helpers de dominio
    async def get_me(self) -> dict                      # GET /users/me
    async def predict_category(self, title: str) -> dict # GET /sites/{site}/domain_discovery/search?q=
    async def get_category_attributes(self, category_id: str) -> list
    async def create_item(self, payload: dict) -> dict   # POST /items
    async def update_item(self, item_id: str, payload: dict) -> dict  # PUT /items/{id}
    async def get_item(self, item_id: str) -> dict
    async def get_order(self, order_id: int) -> dict     # GET /orders/{id}
```

### 2.3 Regla importante de precios (vigente desde 18/03/2026)

Si una publicación tiene **automatización de precios activa**, un `PUT /items/{id}` que actualice **solo** el campo `price` es rechazado con `400`. Antes de actualizar precio, consultar el ítem y, si tiene automatización activa, registrar el error en `last_sync_error` y saltear (no romper la cola).

### Criterios de aceptación Fase 2
- [ ] Tests unitarios con `httpx.MockTransport`: refresh por expiración, refresh por 401, retry por 429, persistencia atómica del nuevo refresh_token.
- [ ] Tokens nunca aparecen en logs.

---

## Fase 3 — Flujo OAuth

Crear `backend/app/routers/meli.py` y registrarlo en `main.py` bajo prefijo `/api/v1/meli`.

### 3.1 Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1/meli/oauth/authorize-url` | (autenticado) Devuelve la URL de autorización de ML con `state` firmado (JWT corto con `business_id` + nonce, exp 10 min) |
| GET | `/api/v1/meli/oauth/callback` | Recibe `code` y `state`. Valida `state`, intercambia el code por tokens (`POST /oauth/token`, `grant_type=authorization_code`), llama `GET /users/me`, hace upsert en `meli_credentials`, redirige al frontend (`/settings/integrations?meli=connected`) |
| GET | `/api/v1/meli/status` | Estado de la conexión del negocio: `connected/disconnected/error`, nickname, expiración |
| DELETE | `/api/v1/meli/connection` | Desconecta: borra credenciales (o marca `revoked`) |

### 3.2 Notas

- URL de autorización: `{MELI_AUTH_BASE}/authorization?response_type=code&client_id={id}&redirect_uri={uri}&state={state}`.
- El callback NO requiere auth de OctopusTrack (viene de redirect del navegador): la identidad sale del `state` firmado.
- Validar que el negocio no esté ya conectado a otro `meli_user_id` sin desconectar antes.

### Criterios de aceptación Fase 3
- [ ] Flujo completo probado contra usuarios de prueba de ML (`POST /users/test_user` con un token de la app).
- [ ] `state` inválido o vencido → 400, sin crear credenciales.
- [ ] Test de integración del callback con el intercambio de token mockeado.

---

## Fase 4 — Publicar productos en ML

Crear `backend/app/services/meli/publisher.py`.

### 4.1 Endpoints nuevos en `routers/meli.py`

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/v1/meli/categories/predict?title=` | Proxy al predictor de categorías de ML |
| GET | `/api/v1/meli/categories/{id}/attributes` | Atributos (marcar cuáles son `required`) |
| POST | `/api/v1/meli/listings` | Publica un producto. Body: `product_id`, `category_id`, `listing_type_id`, `price` (default: precio local + markup), `title` (default: nombre del producto), `attributes[]`, `pictures[]` (URLs), `condition` (default `new`) |
| GET | `/api/v1/meli/listings` | Lista publicaciones del negocio con estado de sync (paginado, filtro por status y por producto) |
| POST | `/api/v1/meli/listings/link` | Vincula un producto local con una publicación ML **ya existente** (body: `product_id`, `meli_item_id`). Valida con `GET /items/{id}` que pertenezca al seller conectado |
| PATCH | `/api/v1/meli/listings/{id}` | Cambiar `sync_price`, `sync_stock`, `price_markup_pct` |
| POST | `/api/v1/meli/listings/{id}/pause` y `/activate` | Encolan `pause`/`activate` |

### 4.2 Payload de `POST /items` (publicar)

```json
{
  "title": "...",
  "category_id": "MLA...",
  "price": 15000,
  "currency_id": "ARS",
  "available_quantity": 10,
  "condition": "new",
  "listing_type_id": "gold_special",
  "pictures": [{"source": "https://..."}],
  "attributes": [{"id": "BRAND", "value_name": "FV"}, {"id": "MODEL", "value_name": "..."}]
}
```

- Validar atributos requeridos de la categoría antes de enviar; si faltan, devolver 422 con la lista de faltantes para que el frontend los pida.
- Si ML responde error de validación, devolver el detalle al frontend de forma legible.
- Al crear ok: guardar `meli_item_id`, `permalink`, `status` en `meli_listings`. Estado inicial puede ser `under_review` — es normal.
- La descripción se carga aparte: `POST /items/{id}/description` con `{"plain_text": "..."}`. Hacerlo inmediatamente después de crear el ítem.

### Criterios de aceptación Fase 4
- [ ] Publicación end-to-end contra usuario de prueba de ML (categoría de test) crea el ítem y persiste el mapping.
- [ ] Productos sin precio o sin stock > 0 → error claro antes de llamar a ML.
- [ ] No se puede publicar dos veces el mismo producto sin cerrar el listing anterior (validar unique).

---

## Fase 5 — Sincronización saliente de stock y precio (outbox + worker)

Crear `backend/app/services/meli/sync.py` y un worker.

### 5.1 Encolado (hooks en el código existente)

Identificar en `services/` los puntos donde cambia el stock o el precio de un producto:
1. Edición de producto (PUT /products/{id}) — cambio de precio o stock manual.
2. Actualización masiva de precios (módulo existente de `price_update_drafts`).
3. Confirmación de ventas locales (vouchers que descuentan stock).
4. Órdenes de compra recibidas (suman stock).

En cada punto, después del commit local, si el producto tiene `meli_listings` activos con `sync_stock`/`sync_price` habilitado, insertar filas en `meli_sync_queue` (`kind=update_stock` / `update_price` con el valor nuevo en `payload`). **No** llamar a ML inline.

Implementarlo como una función única `enqueue_product_sync(session, product, changed: set[str])` llamada desde esos puntos, para no duplicar lógica.

### 5.2 Worker

- Implementar como tarea asyncio lanzada en el lifespan de FastAPI (loop cada 5 segundos que toma hasta N=20 jobs `pending` con `FOR UPDATE SKIP LOCKED`). Si el proyecto ya usa algún scheduler/cola, usar ese en su lugar.
- **Coalescing**: si hay varios jobs pendientes del mismo `listing_id` y mismo `kind`, procesar solo el más reciente y marcar los anteriores como `done` (superseded).
- Por job: construir el `PUT /items/{meli_item_id}`:
  - `update_stock` → `{"available_quantity": X}`. Si X == 0 y el ítem es `condition=new`, ML lo pausa automáticamente; reflejar status.
  - `update_price` → `{"price": precio_local * (1 + markup/100)}`. Aplicar la verificación de automatización de precios (Fase 2.3).
- Backoff: `attempts += 1`; reintentar con espera exponencial; a los 5 intentos marcar `failed` y guardar `last_error` en el listing.
- Actualizar `last_synced_at` en éxito.

### Criterios de aceptación Fase 5
- [ ] Vender un producto en OctopusTrack (voucher confirmado) genera job y el stock baja en ML (test con usuario de prueba o mock).
- [ ] La actualización masiva de precios de 100 productos genera jobs y el worker los coalescea sin duplicar PUTs.
- [ ] Un fallo de ML no afecta la transacción local de la venta.

---

## Fase 6 — Webhooks: recibir ventas de ML

### 6.1 Endpoint

`POST /api/v1/meli/notifications` — público (sin JWT de OctopusTrack).

Comportamiento:
1. Parsear body: `{"resource": "/orders/123", "user_id": 999, "topic": "orders_v2", ...}`.
2. Responder `200` **inmediatamente** (< 500 ms). Todo lo demás en background.
3. En background: buscar `meli_credentials` por `meli_user_id == user_id`. Si no existe, descartar.
4. Encolar job `process_order` con el `order_id` extraído del resource.

Configurar en el DevCenter de ML la URL de callbacks y suscribirse al topic `orders_v2` (documentarlo en el README, es configuración manual).

### 6.2 Procesamiento de la orden (en el worker)

1. `GET /orders/{order_id}`.
2. Upsert en `meli_orders` por `meli_order_id` (idempotencia). Si ya existe con `stock_applied=true`, terminar.
3. Si `status` de la orden es `paid` (o `paid` dentro de `payments`): por cada `order_items[]`, resolver `item.id` → `meli_listings` → `product_id`, y descontar `quantity` del stock local **dentro de una transacción**, marcando `stock_applied=true` en la misma transacción.
4. Importante: el descuento local de stock por venta ML **no debe re-encolar** un `update_stock` hacia ML para ese mismo listing (ML ya descontó su stock). Pasar un flag `origin='meli'` a `enqueue_product_sync` para excluir el listing origen, pero SÍ sincronizar otros listings del mismo producto si existieran.
5. Órdenes `cancelled` después de aplicadas: revertir stock (sumar de nuevo) y marcar en `meli_orders`.
6. Registrar el movimiento de stock con el mecanismo de auditoría existente si lo hay (o nota en el producto), referenciando la orden ML.

### Criterios de aceptación Fase 6
- [ ] Reenviar 5 veces la misma notificación descuenta stock UNA sola vez.
- [ ] Notificación de un `user_id` desconocido → 200 y descarte silencioso.
- [ ] Test de integración: webhook → job → GET /orders mockeado → stock local actualizado.

---

## Fase 7 — Frontend (React)

### 7.1 Configuración / conexión

- Nueva sección **Integraciones** en Settings: card de Mercado Libre con estado (`/api/v1/meli/status`), botón "Conectar" (abre `authorize-url`) y "Desconectar".

### 7.2 Página "Mercado Libre" en el menú principal

- Tabla de publicaciones (`GET /api/v1/meli/listings`): producto local, título ML, link (permalink), precio ML, stock, status, last_synced_at, errores. Filtros por estado.
- Toggles por fila para `sync_price` / `sync_stock`, edición de `price_markup_pct`.
- Acciones: pausar / activar.

### 7.3 Wizard "Publicar en Mercado Libre"

Desde la página de Productos (acción por fila) o desde la página ML:
1. **Paso 1**: seleccionar producto (preseleccionado si viene de Productos). Mostrar precio y stock actual.
2. **Paso 2**: título editable → llamar al predictor de categorías, mostrar sugerencias, permitir elegir.
3. **Paso 3**: formulario dinámico con los atributos `required` de la categoría.
4. **Paso 4**: precio (con campo de markup % y preview del precio final), tipo de publicación, fotos (URLs por ahora; si el sistema ya maneja imágenes de producto, usarlas).
5. Confirmar → `POST /api/v1/meli/listings` → mostrar resultado con link a la publicación.

También un modal "Vincular publicación existente" que pide el `meli_item_id` o URL y llama a `/listings/link`.

### 7.4 Convenciones

- Usar React Query para todo el data fetching, siguiendo los hooks existentes en `frontend/src/api/`.
- Tipos TypeScript en `frontend/src/types/meli.ts` espejando los schemas Pydantic.
- Respetar tema claro/oscuro y componentes UI existentes.

### Criterios de aceptación Fase 7
- [ ] Flujo conectar → publicar → ver en tabla → pausar funciona end-to-end contra el backend.
- [ ] Errores de validación de ML (atributos faltantes) se muestran de forma legible en el wizard.

---

## Fase 8 — Tests, docs y cierre

1. **Tests backend** (pytest + httpx mock): client (refresh/retries), oauth callback, publisher (payload y validación de atributos), worker (coalescing, backoff), webhook (idempotencia, reversión por cancelación).
2. **README**: sección "Integración Mercado Libre" con: cómo crear la app en el DevCenter, configurar redirect URI y URL de notificaciones, variables de entorno, cómo crear usuarios de prueba.
3. **CHECKLIST.md**: marcar la integración ML del roadmap.
4. Revisar que ningún endpoint nuevo filtre datos entre negocios (todos los queries filtran por `business_id` del usuario autenticado, salvo callback OAuth y webhook que resuelven la identidad por `state`/`meli_user_id`).

---

## Orden de ejecución sugerido para el agente

```
Fase 0 → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6 → Fase 7 → Fase 8
```

Commits atómicos por fase con mensaje `feat(meli): <fase>`. Correr la suite de tests existente después de cada fase para no romper nada.

## Errores comunes a evitar (leer antes de codear)

- ❌ Guardar tokens en texto plano o loguearlos.
- ❌ Refrescar el token en dos requests concurrentes (el refresh_token es single-use → se invalida la sesión).
- ❌ Llamar a la API de ML dentro de la transacción de una venta local.
- ❌ Procesar el webhook sincrónicamente antes de responder 200.
- ❌ Descontar stock dos veces por notificaciones duplicadas.
- ❌ Re-sincronizar hacia ML el stock que ML mismo acaba de descontar (loop).
- ❌ Hacer PUT solo con `price` en ítems con automatización de precios activa (400 desde 18/03/2026).
- ❌ Hardcodear `MLA`: usar `MELI_SITE_ID` de config.
