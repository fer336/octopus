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
- Roles básicos: Administrador, Vendedor (fase futura)

### 3.2 Gestión de Productos e Inventario

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

#### 3.2.2 Lógica de Cálculo de Precio
El precio final se calcula aplicando bonificaciones en cadena sobre el precio de lista:
```
precio_con_bonif = precio_lista × (1 - bonif1/100) × (1 - bonif2/100) × (1 - bonif3/100)
precio_venta = precio_con_bonif + IVA
```

#### 3.2.3 Carga y Actualización Masiva de Precios
- Importación de productos mediante archivos Excel (.xlsx, .xls)
- El sistema debe mapear columnas del Excel a los campos del producto
- Actualización automática de precios: al subir un nuevo Excel, se actualizan los precios de los productos existentes (match por `codigo` o `codigo_producto`)
- Registro de historial de cambios de precio (fecha, precio anterior, precio nuevo)
- Vista previa de cambios antes de confirmar la actualización

### 3.3 Gestión de Clientes

#### 3.3.1 Datos del Cliente
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
- **Sidebar izquierdo:** Navegación principal (Dashboard, Ventas, Productos, Clientes, Proveedores, Categorías, Reportes, Configuración)
- **Header:** Logo, nombre del negocio, selector de tema, usuario logueado, cerrar sesión
- **Área principal:** Contenido dinámico según sección

### 4.4 Pantallas Principales
1. **Dashboard:** Resumen de ventas del día, productos con stock bajo, últimos comprobantes
2. **Ventas:** Pantalla unificada (descrita en 3.6)
3. **Productos:** Lista con búsqueda, filtros por categoría/proveedor, CRUD completo
4. **Clientes:** Lista, detalle con cuenta corriente, CRUD
5. **Proveedores:** Lista, detalle, CRUD
6. **Categorías:** Gestión jerárquica
7. **Reportes:** Ventas por período, productos más vendidos, cuentas corrientes
8. **Configuración:** Datos del negocio, membrete, preferencias de facturación

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
GET    /reports/sales                  — Reporte de ventas
```

---

## 7. Integraciones Externas

### 7.1 Google OAuth 2.0
- Flujo de autorización para login
- Obtención de perfil básico (nombre, email, avatar)

### 7.2 MrBot API — Facturación Electrónica ARCA/AFIP
- API REST gratuita que se conecta con Web Services oficiales de ARCA/AFIP
- Base URL: `https://api-facturacion-electronica.mrbot.com.ar`
- Autenticación mediante email y API Key (gratuita, sin costo)
- Requiere certificados digitales (.crt, .key) para conectar con ARCA/AFIP
- Requiere Token y Sign del WSAA (Web Service de Autenticación y Autorización)
- Endpoints principales:
  - `POST /api/v1/usuarios/` - Registro de usuario (gratis)
  - `POST /api/v1/factura/` - Solicitar factura electrónica
  - `POST /api/v1/consulta_comprobante/` - Consultar comprobante existente
  - `POST /api/v1/obtener_nro_ultimo_comprobante/` - Obtener último número
  - `POST /api/v1/logs/` - Recuperar logs de facturación
- Soporte para Factura A, B, C según condición fiscal emisor/receptor
- Obtención automática de CAE (Código de Autorización Electrónico)
- Manejo de entorno homologación (testing) y producción mediante certificados
- Control total sobre el proceso de facturación sin intermediarios de pago

---

## 8. Seguridad
- HTTPS obligatorio en producción
- JWT firmado con expiración de 30 minutos
- Certificados digitales ARCA/AFIP (.crt, .key) almacenados de forma segura (nunca en repositorio)
- Credenciales de MrBot API (email, api_key) almacenadas en variables de entorno
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
- Modo claro/oscuro

### Fase 2 — Facturación y Cuentas
- Integración con MrBot API para facturación electrónica (ARCA/AFIP)
- Implementación de WSAA para obtención de Token y Sign
- Cuentas corrientes de clientes
- Importación masiva de productos desde Excel
- Historial de precios

### Fase 3 — Reportes y Optimización
- Dashboard con métricas
- Reportes de ventas y stock
- Alertas de stock bajo
- Optimización de rendimiento

### Fase 4 — Mobile y Avanzado
- Versión mobile (React Native o PWA)
- Roles y permisos de usuario
- Backup automático de base de datos
- Notificaciones

---

## 10. Requisitos No Funcionales
- Tiempo de respuesta de API < 200ms para operaciones CRUD
- Soporte para al menos 50,000 productos
- Generación de PDF en menos de 3 segundos
- Compatible con Chrome, Firefox, Edge (últimas 2 versiones)
- Preparado para despliegue en VPS o cloud (Docker)
