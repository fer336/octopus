# AGENTS.md — Agentes de Desarrollo del Proyecto

## Propósito
Este documento define los agentes (roles especializados) que participan en el desarrollo del sistema ERP para sanitarios, ferreterías y corralones. Cada agente tiene responsabilidades claras, reglas de trabajo y contexto sobre el stack tecnológico.

---

## Reglas Globales

Todos los agentes deben seguir estas reglas sin excepción:

1. **Leer el PRD.md** antes de cualquier tarea. Es la fuente de verdad del proyecto.
2. **No inventar funcionalidad** que no esté en el PRD. Si algo no está claro, preguntar antes de implementar.
3. **Código limpio y documentado.** Funciones con docstrings, componentes con comentarios de propósito.
4. **Convenciones de nombres:**
   - Backend (Python): `snake_case` para variables, funciones y archivos
   - Frontend (React/TS): `camelCase` para variables/funciones, `PascalCase` para componentes
   - Base de datos: `snake_case` para tablas y columnas
5. **Idioma del código:** Inglés para nombres de variables, funciones, clases, tablas y endpoints. Español para comentarios, mensajes de UI y documentación.
6. **Git:** Commits en español con prefijos: `feat:`, `fix:`, `refactor:`, `docs:`, `style:`, `test:`
7. **No hardcodear** valores de configuración. Usar variables de entorno (`.env`).
8. **Cada módulo debe ser independiente** y testeable de forma aislada.

---

## Estructura del Proyecto

```
project-root/
├── backend/
│   ├── app/
│   │   ├── main.py                  # Entry point FastAPI
│   │   ├── config.py                # Configuración y env vars
│   │   ├── database.py              # Conexión a PostgreSQL
│   │   ├── models/                  # Modelos SQLAlchemy
│   │   │   ├── user.py
│   │   │   ├── product.py
│   │   │   ├── client.py
│   │   │   ├── supplier.py
│   │   │   ├── category.py
│   │   │   ├── voucher.py
│   │   │   └── payment.py
│   │   ├── schemas/                 # Schemas Pydantic
│   │   ├── routers/                 # Endpoints por módulo
│   │   │   ├── auth.py
│   │   │   ├── products.py
│   │   │   ├── clients.py
│   │   │   ├── suppliers.py
│   │   │   ├── categories.py
│   │   │   ├── vouchers.py
│   │   │   └── dashboard.py
│   │   ├── services/                # Lógica de negocio
│   │   │   ├── auth_service.py
│   │   │   ├── product_service.py
│   │   │   ├── excel_service.py
│   │   │   ├── voucher_service.py
│   │   │   ├── pdf_service.py
│   │   │   └── arca_service.py
│   │   ├── utils/                   # Utilidades compartidas
│   │   └── tests/
│   ├── alembic/                     # Migraciones de DB
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/                     # Clientes HTTP (axios/fetch)
│   │   ├── components/              # Componentes reutilizables
│   │   │   ├── ui/                  # Botones, inputs, modals, tables
│   │   │   ├── layout/              # Sidebar, Header, MainLayout
│   │   │   └── shared/              # SearchBar, ProductPicker, ClientPicker
│   │   ├── pages/                   # Vistas principales
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Sales.tsx
│   │   │   ├── Products.tsx
│   │   │   ├── Clients.tsx
│   │   │   ├── Suppliers.tsx
│   │   │   ├── Categories.tsx
│   │   │   ├── Reports.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/                   # Custom hooks
│   │   ├── context/                 # React Context (auth, theme)
│   │   ├── types/                   # TypeScript interfaces
│   │   ├── utils/                   # Helpers, formatters
│   │   └── styles/                  # Temas claro/oscuro, globals
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── PRD.md
├── AGENTS.md
└── README.md
```

---

## Agentes de Desarrollo

---

### 🏗️ AGENTE 1: Arquitecto de Backend

**Rol:** Diseña y construye la API, modelos de datos y lógica de negocio.

**Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL, Pydantic

**Responsabilidades:**
- Diseñar e implementar los modelos de base de datos según el PRD (sección 5)
- Crear migraciones con Alembic
- Implementar los endpoints REST (sección 6 del PRD)
- Desarrollar la capa de servicios con la lógica de negocio
- Configurar la conexión a PostgreSQL con pool de conexiones
- Implementar paginación, filtros y búsqueda en los endpoints de listado
- Validar todos los inputs con Pydantic schemas
- Manejar errores con respuestas HTTP estandarizadas

**Reglas específicas:**
- Usar `async` en todos los endpoints y queries a la base de datos
- Separar estrictamente: `routers/` (endpoints) → `services/` (lógica) → `models/` (datos)
- Nunca poner lógica de negocio en los routers; los routers solo reciben, validan y delegan
- Usar `Depends()` de FastAPI para inyección de dependencias (DB session, usuario actual)
- Cada modelo debe tener `id` (UUID), `created_at`, `updated_at`, y `deleted_at` (soft delete)
- Los endpoints de listado siempre deben soportar: `?search=`, `?page=`, `?per_page=`, y filtros específicos del recurso

**Archivos clave:**
```
backend/app/models/*.py
backend/app/schemas/*.py
backend/app/routers/*.py
backend/app/services/*.py
backend/app/database.py
backend/app/config.py
```

**Dependencias principales:**
```
fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, alembic, pydantic, python-dotenv
```

---

### 🔐 AGENTE 2: Especialista en Autenticación

**Rol:** Implementa el sistema de login con Google OAuth y gestión de sesiones JWT.

**Stack:** Google OAuth 2.0, python-jose (JWT), FastAPI Security

**Responsabilidades:**
- Configurar el flujo de Google OAuth 2.0 (obtener tokens, verificar identidad)
- Generar JWT con expiración de 30 minutos
- Implementar middleware de autenticación para proteger endpoints
- Crear el endpoint de refresh token
- Manejar el cierre de sesión
- Crear/actualizar el registro del usuario en la base de datos al primer login

**Reglas específicas:**
- El JWT debe contener: `user_id`, `email`, `exp` (expiración), `iat` (emisión)
- La clave secreta del JWT se lee de variable de entorno `JWT_SECRET`
- Todos los endpoints excepto `/auth/google` y `/auth/refresh` requieren token válido
- Si el token expira, el frontend recibe un 401 y debe intentar refrescar
- Nunca almacenar tokens en la base de datos; son stateless
- El Google Client ID y Secret van en variables de entorno

**Archivos clave:**
```
backend/app/routers/auth.py
backend/app/services/auth_service.py
backend/app/utils/security.py
```

**Dependencias principales:**
```
python-jose[cryptography], google-auth, google-auth-oauthlib, httpx
```

---

### 📄 AGENTE 3: Especialista en Documentos PDF

**Rol:** Genera los documentos PDF para cotizaciones, remitos y facturas.

**Stack:** ReportLab o WeasyPrint, Jinja2 (templates)

**Responsabilidades:**
- Diseñar templates PDF profesionales con membrete configurable
- Implementar generación de cotizaciones en PDF
- Implementar generación de remitos en PDF (con y sin precios)
- Implementar generación de facturas en PDF con datos fiscales (CAE, código QR, código de barras)
- Manejar la numeración correlativa de comprobantes
- Optimizar la generación para que sea < 3 segundos

**Reglas específicas:**
- Los PDF deben tener un diseño limpio y profesional
- El membrete (logo, datos del negocio) se lee de la configuración del negocio en la DB
- Los remitos tienen dos modos: `with_prices=True` (incluye precios) y `with_prices=False` (solo descripción y cantidad)
- Las facturas deben cumplir con los requisitos fiscales argentinos: CAE, fecha de vencimiento CAE, código de barras, QR AFIP
- Cada tipo de comprobante tiene su propia numeración (ej: Cotización 0001-00000001, Remito 0001-00000001)
- Los PDF se almacenan temporalmente y se sirven como descarga

**Archivos clave:**
```
backend/app/services/pdf_service.py
backend/app/templates/pdf/
  ├── quotation.html
  ├── receipt.html
  └── invoice.html
```

**Dependencias principales:**
```
weasyprint o reportlab, jinja2, qrcode, python-barcode
```

---

### 🧾 AGENTE 4: Especialista en Facturación Electrónica (MrBot API + ARCA/AFIP)

**Rol:** Integra el sistema con MrBot API para emitir comprobantes electrónicos conectándose directamente con los Web Services de ARCA/AFIP.

**Stack:** REST API de MrBot, pyafipws (WSAA), httpx/requests, cryptography

**Responsabilidades:**
- Implementar cliente HTTP para MrBot API (https://api-facturacion-electronica.mrbot.com.ar)
- Implementar servicio WSAA para obtención de Token y Sign de ARCA/AFIP
- Gestionar certificados digitales (.crt, .key) de forma segura
- Renovar automáticamente Token y Sign cada 12 horas
- Implementar emisión de Factura A, B, C según condición fiscal
- Construir el JSON de facturación según la estructura requerida por MrBot/ARCA
- Parsear la respuesta y almacenar CAE, número de comprobante, fecha de vencimiento CAE
- Consultar comprobantes existentes
- Obtener el último número de comprobante emitido
- Manejar el cambio entre entorno de homologación (testing) y producción
- Implementar notas de crédito y débito
- Determinar automáticamente el tipo de comprobante (A, B, C) según condición del emisor y receptor
- Recuperar logs de facturación

**Reglas específicas:**
- Los certificados (.crt, .key) NUNCA se commitean al repositorio; se almacenan en rutas seguras configuradas en `.env`
- Las credenciales de MrBot (email, api_key) se leen de `.env`
- El Token y Sign de WSAA deben renovarse automáticamente cada 12 horas
- Implementar caché del Token/Sign en memoria o base de datos con timestamp de expiración
- Siempre validar los datos del comprobante antes de enviarlo
- Almacenar el response completo de MrBot/ARCA en la base de datos (CAE, fecha vencimiento, errores, eventos)
- Implementar reintentos con backoff exponencial para fallas de conexión (timeout, 500, etc)
- Logs detallados de cada transacción: request JSON enviado, response recibido, errores
- Para testing usar certificados autofirmados; para producción usar certificados oficiales de ARCA
- Manejar correctamente los ítems: descripción, cantidad, precio unitario, alícuota IVA
- Para Factura B: el IVA se incluye en el total pero no se desglosa separadamente
- Validar que ImpTotal = ImpNeto + ImpIVA + ImpTrib + ImpTotConc + ImpOpEx

**Archivos clave:**
```
backend/app/services/mrbot_service.py
backend/app/services/wsaa_service.py
backend/app/utils/arca_helpers.py
backend/app/schemas/mrbot_schemas.py
backend/app/certs/              # Directorio para certificados (en .gitignore)
```

**Dependencias principales:**
```
httpx, pydantic, tenacity (reintentos), pyafipws (WSAA), cryptography, lxml, zeep (SOAP)
```

**Endpoints de MrBot API a utilizar:**
```
POST /api/v1/usuarios/                         - Crear usuario (registro gratuito)
GET  /api/v1/check_user/                       - Verificar usuario
POST /api/v1/factura/                          - Solicitar factura electrónica
POST /api/v1/consulta_comprobante/             - Consultar comprobante
POST /api/v1/obtener_nro_ultimo_comprobante/   - Obtener último número
POST /api/v1/logs/                             - Recuperar logs
```

**Estructura JSON base para Factura B:**
```json
{
  "Auth": {
    "Token": "obtenido-del-wsaa-renovar-cada-12h",
    "Sign": "firma-del-wsaa",
    "Cuit": "30345678901",
    "Denominacion_Representado": "Mi Empresa S.A.",
    "Condicion_IVA": "Responsable Inscripto",
    "testing": false
  },
  "FeCAEReq": {
    "FeCabReq": {
      "CantReg": 1,
      "PtoVta": 1,
      "CbteTipo": 6
    },
    "FeDetReq": {
      "Concepto": 1,
      "DocTipo": 96,
      "DocNro": "12345678",
      "Denominacion_receptor": "Juan Perez",
      "Items": [
        {
          "Descripcion": "Madera",
          "Cantidad": 1.0,
          "PrecioUnitario": 100.0,
          "AlicuotaIVA": 21.0,
          "Importe": 121.0
        }
      ],
      "ImpTotal": 121.0,
      "ImpNeto": 100.0,
      "ImpIVA": 21.0,
      "MonId": "PES",
      "CondicionIVAReceptorId": 5,
      "Iva": [
        {
          "Id": "5",
          "BaseImp": 100.0,
          "Importe": 21.0
        }
      ]
    }
  }
}
```

**Códigos de tipos de comprobante (CbteTipo):**
- `1` = Factura A
- `6` = Factura B
- `11` = Factura C
- `3` = Nota de Crédito A
- `8` = Nota de Crédito B
- `13` = Nota de Crédito C

---

### 📊 AGENTE 5: Especialista en Importación Excel

**Rol:** Implementa la carga masiva de productos y actualización automática de precios desde archivos Excel.

**Stack:** openpyxl, pandas

**Responsabilidades:**
- Parsear archivos Excel (.xlsx, .xls) con productos
- Implementar el mapeo de columnas del Excel a campos del producto
- Detectar productos existentes (por código o código de producto) y actualizar precios
- Crear productos nuevos que no existan en la base de datos
- Generar vista previa de cambios antes de confirmar
- Registrar historial de cambios de precio en la tabla `price_history`
- Validar datos del Excel (tipos, campos obligatorios, duplicados)

**Reglas específicas:**
- El servicio recibe el archivo y retorna un resumen de cambios (nuevos, actualizados, errores) antes de aplicar
- La confirmación es un paso separado (preview → confirm)
- Si un producto del Excel no matchea por código, se marca como "nuevo" para revisión
- Manejar archivos de hasta 50,000 filas sin timeout
- Procesar en background si el archivo es muy grande (> 5,000 filas) con feedback de progreso
- Nunca modificar stock desde el Excel; el stock se gestiona por separado

**Archivos clave:**
```
backend/app/services/excel_service.py
backend/app/routers/products.py (endpoint de importación)
backend/app/schemas/excel_schemas.py
```

**Dependencias principales:**
```
openpyxl, pandas
```

---

### 🎨 AGENTE 6: Desarrollador Frontend — UI/UX

**Rol:** Construye toda la interfaz de usuario, temas, layout y componentes reutilizables.

**Stack:** React 18+, TypeScript, TailwindCSS, React Router, Zustand o Context API

**Responsabilidades:**
- Implementar el layout general: Sidebar, Header, área de contenido
- Crear el sistema de temas (claro/oscuro) con toggle
- Desarrollar componentes UI reutilizables: Button, Input, Select, Modal, Table, SearchBar, Pagination, Toast/Notifications
- Implementar todas las páginas descritas en el PRD (sección 4.4)
- Construir la pantalla de ventas unificada (sección 3.6 del PRD) con las dos secciones
- Manejar estado de autenticación y redirección
- Responsive design para futuro mobile

**Reglas específicas:**
- Usar TailwindCSS para estilos; no CSS custom salvo excepciones justificadas
- Temas claro/oscuro implementados con CSS variables + clase en el `<html>` (`dark`)
- Componentes pequeños y reutilizables; si un componente supera 200 líneas, dividirlo
- La pantalla de ventas NO debe recargar al agregar productos; todo debe ser reactivo y en memoria hasta confirmar
- Implementar debounce en los buscadores (300ms)
- Loading skeletons en lugar de spinners genéricos
- Manejo de errores con toasts informativos

**Archivos clave:**
```
frontend/src/components/**
frontend/src/pages/**
frontend/src/context/ThemeContext.tsx
frontend/src/context/AuthContext.tsx
frontend/src/styles/
```

**Dependencias principales:**
```
react, react-dom, react-router-dom, typescript, tailwindcss, axios,
zustand (o context), react-hot-toast, lucide-react (iconos)
```

---

### 🔌 AGENTE 7: Integrador Frontend-Backend

**Rol:** Conecta el frontend con la API. Maneja estado global, llamadas HTTP, caché y sincronización.

**Stack:** Axios, React Query (TanStack Query), Zustand

**Responsabilidades:**
- Crear el cliente HTTP base con interceptors (token JWT, refresh automático, manejo de errores)
- Implementar los hooks de datos con React Query para cada recurso (productos, clientes, etc.)
- Manejar estado global con Zustand (usuario autenticado, carrito de ventas, tema)
- Implementar el flujo de autenticación en el frontend (login → token → protección de rutas)
- Caché inteligente: invalidar datos tras mutaciones
- Manejar estados de carga, error y vacío en cada vista

**Reglas específicas:**
- Toda llamada a la API se hace a través de los hooks de React Query, nunca con `fetch` directo en componentes
- El token JWT se almacena en memoria (Zustand store), no en localStorage (seguridad)
- Interceptor de Axios: si recibe 401, intenta refresh; si falla, redirige a login
- Las búsquedas con debounce usan `keepPreviousData: true` para evitar flickering
- Tipado estricto: cada endpoint tiene su interface TypeScript correspondiente

**Archivos clave:**
```
frontend/src/api/httpClient.ts
frontend/src/api/endpoints/
frontend/src/hooks/useProducts.ts
frontend/src/hooks/useClients.ts
frontend/src/hooks/useVouchers.ts
frontend/src/hooks/useAuth.ts
frontend/src/stores/authStore.ts
frontend/src/stores/salesStore.ts
```

**Dependencias principales:**
```
axios, @tanstack/react-query, zustand
```

---

### 🧪 AGENTE 8: QA y Testing

**Rol:** Garantiza la calidad del código con tests automatizados y revisión.

**Stack:** Pytest (backend), Vitest/Jest + React Testing Library (frontend)

**Responsabilidades:**
- Escribir tests unitarios para la capa de servicios del backend
- Escribir tests de integración para los endpoints de la API
- Escribir tests de componentes para el frontend
- Testear el flujo completo de ventas (crear cotización → convertir a factura)
- Validar la generación correcta de PDFs
- Validar la integración con ARCA en entorno de homologación

**Reglas específicas:**
- Cobertura mínima del 70% en servicios del backend
- Cada endpoint nuevo debe tener al menos un test de happy path y uno de error
- Usar fixtures y factories para datos de prueba
- Los tests de ARCA usan mocks salvo en la suite de integración dedicada
- Los tests del frontend validan comportamiento del usuario, no implementación interna

**Archivos clave:**
```
backend/app/tests/
frontend/src/__tests__/
```

**Dependencias principales:**
```
pytest, pytest-asyncio, httpx (TestClient), factory-boy
vitest, @testing-library/react, msw (mock service worker)
```

---

## Flujo de Trabajo entre Agentes

```
                    ┌──────────────────┐
                    │    PRD.md        │
                    │ (fuente verdad)  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
      ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
      │  AGENTE 1    │ │ AGENTE 6 │ │  AGENTE 8   │
      │  Backend     │ │ Frontend │ │  QA/Testing  │
      │  Arquitecto  │ │  UI/UX   │ │             │
      └──┬───┬───┬───┘ └────┬─────┘ └─────────────┘
         │   │   │          │
    ┌────┘   │   └────┐     │
    │        │        │     │
┌───▼──┐ ┌──▼───┐ ┌──▼──┐  │
│AGT 2 │ │AGT 3 │ │AGT 4│  │
│ Auth │ │ PDF  │ │ ARCA│  │
└──────┘ └──────┘ └─────┘  │
    ┌────────┐              │
    │ AGT 5  │              │
    │ Excel  │              │
    └────────┘              │
              ┌─────────────┘
              │
       ┌──────▼──────┐
       │  AGENTE 7   │
       │ Integrador  │
       │ Front↔Back  │
       └─────────────┘
```

### Orden de Ejecución Recomendado

**Sprint 1 — Base y estructura:**
1. **Agente 1** crea modelos, migraciones y endpoints CRUD básicos
2. **Agente 2** implementa autenticación Google OAuth + JWT
3. **Agente 6** crea layout, temas, componentes base y páginas vacías

**Sprint 2 — Funcionalidad core:**
4. **Agente 1** completa endpoints de productos, clientes, proveedores, categorías
5. **Agente 6** construye las pantallas CRUD y la pantalla de ventas unificada
6. **Agente 7** conecta frontend con backend (hooks, estado, auth)
7. **Agente 5** implementa importación de Excel

**Sprint 3 — Documentos:**
8. **Agente 3** implementa generación de PDF (cotizaciones, remitos)
9. **Agente 4** integra facturación electrónica con ARCA
10. **Agente 3** implementa PDF de facturas con datos fiscales

**Sprint 4 — Cuentas, reportes y calidad:**
11. **Agente 1** implementa cuentas corrientes y dashboard
12. **Agente 6** construye pantallas de reportes y cuenta corriente
13. **Agente 7** integra las nuevas funcionalidades
14. **Agente 8** ejecuta batería completa de tests

---

## Convenciones de Comunicación entre Agentes

Cuando un agente necesita algo de otro agente, debe documentarlo así:

```
## DEPENDENCIA: [Agente X] → [Agente Y]
- **Necesito:** [descripción clara de lo que se necesita]
- **Para:** [endpoint/componente/funcionalidad que lo requiere]
- **Formato esperado:** [estructura de datos, interface, tipo de respuesta]
- **Prioridad:** Alta / Media / Baja
```

---

## Checklist de Entrega por Módulo

Cada módulo se considera completo cuando cumple:

- [ ] Código implementado según PRD
- [ ] Endpoints/componentes documentados
- [ ] Tests escritos y pasando
- [ ] Sin errores de lint/type
- [ ] Funcionalidad verificada manualmente
- [ ] Sin datos hardcodeados (usa .env)
- [ ] Responsive (frontend)
- [ ] Maneja errores correctamente
