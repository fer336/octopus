# PRD — Sistema de Gestión Comercial para Sanitarios, Ferreterías y Corralones

## 1. Visión General

### 1.1 Descripción del Producto
Sistema ERP web diseñado específicamente para comercios del rubro sanitarios, ferreterías y corralones. Permite gestionar el ciclo comercial completo: desde la carga de productos y actualización masiva de precios, hasta la emisión de cotizaciones, remitos y facturas electrónicas con integración a ARCA (AFIP).

### 1.2 Stack Tecnológico
- **Backend:** FastAPI (Python)
- **Frontend:** React (TypeScript)
- **Base de datos:** PostgreSQL
- **Autenticación:** Google OAuth 2.0 con sesión activa de 30 minutos
- **Generación de documentos:** PDF (cotizaciones, remitos, facturas)
- **Facturación electrónica:** Integración con ARCA (ex AFIP)

### 1.3 Usuarios Objetivo
Dueños, administradores y vendedores de sanitarios, ferreterías y corralones que necesitan digitalizar y profesionalizar su gestión comercial diaria.

---

## 2. Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │  Ventas   │ │Inventario│ │ Clientes │ │  Reportes  │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API (JSON)
┌───────────────────────┴─────────────────────────────────┐
│                   Backend (FastAPI)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │   Auth    │ │ Productos│ │Facturación│ │    PDF     │ │
│  │  Google   │ │ & Precios│ │   ARCA   │ │ Generator  │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└───────────────────────┬─────────────────────────────────┘
                        │
              ┌─────────┴─────────┐
              │    PostgreSQL      │
              └───────────────────┘
```

---

## 3. Módulos del Sistema

### 3.1 Autenticación y Sesiones
- Inicio de sesión mediante Google OAuth 2.0
- Sesión activa con expiración a los 30 minutos de inactividad
- Refresh token para renovar sesión sin re-login mientras el usuario esté activo
- Roles básicos: Administrador, Vendedor (fase futura — ver sección 12)

### 3.2 Apertura y Cierre de Caja

#### 3.2.1 Descripción General
Sistema de control de caja diaria. Cada negocio tiene una única caja por día. Todas las ventas confirmadas, cobros de cuenta corriente e ingresos/egresos manuales se registran como movimientos dentro de la caja activa.

#### 3.2.2 Reglas de Negocio

**Apertura:**
- Solo se puede tener **una caja abierta** por negocio a la vez
- Al abrir se declara el **monto inicial de efectivo** (fondo de caja)
- Sin caja abierta, el sistema **bloquea** la emisión de cualquier comprobante (cotización, remito o factura)

**Bloqueo de facturación:**
- Si el operador intenta confirmar una venta sin caja abierta → aparece un modal obligatorio que ofrece abrir la caja en ese momento
- Si la caja lleva más de **24 horas abierta** → banner de alerta en todo el sistema y bloqueo al intentar facturar; el operador debe cerrar la caja vencida antes de continuar

**Movimientos automáticos:**
- Cada comprobante confirmado genera un movimiento tipo `SALE` por cada método de pago utilizado
- Cada pago recibido de cuenta corriente genera un movimiento tipo `PAYMENT_RECEIVED`

**Movimientos manuales:**
- El operador puede registrar ingresos (`INCOME`) o egresos (`EXPENSE`) con descripción, monto y método de pago

**Cierre:**
- Se presenta un resumen por método de pago con el total esperado
- El operador ingresa el efectivo físico contado
- Si hay diferencia (faltante/sobrante) → campo de motivo **obligatorio**
- El cierre genera un **PDF resumen** del día automáticamente
- Una vez cerrada, la caja no puede reabrirse; el día siguiente se abre una nueva
- El cierre se imputa a la **fecha actual** aunque la caja haya sido abierta el día anterior

#### 3.2.3 Estados de la Caja

```
SIN CAJA HOY  →  OPEN (abierta)  →  CLOSED (cerrada)
                    ↑
              Si >24hs: estado EXPIRED (bloquea facturación)
```

#### 3.2.4 Pantalla de Caja (`/caja`)

**Sin caja abierta:**
- Card centrada con input de monto inicial y botón "Abrir Caja"

**Con caja abierta:**
- Header: hora de apertura, monto inicial, tiempo transcurrido, badge de estado
- Tabla de movimientos del día en tiempo real (ventas, cobros, ingresos, egresos)
- Totales agrupados por método de pago
- Botones: `+ Ingreso` · `- Egreso` · `Cerrar Caja`

**Modal de cierre:**
- Resumen readonly por método de pago (ventas + cobros + manuales)
- Total esperado en efectivo (calculado automáticamente)
- Input: "Efectivo físico contado"
- Diferencia calculada en tiempo real (verde = cuadra, rojo = no cuadra)
- Si diferencia ≠ 0 → campo de motivo obligatorio
- Botón "Confirmar Cierre" → cierra la caja y genera PDF

**Sidebar:**
- Ítem "Caja" con badge de estado: 🟢 Abierta · 🔴 Cerrada · 🟡 Vencida (+24hs)

#### 3.2.5 Banner Global (caja vencida)
Cuando la caja lleva más de 24hs abierta, se muestra un banner amarillo persistente debajo del header en todas las páginas con el mensaje y un botón directo a `/caja`.

---

### 3.3 Gestión de Productos e Inventario

#### 3.2.1 Estructura del Producto
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador interno único |
| `codigo` | String | Código interno del negocio |
| `codigo_producto` | String | Código del fabricante/proveedor |
| `descripcion` | String | Nombre/descripción del producto |
| `categoria_id` | FK | Relación a la tabla de categorías |
| `proveedor_id` | FK | Relación a la tabla de proveedores |
| `precio_costo` | Decimal | Precio de costo |
| `precio_lista` | Decimal | Precio de lista del proveedor |
| `precio_sin_iva` | Decimal | Precio neto sin IVA |
| `precio_venta` | Decimal | Precio de venta final (calculado) |
| `bonificacion_1` | Decimal (%) | Primer descuento/bonificación |
| `bonificacion_2` | Decimal (%) | Segundo descuento/bonificación |
| `bonificacion_3` | Decimal (%) | Tercer descuento/bonificación |
| `descuento_suma` | String | Representación legible ej: "20+30+10" |
| `stock_actual` | Integer | Cantidad en stock |
| `iva` | Decimal (%) | Alícuota de IVA (10.5%, 21%, 27%, exento) |
| `activo` | Boolean | Si el producto está activo |
| `created_at` | Timestamp | Fecha de creación |
| `updated_at` | Timestamp | Última actualización |

#### 3.3.2 Lógica de Cálculo de Precio
El precio final se calcula aplicando bonificaciones en cadena sobre el precio de lista:
```
precio_con_bonif = precio_lista × (1 - bonif1/100) × (1 - bonif2/100) × (1 - bonif3/100)
precio_venta = precio_con_bonif + IVA
```

#### 3.3.3 Carga y Actualización Masiva de Precios
- Importación de productos mediante archivos Excel (.xlsx, .xls)
- El sistema debe mapear columnas del Excel a los campos del producto
- Actualización automática de precios: al subir un nuevo Excel, se actualizan los precios de los productos existentes (match por `codigo` o `codigo_producto`)
- Registro de historial de cambios de precio (fecha, precio anterior, precio nuevo)
- Vista previa de cambios antes de confirmar la actualización

### 3.4 Gestión de Clientes

#### 3.4.1 Datos del Cliente
- Razón social / Nombre
- CUIT/CUIL/DNI
- Condición ante IVA (Responsable Inscripto, Monotributista, Consumidor Final, Exento)
- Dirección (calle, número, localidad, provincia, código postal)
- Teléfono, Email
- Observaciones

#### 3.3.2 Cuenta Corriente del Cliente
- Registro de todos los movimientos: facturas emitidas, pagos recibidos, notas de crédito
- Saldo actual (deuda pendiente)
- Historial de mercadería llevada (detalle de productos por comprobante)
- Estado de cuenta imprimible en PDF

### 3.4 Gestión de Proveedores
- Razón social
- CUIT
- Contacto (teléfono, email, dirección)
- Productos asociados
- Condiciones comerciales (bonificaciones habituales, plazos)

### 3.5 Gestión de Categorías
- Nombre de la categoría
- Descripción (opcional)
- Categorías jerárquicas (categoría padre → subcategoría)
- Asociación a productos

### 3.6 Módulo de Ventas (Pantalla Unificada)

#### 3.6.1 Diseño de la Pantalla
La pantalla de ventas es la vista principal y concentra todo el flujo de venta en una sola interfaz dividida en dos secciones:

**Sección Superior:**
- Selector de tipo de comprobante: Cotización / Remito / Factura
- Buscador de cliente (autocompletado por nombre, CUIT o código)
- Botón para crear cliente rápido si no existe
- Datos del cliente seleccionado (razón social, CUIT, condición IVA)
- Fecha del comprobante
- Observaciones

**Sección Inferior:**
- Buscador de productos (por código, código producto o descripción)
- Tabla de ítems agregados con columnas: Código, Descripción, Cantidad, Precio Unitario, Bonificación, Subtotal
- Posibilidad de editar cantidad, precio y descuento por ítem directamente en la tabla
- Botones de acción: quitar ítem, limpiar todo
- Resumen: Subtotal, IVA, Total
- Botones finales: Guardar borrador, Generar PDF, Emitir Factura Electrónica

#### 3.6.2 Flujo de Trabajo
1. Seleccionar tipo de comprobante
2. Buscar y seleccionar cliente
3. Buscar y agregar productos (uno a uno, con búsqueda rápida)
4. Ajustar cantidades y descuentos si es necesario
5. Revisar totales
6. Generar comprobante (PDF y/o factura electrónica)

### 3.7 Cotizaciones
- Generación de cotización en PDF con membrete del negocio
- Datos incluidos: cliente, lista de productos, precios, subtotales, total
- Vigencia configurable (ej: 7 días, 15 días)
- Posibilidad de convertir cotización en remito o factura
- Numeración automática

### 3.8 Remitos
- Generación de remito en PDF
- **Dos modos de impresión:**
  - **Con precios:** incluye precio unitario, subtotales y total
  - **Sin precios:** solo muestra código, descripción y cantidad (para entrega de mercadería)
- Numeración automática
- Firma del receptor (campo en blanco en el PDF)
- Descuenta stock al confirmar

### 3.9 Facturación Electrónica (ARCA/AFIP)
- Integración con web services de ARCA para emisión de comprobantes electrónicos
- Tipos de comprobante: Factura A, B, C según condición del emisor y receptor
- Obtención de CAE (Código de Autorización Electrónico)
- Generación de PDF con formato fiscal (incluye código de barras, QR, CAE, fecha de vencimiento)
- Notas de crédito y débito
- Almacenamiento de comprobantes emitidos

### 3.10 Generación de PDF
Todos los documentos (cotizaciones, remitos, facturas) se generan como PDF con:
- Logo y datos del negocio (membrete configurable)
- Datos del cliente
- Tabla de productos con detalle
- Totales y condiciones
- Numeración correlativa
- Para facturas: datos fiscales obligatorios (CAE, código de barras, QR)

**PDF de cierre de caja:** Generado automáticamente al cerrar la caja. Ver especificación completa en sección 4.6.6.

### 3.12 Módulo de Control de Inventario y Órdenes de Pedido

#### 3.12.1 Descripción General

Módulo que permite al operador realizar un conteo físico del stock, registrar las diferencias encontradas y generar una Orden de Pedido al proveedor con las cantidades necesarias. Las órdenes de pedido quedan registradas en el sistema y son consultables históricamente, similar a como se listan las actualizaciones de precios.

#### 3.12.2 Flujo Completo

```
1. Operador elige filtro (categoría y/o proveedor)
2. Sistema genera PDF de planilla de conteo (columna "Conteo" en blanco)
3. Operador imprime y recorre el depósito anotando cantidades reales
4. Operador vuelve al sistema y carga el conteo por producto
5. Sistema muestra diferencias entre stock del sistema vs. stock contado
6. Operador define cantidades a pedir para cada producto
7. Sistema calcula el costo total de la orden (precio con bonificaciones + IVA al final)
8. Operador confirma → se crea la Orden de Pedido en el sistema
9. Se puede descargar el PDF de la Orden de Pedido
```

#### 3.12.3 Pantalla de Control de Inventario (`/inventario`)

**Vista principal — Lista de órdenes de pedido:**
- Tabla con historial de todas las órdenes generadas (similar a la vista de importación de precios):
  - Número de orden
  - Fecha de creación
  - Proveedor
  - Categoría (si aplica)
  - Cantidad de ítems
  - Total de la orden (costo)
  - Estado: `BORRADOR` · `CONFIRMADA`
  - Acciones: Ver detalle · Editar · Descargar PDF
- Botón "Nueva Orden de Pedido" destacado

**Modal / Panel de nueva orden:**

*Paso 1 — Selección de filtros:*
- Select: "Proveedor" (opcional)
- Select: "Categoría" (opcional)
- Al menos uno de los dos es obligatorio
- Botón "Generar Planilla de Conteo" → descarga el PDF de la planilla

*Paso 2 — Carga de conteo:*
- Tabla con todos los productos del filtro seleccionado:
  - Código | Descripción | Categoría | Proveedor | Stock sistema | Input "Conteo físico" | Diferencia (calculada)
- La diferencia se calcula en tiempo real: `conteo - stock_sistema`
- Diferencia positiva (sobrante) en verde, negativa (faltante) en rojo

*Paso 3 — Definir cantidades a pedir:*
- Tabla con los productos donde `conteo < stock_sistema` (los que hay que reponer), pre-seleccionados pero editables:
  - Código | Descripción | Stock sistema | Conteo | Faltante | Input "Cantidad a pedir" | Precio costo (calculado) | Subtotal
- El operador puede ajustar manualmente la cantidad a pedir
- El operador puede **editar el precio de costo** de cada ítem en caso de haber recibido una actualización del proveedor
- El precio de costo se calcula automáticamente:
  ```
  precio_costo = precio_lista × (1 - bonif1/100) × (1 - bonif2/100) × (1 - bonif3/100)
  ```
- Subtotal por ítem = `precio_costo × cantidad_a_pedir`
- Al pie de la tabla:
  - Subtotal neto (suma de todos los ítems sin IVA)
  - IVA total (suma del IVA de cada ítem según su alícuota configurada)
  - **Total de la orden** = Subtotal neto + IVA total
- Botones: "Cancelar" · "Guardar como borrador" · "Confirmar Orden"

#### 3.12.4 Modelo de Datos — Orden de Pedido

**Tabla `purchase_orders`:**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `business_id` | FK | Negocio al que pertenece |
| `supplier_id` | FK → suppliers | Proveedor de la orden (puede ser null si se filtró por categoría) |
| `category_id` | FK → categories | Categoría filtrada (puede ser null si se filtró por proveedor) |
| `status` | Enum | `DRAFT` · `CONFIRMED` |
| `subtotal` | Decimal | Total sin IVA |
| `total_iva` | Decimal | IVA total de la orden |
| `total` | Decimal | Total final (subtotal + IVA) |
| `notes` | Text | Observaciones opcionales |
| `created_by` | FK → users | Usuario que creó la orden |
| `confirmed_at` | Timestamp | Fecha de confirmación (null si borrador) |
| `created_at` | Timestamp | Fecha de creación |
| `updated_at` | Timestamp | Última actualización |

**Tabla `purchase_order_items`:**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `purchase_order_id` | FK | Orden a la que pertenece |
| `product_id` | FK → products | Producto |
| `system_stock` | Integer | Stock del sistema al momento del conteo |
| `counted_stock` | Integer | Stock físico contado por el operador |
| `quantity_to_order` | Integer | Cantidad definida a pedir |
| `unit_cost` | Decimal | Precio de costo unitario (editable manualmente) |
| `iva_rate` | Decimal | Alícuota de IVA del producto (%) |
| `subtotal` | Decimal | `unit_cost × quantity_to_order` (sin IVA) |
| `iva_amount` | Decimal | `subtotal × iva_rate / 100` |
| `total` | Decimal | `subtotal + iva_amount` |

#### 3.12.5 PDF de Orden de Pedido

**Encabezado:**
- Membrete del negocio
- Título: "Orden de Pedido N° [número]"
- Fecha de emisión
- Datos del proveedor (razón social, CUIT, contacto)
- Categoría filtrada (si aplica)

**Tabla de ítems:**

| Columna | Descripción |
|---|---|
| Código | Código interno del producto |
| Descripción | Nombre del producto |
| Categoría | Categoría del producto |
| Stock sistema | Stock registrado al momento del conteo |
| Conteo | Stock físico contado |
| Cant. a pedir | Cantidad definida a solicitar |
| Precio costo | Precio unitario neto (con bonificaciones, sin IVA) |
| IVA % | Alícuota de IVA |
| Subtotal | `precio_costo × cant_a_pedir` |

**Pie de tabla:**
- Subtotal neto (suma de todos los subtotales sin IVA)
- Desglose de IVA por alícuota (ej: "IVA 21%: $X.XXX · IVA 10.5%: $X.XXX")
- **TOTAL DE LA ORDEN** en negrita y destacado

**Formato:**
- Diseño apaisado (landscape), A4
- Colores corporativos configurables
- Nombre de archivo: `orden_pedido_[proveedor]_NRO_YYYY_MM_DD.pdf`

#### 3.12.6 Lógica de Cálculo del Costo

El precio de costo de cada ítem se calcula aplicando todas las bonificaciones en cadena sobre el precio de lista, sin agregar IVA (el IVA se suma globalmente al final del reporte):

```
precio_costo_unitario = precio_lista
                        × (1 - bonif1 / 100)
                        × (1 - bonif2 / 100)
                        × (1 - bonif3 / 100)

subtotal_item         = precio_costo_unitario × cantidad_a_pedir
iva_item              = subtotal_item × (iva_rate / 100)

--- Al pie del reporte ---
subtotal_neto_orden   = Σ subtotal_item (todos los ítems)
iva_total_orden       = Σ iva_item (todos los ítems, agrupados por alícuota)
total_orden           = subtotal_neto_orden + iva_total_orden
```

El operador puede sobrescribir `precio_costo_unitario` manualmente por ítem si el proveedor informó un precio diferente.

#### 3.12.7 Features Futuras (Fase 4)
- Envío de la Orden de Pedido al proveedor por email directamente desde el sistema
- Envío por WhatsApp (link directo con PDF adjunto)
- Registro de recepción de mercadería contra la orden (actualización automática de stock)
- Alerta cuando una orden lleva más de X días sin ser recibida

---

### 3.11 Módulo de Reportes en PDF

Sistema de reportes imprimibles para análisis y control del negocio. Todos los reportes se generan en PDF profesional con membrete del negocio.

#### 3.11.1 Reporte de Stock (Control de Inventario)

**Propósito:** Control completo del inventario actual del negocio.

**Contenido:**
- Tabla de todos los productos activos con:
  - Código interno
  - Código de producto
  - Descripción
  - Categoría
  - Proveedor
  - Stock actual
  - Precio de costo
  - Precio de venta
  - Valor total en stock (stock × precio costo)
- Totales al pie:
  - Total de ítems en inventario
  - Valor total del stock
  - Cantidad de productos con stock bajo (< umbral configurable)

**Filtros opcionales:**
- Mostrar solo productos con stock bajo
- Filtrar por estado (activo/inactivo)
- Ordenar por: stock ascendente/descendente, valor, código

**Formato:**
- Diseño apaisado (landscape) para acomodar todas las columnas
- Agrupamiento opcional por categoría

#### 3.11.2 Reporte por Categoría

**Propósito:** Análisis de productos agrupados por categoría.

**Contenido:**
- Sección por cada categoría con:
  - Nombre de la categoría como encabezado
  - Tabla de productos de esa categoría:
    - Código
    - Descripción
    - Proveedor
    - Stock actual
    - Precio de venta
  - Subtotales por categoría:
    - Cantidad de productos en la categoría
    - Stock total de la categoría
    - Valor total en stock de la categoría

**Filtros opcionales:**
- Seleccionar categorías específicas
- Incluir/excluir subcategorías

**Formato:**
- Cada categoría claramente diferenciada visualmente
- Resumen general al final con totales de todas las categorías

#### 3.11.3 Reporte por Proveedor

**Propósito:** Control de productos por proveedor para análisis de compras y gestión de relaciones comerciales.

**Contenido:**
- Datos del proveedor (razón social, CUIT, contacto)
- Tabla de productos del proveedor:
  - Código interno
  - Código de producto
  - Descripción
  - Categoría
  - Stock actual
  - Precio de lista
  - Bonificaciones aplicadas
  - Precio de costo final
  - Precio de venta
  - Margen de ganancia (%)
- Totales del proveedor:
  - Cantidad de productos activos
  - Stock total
  - Valor total en stock
  - Margen promedio de ganancia

**Filtros opcionales:**
- Incluir solo productos con stock
- Ordenar por: margen de ganancia, stock, precio

**Formato:**
- Encabezado con datos completos del proveedor
- Destacar productos con margen bajo o negativo

#### 3.11.4 Reporte de Ventas por Período

**Propósito:** Análisis de ventas en un rango de fechas.

**Contenido:**
- Parámetros del reporte (fecha desde, fecha hasta)
- Resumen ejecutivo:
  - Total de comprobantes emitidos
  - Total facturado
  - Total en cotizaciones
  - Total en remitos
  - Ticket promedio
- Detalle de comprobantes:
  - Fecha
  - Tipo (cotización/remito/factura)
  - Número
  - Cliente
  - Total
- Gráfico de barras con ventas por día (opcional)
- Top 10 productos más vendidos en el período:
  - Descripción
  - Cantidad vendida
  - Total facturado
- Top 10 clientes por volumen de compra

**Filtros opcionales:**
- Tipo de comprobante (solo facturas, solo cotizaciones, etc.)
- Cliente específico
- Categoría de producto

**Formato:**
- Primera página con resumen ejecutivo y gráficos
- Páginas siguientes con detalle completo

#### 3.11.5 Reporte de Cuenta Corriente del Cliente

**Propósito:** Estado de deuda y movimientos de un cliente específico.

**Contenido:**
- Datos del cliente (razón social, CUIT, condición IVA, contacto)
- Resumen de cuenta:
  - Saldo anterior
  - Total facturado en el período
  - Total pagado en el período
  - Saldo actual
- Detalle de movimientos:
  - Fecha
  - Tipo de movimiento (factura/pago/nota de crédito)
  - Número de comprobante
  - Debe
  - Haber
  - Saldo
- Detalle de facturas impagas:
  - Número de factura
  - Fecha de emisión
  - Días de atraso
  - Monto pendiente

**Filtros opcionales:**
- Rango de fechas
- Solo movimientos pendientes

**Formato:**
- Encabezado con datos del cliente y resumen
- Tabla de movimientos estilo extracto bancario
- Destacar en rojo facturas vencidas

#### 3.11.6 Reporte de Control de Inventario Físico (Planilla de Conteo)

**Propósito:** Documento imprimible que el operador lleva al depósito para contar físicamente el stock de los productos. Una vez completado el conteo en papel, los datos se cargan en el sistema para generar la Orden de Pedido al proveedor.

**Filtros disponibles (al menos uno obligatorio):**
- Filtrar por **categoría** específica (select)
- Filtrar por **proveedor** específico (select)
- Ambos filtros pueden combinarse

**Columnas del PDF (landscape):**

| Columna | Descripción |
|---|---|
| Código | Código interno del producto |
| Descripción | Nombre/descripción del producto |
| Categoría | Categoría a la que pertenece |
| Proveedor | Proveedor del producto |
| Stock actual | Stock registrado en el sistema al momento de generar el reporte |
| Conteo | Columna en blanco — el operador escribe el conteo físico |

**Formato:**
- Diseño apaisado (landscape), A4
- Filas con suficiente altura para escritura manual (mínimo 10mm)
- Alternar color de filas para facilitar la lectura (blanco / gris muy claro)
- Encabezado con membrete del negocio, nombre del reporte, categoría/proveedor seleccionado, fecha y hora de generación
- Footer con número de página y total de productos listados
- Sin precios (es solo una planilla de conteo)

**Nombre de archivo:** `control_inventario_[categoria|proveedor]_YYYY_MM_DD.pdf`

#### 3.11.7 Características Comunes de Todos los Reportes

**Header del PDF:**
- Logo y datos del negocio (membrete)
- Nombre del reporte
- Fecha y hora de generación
- Usuario que generó el reporte (opcional)
- Número de página (ej: "Página 1 de 5")

**Footer del PDF:**
- Texto configurable (ej: "Sistema de Gestión Comercial - Tu Negocio")
- Número de página

**Diseño:**
- Tipografía legible y profesional
- Tablas con líneas separadoras claras
- Colores corporativos del negocio (configurables)
- Responsive print: tablas grandes se paginan automáticamente

**Exportación:**
- Descarga directa desde el navegador
- Nombre de archivo descriptivo: `reporte_stock_2026_02_18.pdf`
- Opción de enviar por email (fase futura)

#### 3.11.7 Especificaciones Técnicas de Diseño Visual

**Paleta de Colores (por defecto, configurable por negocio):**

| Rol | Color | Código Hex | Uso |
|---|---|---|---|
| Primario | Azul | `#2563eb` | Headers, títulos, badges |
| Primario oscuro | Azul oscuro | `#1d4ed8` | Gradientes |
| Fondo sección | Azul muy claro | `#eff6ff` / `#dbeafe` | Fondos de secciones |
| Alerta | Rojo | `#dc2626` | Stock bajo, saldos negativos, vencidos |
| Positivo | Verde | `#059669` | Stock normal, pagos, créditos |
| Advertencia | Amarillo claro | `#fef3c7` | Highlight de filas con stock bajo |
| Texto principal | Gris oscuro | `#1f2937` | Títulos, datos importantes |
| Texto secundario | Gris medio | `#6b7280` | Labels, metadatos |
| Texto terciario | Gris claro | `#9ca3af` | Footer, información secundaria |

**Especificaciones por Tipo de Reporte:**

*Reporte de Stock y Proveedor (Landscape):*
- Tamaño de página: A4 apaisado (297mm × 210mm)
- Márgenes: 2cm superior/inferior, 1.5cm izquierda/derecha
- Anchura de columnas referencial: Código 10%, Descripción 25%, Categoría 12%, Proveedor 15%, Stock 8%, P.Costo 10%, P.Venta 10%, Valor 10%

*Reporte de Ventas, Categoría y Cuenta Corriente (Portrait):*
- Tamaño de página: A4 vertical (210mm × 297mm)
- Márgenes: 2cm superior/inferior, 1.5cm izquierda/derecha

**Tipografía:**
- Títulos principales: Segoe UI Bold, 20–24pt
- Headers de tabla: Segoe UI Semibold, 8pt, mayúsculas
- Contenido de tabla: Segoe UI Regular, 9–10pt
- Códigos y precios: Courier New 9pt (monoespaciado para alineación de decimales)
- Subtítulos de sección: Segoe UI Semibold, 11–12pt

**Reglas de Destacado Visual:**

*Fila con stock bajo (Reporte de Stock):*
- Fondo de fila: `#fef3c7` (amarillo claro)
- Texto: `#92400e` (marrón oscuro), negrita
- Valor de stock: `#dc2626` (rojo), negrita

*Saldo negativo (Cuenta Corriente):*
- Fondo del valor: `#fef2f2` (rojo muy claro)
- Texto del valor: `#dc2626` (rojo), negrita
- Padding: 4px 8px, border-radius: 4px

*Sección de facturas vencidas (Cuenta Corriente):*
- Fondo de sección: `#fef2f2`, borde izquierdo 4px `#dc2626`
- Badge de días de atraso: fondo `#dc2626`, texto blanco, negrita

*Badges de categoría:*
- Fondo: `#dbeafe` (azul claro), texto: `#1e40af` (azul oscuro)
- Padding: 3px 8px, border-radius: 4px, font-size: 8pt, negrita

*Margen bajo o negativo (Reporte de Proveedor):*
- Valor en amarillo/rojo según severidad (< 10% amarillo, negativo rojo)

**Paginación:**
- Los headers de tabla se repiten en cada página (`thead-group` o equivalente WeasyPrint)
- Las filas no se cortan entre páginas (`page-break-inside: avoid`)
- Numeración automática: "Página X de Y" en el footer

**Archivos Demo de Referencia:**
Existen templates HTML funcionales para visualización y como base de los templates Jinja2:
- `backend/app/templates/pdf/reports/stock_report_demo.html` — Reporte de Stock (landscape)
- `backend/app/templates/pdf/reports/client_account_demo.html` — Cuenta Corriente (portrait)

---

## 4. Interfaz de Usuario (UI/UX)

### 4.1 Principios de Diseño
- **Intuitiva:** Navegación clara, acciones principales siempre visibles
- **Eficiente:** Mínimos clics para tareas frecuentes (crear venta, buscar producto)
- **Responsive:** Preparada para futura versión mobile
- **Accesible:** Contraste adecuado, tamaños legibles, navegación por teclado

### 4.2 Temas
- **Modo claro** (por defecto)
- **Modo oscuro**
- Toggle de cambio accesible desde el header

### 4.3 Layout General
- **Sidebar izquierdo:** Navegación principal (Dashboard, Ventas, Productos, Clientes, Proveedores, Categorías, Caja, Reportes, Inventario, Configuración)
- **Header:** Logo, nombre del negocio, selector de tema, usuario logueado, cerrar sesión
- **Área principal:** Contenido dinámico según sección
- **Banner global de caja vencida:** Aparece debajo del header en todas las páginas cuando la caja lleva más de 24hs abierta (ver 3.2.5)

### 4.4 Pantallas Principales
1. **Dashboard:** Resumen de ventas del día, productos con stock bajo, últimos comprobantes
2. **Ventas:** Pantalla unificada (descrita en 3.6)
3. **Productos:** Lista con búsqueda, filtros por categoría/proveedor, CRUD completo
4. **Clientes:** Lista, detalle con cuenta corriente, CRUD
5. **Proveedores:** Lista, detalle, CRUD
6. **Categorías:** Gestión jerárquica
7. **Caja:** Apertura, movimientos del día y cierre de caja (descrita en 3.2.4 y 4.6)
8. **Reportes:** Centro de reportes con generación de PDF (stock, categorías, proveedores, ventas, cuentas corrientes)
9. **Inventario:** Control de inventario físico y gestión de órdenes de pedido (descrito en 3.12)
10. **Configuración:** Datos del negocio, membrete, preferencias de facturación

### 4.5 Pantalla de Reportes — Diseño

La pantalla de reportes es el centro de análisis del negocio. Debe ser visual, intuitiva y permitir generar reportes rápidamente.

#### 4.5.1 Layout de la Pantalla

**Sección Superior:**
- Título: "Reportes"
- Selector de tipo de reporte (grid de cards):
  - Card "Control de Stock" con ícono de paquete
  - Card "Por Categoría" con ícono de carpeta
  - Card "Por Proveedor" con ícono de camión
  - Card "Ventas por Período" con ícono de gráfico
  - Card "Cuenta Corriente" con ícono de documento
  - Card "Planilla de Conteo" con ícono de clipboard (redirige a `/inventario`)

**Sección de Filtros (dinámica según tipo de reporte):**

Cada tipo de reporte muestra sus filtros específicos:

**Para Reporte de Stock:**
- Checkbox: "Solo productos con stock bajo"
- Checkbox: "Solo productos activos"
- Select: "Ordenar por" (Stock ascendente, Stock descendente, Valor, Código)
- Checkbox: "Agrupar por categoría"

**Para Reporte por Categoría:**
- Select múltiple: "Seleccionar categorías" (si está vacío, todas)
- Checkbox: "Incluir subcategorías"

**Para Reporte por Proveedor:**
- Autocomplete: "Seleccionar proveedor" (obligatorio)
- Checkbox: "Solo productos con stock"
- Select: "Ordenar por" (Margen de ganancia, Stock, Precio)

**Para Reporte de Ventas:**
- Date picker: "Desde" (obligatorio)
- Date picker: "Hasta" (obligatorio)
- Select: "Tipo de comprobante" (Todos, Solo facturas, Solo cotizaciones, Solo remitos)
- Autocomplete: "Cliente específico" (opcional)
- Select múltiple: "Categorías" (opcional)

**Para Reporte de Cuenta Corriente:**
- Autocomplete: "Seleccionar cliente" (obligatorio)
- Date picker: "Desde" (opcional)
- Date picker: "Hasta" (opcional)
- Checkbox: "Solo movimientos pendientes"

**Sección de Acción:**
- Botón grande destacado: "Generar Reporte PDF"
- Loading state mientras se genera el PDF
- Al finalizar, descarga automática del PDF

#### 4.5.2 Experiencia de Usuario

1. **Selección de reporte:** El usuario hace clic en una de las cards de tipo de reporte
2. **Card activa:** La card seleccionada se destaca visualmente (borde azul, fondo más claro)
3. **Filtros aparecen:** Con animación suave, aparecen los filtros específicos del reporte
4. **Validación en tiempo real:** 
   - Campos obligatorios se marcan si faltan
   - Rangos de fechas se validan (desde < hasta)
5. **Generar reporte:**
   - Al hacer clic, el botón muestra loading spinner
   - El backend genera el PDF (< 3 segundos)
   - El navegador descarga automáticamente el archivo
   - Se muestra toast de confirmación: "Reporte generado exitosamente"
6. **Historial (opcional):** Lista de últimos 10 reportes generados con fecha y hora

#### 4.5.3 Estados de la Pantalla

- **Idle:** Sin reporte seleccionado, solo se muestran las cards
- **Seleccionado:** Card activa, filtros visibles, botón habilitado/deshabilitado según validación
- **Generando:** Botón en loading state, filtros deshabilitados
- **Error:** Toast con mensaje de error, botón vuelve a estado normal
- **Éxito:** Descarga automática, toast de confirmación, pantalla vuelve a estado "Seleccionado"

### 4.6 Pantalla de Caja — Diseño (`/caja`)

La pantalla de caja cambia completamente según el estado actual del día.

#### 4.6.1 Estado: Sin Caja Abierta

```
┌─────────────────────────────────────────────────────────┐
│                         CAJA                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              ┌─────────────────────────┐                │
│              │   No hay caja abierta   │                │
│              │                         │                │
│              │  Monto inicial (ARS)    │                │
│              │  ┌─────────────────┐    │                │
│              │  │   $ 0,00        │    │                │
│              │  └─────────────────┘    │                │
│              │                         │                │
│              │  [ Abrir Caja ]         │                │
│              └─────────────────────────┘                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Card centrada en la pantalla
- Input numérico con formato moneda para el fondo inicial
- Botón "Abrir Caja" — crea el registro `cash_register` con `status = OPEN`
- Si la caja del día ya fue cerrada, mostrar mensaje informativo: "La caja de hoy ya fue cerrada. Mañana podrás abrir una nueva."

#### 4.6.2 Estado: Caja Abierta

```
┌─────────────────────────────────────────────────────────┐
│  CAJA  │  Abierta desde 08:30  │  Fondo: $5.000  │ 🟢  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  MOVIMIENTOS DEL DÍA                                    │
│  ┌──────────┬───────────────────┬──────────┬──────────┐ │
│  │  Hora    │  Descripción      │  Método  │  Monto   │ │
│  ├──────────┼───────────────────┼──────────┼──────────┤ │
│  │ 09:15    │ Venta #0001-00045 │ Efectivo │ +$3.200  │ │
│  │ 09:42    │ Venta #0001-00046 │ Tarjeta  │ +$8.500  │ │
│  │ 10:30    │ Pago cta cte Clie │ Transf.  │ +$15.000 │ │
│  │ 11:00    │ Compra insumos    │ Efectivo │ -$1.200  │ │
│  └──────────┴───────────────────┴──────────┴──────────┘ │
│                                                         │
│  TOTALES POR MÉTODO DE PAGO                             │
│  ┌─────────────┬────────────────┐                       │
│  │ Efectivo    │    $7.000      │                       │
│  │ Tarjeta     │    $8.500      │                       │
│  │ Transferenc │   $15.000      │                       │
│  └─────────────┴────────────────┘                       │
│                                                         │
│  [ + Ingreso ]  [ - Egreso ]        [ Cerrar Caja ]    │
└─────────────────────────────────────────────────────────┘
```

**Header de caja:**
- Hora de apertura
- Monto inicial declarado
- Tiempo transcurrido (actualizado cada minuto)
- Badge de estado: 🟢 Abierta / 🟡 Vencida

**Tabla de movimientos:**
- Columnas: Hora · Descripción · Tipo · Método de pago · Monto
- Los egresos y gastos se muestran en rojo con signo negativo
- Los ingresos en verde con signo positivo
- Ordenados por hora, más recientes primero
- Sin paginación (todos los movimientos del día en una sola lista)

**Panel de totales:**
- Agrupado por método de pago
- Muestra: total entradas, total salidas, neto por método
- Total general en efectivo esperado al momento

**Botones de acción:**
- `+ Ingreso` → abre modal para registrar un ingreso manual
- `- Egreso` → abre modal para registrar un egreso manual
- `Cerrar Caja` → abre modal de cierre

#### 4.6.3 Modal de Ingreso / Egreso Manual

```
┌────────────────────────────────────────┐
│  Registrar Ingreso / Egreso            │
├────────────────────────────────────────┤
│  Descripción *                         │
│  ┌──────────────────────────────────┐  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Monto (ARS) *      Método de pago *  │
│  ┌──────────────┐   ┌────────────────┐ │
│  │  $ 0,00      │   │ Efectivo     ▼ │ │
│  └──────────────┘   └────────────────┘ │
│                                        │
│        [ Cancelar ]  [ Confirmar ]     │
└────────────────────────────────────────┘
```

- Descripción: texto libre, obligatorio
- Monto: input numérico, obligatorio, mayor a 0
- Método de pago: select con opciones Efectivo / Tarjeta / Transferencia / Cheque / Otro
- Al confirmar se crea un `cash_movement` de tipo `INCOME` o `EXPENSE` y se actualiza la tabla en tiempo real

#### 4.6.4 Modal de Cierre de Caja

```
┌────────────────────────────────────────────────────────┐
│  Cerrar Caja del día                                   │
├────────────────────────────────────────────────────────┤
│  RESUMEN POR MÉTODO DE PAGO                            │
│  ┌────────────────────┬──────────┬──────────┬────────┐  │
│  │ Método             │ Ventas   │ Cobros   │ Manual │  │
│  ├────────────────────┼──────────┼──────────┼────────┤  │
│  │ Efectivo           │ $3.200   │  —       │ -$1.200│  │
│  │ Tarjeta            │ $8.500   │  —       │  —     │  │
│  │ Transferencia      │  —       │ $15.000  │  —     │  │
│  └────────────────────┴──────────┴──────────┴────────┘  │
│                                                          │
│  Fondo inicial: $5.000                                  │
│  Total esperado en efectivo: $7.000                     │
│                                                          │
│  Efectivo físico contado *                              │
│  ┌─────────────────────────────┐                        │
│  │  $ 0,00                     │                        │
│  └─────────────────────────────┘                        │
│                                                          │
│  Diferencia: $0,00  ← verde si 0, rojo si ≠ 0          │
│                                                          │
│  Motivo de diferencia * (solo si diferencia ≠ 0)       │
│  ┌─────────────────────────────┐                        │
│  │                             │                        │
│  └─────────────────────────────┘                        │
│                                                          │
│          [ Cancelar ]    [ Confirmar Cierre ]           │
└────────────────────────────────────────────────────────┘
```

**Comportamiento del modal:**
- Tabla de resumen es `readonly` — no se puede editar
- El "Total esperado en efectivo" = fondo inicial + ingresos en efectivo - egresos en efectivo
- La diferencia se calcula en tiempo real mientras el operador tipea el efectivo contado
- Si diferencia = 0 → diferencia en verde, campo motivo oculto
- Si diferencia ≠ 0 → diferencia en rojo, campo motivo aparece y es obligatorio
- Botón "Confirmar Cierre" deshabilitado si:
  - El campo de efectivo físico está vacío
  - Hay diferencia y el motivo está vacío
- Al confirmar:
  1. Se cierra la caja (`status = CLOSED`, se registra `closed_at`, `counted_cash`, `difference`)
  2. Se genera automáticamente el PDF de cierre
  3. El PDF se descarga en el navegador
  4. Se muestra toast: "Caja cerrada exitosamente"
  5. La pantalla vuelve al estado "Sin caja abierta" (con mensaje de caja cerrada)

#### 4.6.5 Modal de Apertura Forzada (desde Ventas)

Cuando el operador intenta confirmar una venta y no hay caja abierta:

```
┌────────────────────────────────────────┐
│  ⚠️ No hay caja abierta               │
├────────────────────────────────────────┤
│  Para continuar con la venta,          │
│  primero debés abrir la caja del día.  │
│                                        │
│  Monto inicial (ARS)                   │
│  ┌──────────────────────────────────┐  │
│  │  $ 0,00                          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [ Cancelar ]    [ Abrir y Continuar ] │
└────────────────────────────────────────┘
```

- "Abrir y Continuar" abre la caja y retoma el flujo de la venta sin perder los datos

#### 4.6.6 PDF de Cierre de Caja

Generado automáticamente al cerrar la caja. Formato A4 portrait.

**Contenido:**
- Header con membrete del negocio
- Título: "Resumen de Caja — [fecha]"
- Datos de la caja: hora de apertura, hora de cierre, operador, fondo inicial
- Tabla de movimientos del día (igual a la pantalla)
- Resumen por método de pago (ventas, cobros, manuales, total)
- Total esperado en efectivo
- Efectivo físico contado
- Diferencia (con motivo si aplica)
- Footer con usuario que cerró y timestamp

#### 4.6.7 Estados de la Pantalla

| Estado | Descripción | Acción disponible |
|---|---|---|
| Sin caja | No hay caja abierta hoy | Abrir caja |
| Ya cerrada | La caja del día ya fue cerrada | Solo consulta (sin acciones) |
| Abierta | Caja activa, dentro de 24hs | Movimientos + Cerrar |
| Vencida | Caja abierta hace más de 24hs | Solo cerrar (no acepta movimientos nuevos) |

---

## 5. Base de Datos

### 5.1 Motor
PostgreSQL 15+

### 5.2 Entidades Principales
- `users` — Usuarios del sistema
- `businesses` — Datos del negocio (membrete, CUIT, domicilio fiscal)
- `clients` — Clientes
- `client_accounts` — Movimientos de cuenta corriente
- `suppliers` — Proveedores
- `categories` — Categorías de productos
- `products` — Productos
- `price_history` — Historial de cambios de precio
- `vouchers` — Comprobantes (cotizaciones, remitos, facturas)
- `voucher_items` — Ítems de cada comprobante
- `payments` — Pagos recibidos
- `cash_registers` — Cajas (una por día por negocio)
- `cash_movements` — Movimientos individuales dentro de una caja

### 5.4 Modelo de Caja

**Tabla `cash_registers`:**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `business_id` | FK | Negocio al que pertenece |
| `opened_by` | FK → users | Usuario que abrió la caja |
| `closed_by` | FK → users | Usuario que cerró la caja (null si abierta) |
| `status` | Enum | `OPEN` · `CLOSED` · `EXPIRED` |
| `opening_amount` | Decimal | Monto inicial de efectivo declarado |
| `counted_cash` | Decimal | Efectivo físico contado al cierre (null si abierta) |
| `difference` | Decimal | Diferencia entre esperado y contado (null si abierta) |
| `difference_reason` | String | Motivo obligatorio si hay diferencia |
| `opened_at` | Timestamp | Fecha y hora de apertura |
| `closed_at` | Timestamp | Fecha y hora de cierre (null si abierta) |
| `closing_pdf_path` | String | Ruta del PDF generado al cierre |
| `created_at` | Timestamp | Timestamp de creación |

**Tabla `cash_movements`:**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `cash_register_id` | FK | Caja a la que pertenece |
| `type` | Enum | `SALE` · `PAYMENT_RECEIVED` · `INCOME` · `EXPENSE` |
| `payment_method` | Enum | `CASH` · `CARD` · `TRANSFER` · `CHECK` · `OTHER` |
| `amount` | Decimal | Monto del movimiento (siempre positivo) |
| `description` | String | Descripción del movimiento |
| `voucher_id` | FK → vouchers | Comprobante asociado (null si movimiento manual) |
| `created_by` | FK → users | Usuario que registró el movimiento |
| `created_at` | Timestamp | Fecha y hora del movimiento |

**Notas de diseño:**
- Un negocio solo puede tener una caja con `status = OPEN` a la vez (constraint único)
- Los movimientos de tipo `SALE` y `PAYMENT_RECEIVED` se crean automáticamente; `INCOME` y `EXPENSE` los crea el operador manualmente
- El campo `difference` = `counted_cash` - total esperado en efectivo; negativo = faltante, positivo = sobrante
- `EXPIRED` no es un estado persistido: se calcula en runtime cuando `status = OPEN` y `opened_at < NOW() - 24hs`

### 5.3 Consideraciones
- Uso de UUID como clave primaria
- Soft delete (campo `deleted_at`) para registros críticos
- Índices en campos de búsqueda frecuente (código, descripción, CUIT)
- Timestamps automáticos (`created_at`, `updated_at`)

---

## 6. API REST

### 6.1 Convenciones
- Prefijo base: `/api/v1`
- Formato: JSON
- Autenticación: Bearer Token (JWT)
- Paginación: `?page=1&per_page=20`
- Filtros: query params (`?search=llave&categoria=plomeria`)

### 6.2 Endpoints Principales
```
POST   /auth/google                    — Login con Google OAuth
POST   /auth/refresh                   — Refrescar sesión

GET    /products                       — Listar productos (con búsqueda y filtros)
POST   /products                       — Crear producto
PUT    /products/{id}                  — Actualizar producto
DELETE /products/{id}                  — Eliminar producto (soft delete)
POST   /products/import-excel          — Importar/actualizar desde Excel

GET    /clients                        — Listar clientes
POST   /clients                        — Crear cliente
PUT    /clients/{id}                   — Actualizar cliente
GET    /clients/{id}/account           — Cuenta corriente del cliente

GET    /suppliers                      — Listar proveedores
POST   /suppliers                      — Crear proveedor
PUT    /suppliers/{id}                 — Actualizar proveedor

GET    /categories                     — Listar categorías
POST   /categories                     — Crear categoría

POST   /vouchers                       — Crear comprobante (cotización/remito/factura)
GET    /vouchers/{id}                  — Obtener comprobante
GET    /vouchers/{id}/pdf              — Descargar PDF
POST   /vouchers/{id}/emit             — Emitir factura electrónica (ARCA)
POST   /vouchers/{id}/convert          — Convertir cotización a remito/factura

GET    /dashboard/summary              — Resumen para dashboard

GET    /cash/current                   — Estado de la caja activa del día (o null si no hay)
POST   /cash/open                      — Abrir caja (body: { opening_amount })
POST   /cash/close                     — Cerrar caja (body: { counted_cash, difference_reason? })
GET    /cash/{id}/movements            — Listar movimientos de una caja
POST   /cash/{id}/movements            — Registrar movimiento manual (INCOME o EXPENSE)
GET    /cash/{id}/summary              — Resumen de totales por método de pago
GET    /cash/{id}/pdf                  — Descargar PDF del resumen de cierre de caja

GET    /reports/stock/pdf              — Descargar reporte de stock en PDF (inventario analítico)
       Query params: ?low_stock=true&active_only=true&order_by=stock_asc
GET    /reports/category/{id}/pdf      — Descargar reporte de categoría en PDF
       Query params: ?include_subcategories=true
GET    /reports/supplier/{id}/pdf      — Descargar reporte de proveedor en PDF
       Query params: ?with_stock_only=true&order_by=margin
GET    /reports/sales/pdf              — Descargar reporte de ventas en PDF
       Query params: ?from_date=2026-01-01&to_date=2026-01-31&voucher_type=factura&client_id=xxx
GET    /reports/client-account/{id}/pdf — Descargar reporte de cuenta corriente en PDF
       Query params: ?from_date=2026-01-01&to_date=2026-01-31&pending_only=true

GET    /reports/inventory-count/pdf    — Descargar planilla de conteo físico en PDF
       Query params: ?supplier_id=xxx&category_id=xxx (al menos uno obligatorio)

GET    /purchase-orders                — Listar órdenes de pedido (con paginación y filtros)
       Query params: ?supplier_id=xxx&category_id=xxx&status=DRAFT|CONFIRMED&page=1&per_page=20
POST   /purchase-orders                — Crear orden de pedido (borrador o confirmada)
GET    /purchase-orders/{id}           — Obtener detalle de una orden
PUT    /purchase-orders/{id}           — Editar orden (solo en estado DRAFT)
POST   /purchase-orders/{id}/confirm   — Confirmar orden (cambia estado a CONFIRMED)
GET    /purchase-orders/{id}/pdf       — Descargar PDF de la orden de pedido
```

---

## 7. Integraciones Externas

### 7.1 Google OAuth 2.0
- Flujo de autorización para login
- Obtención de perfil básico (nombre, email, avatar)

### 7.2 AFIPSDK — Facturación Electrónica ARCA/AFIP
- Librería Python que se conecta directamente con los Web Services oficiales de ARCA/AFIP
- Sin intermediarios externos: la comunicación es directa entre el sistema y ARCA
- Requiere certificados digitales (.crt, .key) para autenticarse con ARCA/AFIP
- Requiere Token y Sign del WSAA (Web Service de Autenticación y Autorización), renovados cada 12 horas
- Funcionalidades principales:
  - Emisión de Factura A, B, C según condición fiscal del emisor y receptor
  - Emisión de Notas de Crédito A, B, C (con referencia a comprobante original)
  - Consulta de comprobantes emitidos
  - Obtención del último número de comprobante
  - Logs detallados de cada transacción
- Obtención automática de CAE (Código de Autorización Electrónico)
- Manejo de entorno homologación (testing) y producción mediante certificados
- Control total sobre el proceso de facturación sin dependencia de servicios de terceros

---

## 8. Seguridad
- HTTPS obligatorio en producción
- JWT firmado con expiración de 30 minutos
- Certificados digitales ARCA/AFIP (.crt, .key) almacenados de forma segura (nunca en repositorio)
- Token y Sign de WSAA renovados automáticamente cada 12 horas
- Validación de inputs en backend (Pydantic)
- Protección CORS configurada
- Rate limiting en endpoints sensibles

---

## 9. Fases de Desarrollo

### Fase 1 — MVP (Core)
- Autenticación con Google OAuth
- CRUD de productos, clientes, proveedores, categorías
- Pantalla de ventas unificada
- Generación de cotizaciones y remitos en PDF
- **Apertura y cierre de caja** (módulo completo: movimientos, modal de cierre, PDF resumen)
- Modo claro/oscuro

### Fase 2 — Facturación y Cuentas
- Integración con MrBot API para facturación electrónica (ARCA/AFIP)
- Implementación de WSAA para obtención de Token y Sign
- Cuentas corrientes de clientes
- Importación masiva de productos desde Excel
- Historial de precios

### Fase 3 — Reportes y Optimización
- Dashboard con métricas
- Sistema completo de reportes en PDF:
  - Reporte de stock (control de inventario analítico)
  - Reporte por categoría
  - Reporte por proveedor
  - Reporte de ventas por período
  - Reporte de cuenta corriente del cliente
- Pantalla de reportes en el frontend con filtros
- **Módulo de Control de Inventario Físico y Órdenes de Pedido** (sección 3.12):
  - Planilla de conteo imprimible (PDF) por categoría o proveedor
  - Carga de conteo físico en el sistema
  - Generación de Orden de Pedido con cálculo de costos + IVA
  - Historial de órdenes de pedido (consultable y editable en estado borrador)
  - PDF descargable de cada orden de pedido
- Alertas de stock bajo
- Optimización de rendimiento

### Fase 4 — Mobile y Avanzado
- Versión mobile (React Native o PWA)
- **Jerarquía de usuarios y permisos** (ver sección 12)
- Backup automático de base de datos
- Notificaciones y alertas automáticas
- **Agente de IA** integrado en la versión mobile (ver sección 11)
- Integraciones externas: MercadoLibre, WhatsApp, conciliación bancaria

---

## 10. Requisitos No Funcionales
- Tiempo de respuesta de API < 200ms para operaciones CRUD
- Soporte para al menos 50,000 productos
- Generación de PDF en menos de 3 segundos
- Compatible con Chrome, Firefox, Edge (últimas 2 versiones)
- Preparado para despliegue en VPS o cloud (Docker)

---

## 11. Agente de IA (Fase Futura — Mobile)

> ⚠️ **Estado:** Pendiente de diseño detallado. Esta sección captura las ideas iniciales para no perderlas. No forma parte del desarrollo actual.

### 11.1 Visión General

Agente de inteligencia artificial integrado exclusivamente en la **versión mobile** del sistema. Su propósito es acelerar tareas frecuentes del vendedor usando lenguaje natural, visión por computadora y acceso en tiempo real a los datos del negocio.

### 11.2 Funcionalidades Previstas

#### 11.2.1 Escaneo de Presupuesto de Competencia (OCR → Cotización)
- El usuario saca una foto a un presupuesto físico (de un proveedor, competidor u otro sistema)
- La IA extrae los ítems: descripción, cantidad, precio unitario
- Busca coincidencias en el catálogo de productos del negocio
- Si no encuentra coincidencia exacta, usa similitud semántica y las **notas/alternativas del producto** para inferir cuál es el producto correcto
- Genera un borrador de cotización que el usuario puede revisar y confirmar antes de guardar
- El usuario puede corregir manualmente las asignaciones antes de confirmar

#### 11.2.2 Contexto de Productos para Matching
Para que la IA pueda hacer matching correcto, los productos necesitan campos adicionales:
- **`notas_ia`** (String): Texto libre con sinónimos, nombres alternativos, marcas equivalentes, usos comunes. Ej: "también conocido como caño galvanizado, tubería de hierro"
- **`alternativas`** (Array de FK): Lista de productos alternativos/equivalentes dentro del catálogo
- Estos campos se cargan manualmente desde el ABM de productos
- Son opcionales pero mejoran significativamente la precisión del agente

#### 11.2.3 Consultas de Negocio en Lenguaje Natural
El agente puede responder preguntas como:
- "¿Tenemos stock de [producto]?" → consulta stock en tiempo real
- "¿Cuánto vendimos hoy?" → resumen de ventas del día
- "¿Cuánto entró en efectivo?" → desglose por método de pago de la caja activa
- "¿Cuánto debe [cliente]?" → saldo de cuenta corriente
- "¿Cuál fue la última venta de [cliente]?" → historial de comprobantes
- "Mostrame los productos con stock bajo" → listado filtrado
- "¿Cuánto vendimos esta semana comparado con la anterior?" → comparativa

#### 11.2.4 Posibles Funcionalidades Adicionales (A Evaluar)
- Creación de cotización por voz: el vendedor dicta los ítems y la IA los agrega
- Alerta proactiva de stock bajo al abrir la app
- Sugerencia de productos complementarios al crear una venta
- Resumen diario automático al cerrar la caja ("hoy vendiste X, cobraste Y de cuentas corrientes, el producto más vendido fue Z")

### 11.3 Consideraciones Técnicas (Preliminares)

- **Modelo de lenguaje:** A definir (OpenAI GPT-4o, Google Gemini, o modelo local para datos sensibles)
- **OCR:** Google Cloud Vision API, AWS Textract, o Tesseract local
- **Arquitectura:** El agente se conecta a los mismos endpoints de la API existente — no tiene acceso directo a la base de datos
- **Seguridad:** El agente opera con el token JWT del usuario logueado; respeta los mismos permisos
- **Privacidad:** Los datos del negocio no deben enviarse a modelos externos sin consentimiento explícito. Evaluar uso de modelos on-premise o con acuerdos de confidencialidad
- **Latencia:** Las consultas de datos deben responder en < 2 segundos para buena UX mobile

### 11.4 Cambios Necesarios en el Modelo de Datos

Los siguientes campos deberán agregarse a la tabla `products` cuando se implemente esta fase:

| Campo | Tipo | Descripción |
|---|---|---|
| `notas_ia` | Text | Sinónimos, nombres alternativos, contexto para el agente |
| `alternativas` | Array FK | IDs de productos equivalentes/sustitutos |

### 11.5 Pendientes de Definición

- [ ] Elección del modelo de IA (costo, privacidad, precisión)
- [ ] Diseño de la interfaz conversacional en mobile (chat, comandos de voz, o botón de cámara)
- [ ] Flujo exacto de revisión y confirmación del borrador generado por OCR
- [ ] Política de privacidad respecto al envío de imágenes a servicios externos
- [ ] Idioma del agente (español neutro, rioplatense, configurable)
- [ ] Manejo de errores cuando la IA no puede interpretar el presupuesto escaneado

---

## 12. Jerarquía de Usuarios y Permisos (Fase Futura)

> ⚠️ **Estado:** No implementado. El sistema actualmente opera con un único rol (dueño/administrador por negocio). Esta sección define el diseño para la fase 4.

### 12.1 Visión General

El sistema de permisos permite que un negocio tenga múltiples operadores con distintos niveles de acceso. Cada usuario es invitado al negocio por el administrador y se le asigna un rol que determina qué puede ver y hacer.

### 12.2 Roles Definidos

| Rol | Descripción |
|---|---|
| **Administrador** | Acceso total: configuración, reportes, todos los módulos, gestión de usuarios |
| **Vendedor** | Puede crear ventas, emitir cotizaciones, remitos y facturas. Sin acceso a configuración ni reportes financieros |
| **Cajero** | Acceso a caja (apertura, movimientos, cierre) y ventas. Sin gestión de productos, proveedores ni configuración |
| **Repositor** | Solo consulta y actualización de stock. Sin acceso a ventas ni información financiera |

### 12.3 Matriz de Permisos

| Módulo | Administrador | Vendedor | Cajero | Repositor |
|---|---|---|---|---|
| Dashboard | ✅ Completo | ✅ Ventas propias | ✅ Solo caja | ❌ |
| Ventas | ✅ | ✅ | ✅ | ❌ |
| Comprobantes | ✅ Todos | ✅ Propios | ✅ Solo ver | ❌ |
| Productos | ✅ CRUD | ✅ Solo lectura | ❌ | ✅ Solo stock |
| Actualización de precios | ✅ | ❌ | ❌ | ❌ |
| Clientes | ✅ CRUD | ✅ CRUD | ✅ Solo ver | ❌ |
| Proveedores | ✅ CRUD | ❌ | ❌ | ❌ |
| Categorías | ✅ CRUD | ❌ | ❌ | ❌ |
| Caja | ✅ | ❌ | ✅ | ❌ |
| Reportes | ✅ Todos | ✅ Ventas | ❌ | ❌ |
| Inventario / Órdenes de pedido | ✅ | ❌ | ❌ | ✅ Solo conteo |
| Configuración del negocio | ✅ | ❌ | ❌ | ❌ |
| Gestión de usuarios | ✅ | ❌ | ❌ | ❌ |

### 12.4 Modelo de Datos Necesario

**Tabla `business_users`** (relación negocio ↔ usuario con rol):

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `business_id` | FK → businesses | Negocio al que pertenece |
| `user_id` | FK → users | Usuario invitado |
| `role` | Enum | `ADMIN` · `SELLER` · `CASHIER` · `STOREKEEPER` |
| `invited_by` | FK → users | Usuario que realizó la invitación |
| `is_active` | Boolean | Si el acceso está activo |
| `created_at` | Timestamp | Fecha de alta |

### 12.5 Flujo de Invitación
1. El administrador ingresa el email del operador desde Configuración → Usuarios
2. El sistema envía un email con link de invitación
3. El operador acepta la invitación, inicia sesión con Google y queda vinculado al negocio con su rol
4. El administrador puede cambiar el rol o desactivar el acceso en cualquier momento

### 12.6 Consideraciones de Implementación
- El JWT deberá incluir el `role` del usuario para el negocio activo
- El backend debe validar permisos en cada endpoint mediante un decorator/dependency de FastAPI
- El frontend debe ocultar/mostrar secciones del sidebar según el rol
- Un usuario puede tener roles distintos en negocios distintos (multi-tenant)
