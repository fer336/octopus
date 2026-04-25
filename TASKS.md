# TASKS - OctopusTrack

## 🔴 Pendiente
- [ ] [BRAND-HEADER-01] Branding/PDF: definir para qué sirve `header_text` y hacerlo visible realmente en los comprobantes o pantallas donde corresponda
- [ ] [OPS-01] Replicar migraciones pendientes en entorno de deploy (`f1a2b3c4d5e6`, `a9b8c7d6e5f4`)
- [ ] [FB-07] Validar flujo E2E feedback + sync a Linear con API key real (crear ticket tenant y verificar issue)
- [ ] [CC-14-QA] Testing: cubrir cierre preview/final + bloqueo CC-05 + visibilidad CC-04 en pendientes de facturar
- [ ] [CC-15-QA] Cuenta Corriente: validar E2E que un titular pueda tener múltiples subclientes autorizados (alta/edición/baja + uso en Ventas) y ajustar UX si detectamos fricción
- [ ] [CMS-CC-03] CMS/UI/Ventas: al activar/desactivar Cuenta Corriente en CMS, mostrar/ocultar en Tiempo Real tanto el ítem del Sidebar como la opción "Cta Cte" del menú de Ventas
- [x] [PREM-CC-03-BUG-01] Facturación desde comprobantes: en Sales, 1 remito seleccionado intenta usar `convert-to-invoice` (solo cotización) y falla; corregir enrutamiento/flujo individual ✅ 2026-04-22
- [x] [PREM-CC-01-A] Backend: endpoint `POST /vouchers/compile-to-invoice` que reciba múltiples quotation_ids, valide, cree factura única y marque todas como facturadas ✅ 2026-04-21
- [x] [PREM-CC-01-B] Frontend Opción A: pantalla de Ventas permite cargar múltiples códigos de presupuesto, mostrar chips de selección, y facturar compilado ✅ 2026-04-21
- [x] [PREM-CC-01-C] Frontend Opción B: listado de comprobantes permite selección múltiple de cotizaciones + bulk action "Facturar seleccionadas" ✅ 2026-04-21
- [x] [PREM-CC-01-D] Frontend: en detalle de factura, mostrar desplegable/acordeón con cotizaciones origen que la componen ✅ 2026-04-21
- [ ] [CMS-UX-01] CMS: revisar arquitectura/UX del CMS y proponer reorganización de secciones, navegación y prioridades
- [ ] [CMS-DASH-01] CMS: diseñar e implementar dashboard con métricas clave (tenants activos, estado de planes, cobranzas, alertas)
- [ ] [CMS-BILL-01] CMS: agregar módulo de pagos/cobranzas por cliente con historial y estado mensual
- [ ] [BILLING-MP-01] Billing: integrar MercadoPago (botón de pago por plan) usando API provista y flujo por negocio/tenant
- [ ] [BILLING-MP-02] Billing: contador mensual por tenant (1/0 días restantes) + recordatorios automáticos de pago al vencer
- [ ] [PLANS-CMS-01] CMS/Landing/Billing: definir modelo de planes por usuario/negocio y conectar compra de landing (plan + email + negocio) con asignación automática en CMS

## 🟡 En progreso





## 🟢 Hecho

- [x] [MKT-LANDING-CTA-02] Landing: quitar CTAs redundantes "Ver demo del sistema completo" y "Comprar y recibir ahora" del bloque del cotizador ✅ 2026-04-24

- [x] [MKT-BUYER-EMAIL-ANCHOR-04] Landing: bajar 4px el aterrizaje de "Comprar cotizador" para ajuste fino ✅ 2026-04-24

- [x] [MKT-PLANS-OFFSET-07] Landing: subir un poco más el scroll de planes para ajuste fino final ✅ 2026-04-24

- [x] [MKT-PLANS-OFFSET-06] Landing: subir al máximo razonable el scroll de planes para pegarlo al header ✅ 2026-04-24

- [x] [MKT-PLANS-OFFSET-05] Landing: subir todavía más el scroll de planes hasta pegarlo visualmente al header ✅ 2026-04-24

- [x] [MKT-PLANS-OFFSET-04] Landing: subir aún más el scroll de planes para que quede más pegado al header ✅ 2026-04-24

- [x] [MKT-PLANS-OFFSET-03] Landing: subir un poco más la navegación de planes para alinearla al borde del header ✅ 2026-04-24

- [x] [MKT-BUYER-EMAIL-ANCHOR-03] Landing: corregir target de compra para anclar a la card del cotizador y no a la sección completa ✅ 2026-04-24

- [x] [MKT-BUYER-EMAIL-ANCHOR-02] Landing: corregir scroll de compra para mostrar completa la card del cotizador y enfocar email sin cortar encabezado ✅ 2026-04-24

- [x] [MKT-PLANS-ANCHOR-04] Landing: corregir navegación de planes para aterrizar en el top real de la sección como referencia visual aprobada ✅ 2026-04-24

- [x] [MKT-PLANS-ANCHOR-03] Landing: mover anchor de navegación de planes a un punto interno más estable para evitar cortes visuales ✅ 2026-04-24

- [x] [MKT-BUYER-EMAIL-ANCHOR-01] Landing: hacer que "Comprar cotizador" aterrice sobre el campo de email y le dé foco ✅ 2026-04-24

- [x] [MKT-PLANS-OFFSET-02] Landing: afinar posición final del anchor de planes para alinearlo con el header ✅ 2026-04-24

- [x] [MKT-PLANS-OFFSET-01] Landing: ajustar offset del anchor de planes para subir la sección un poco más ✅ 2026-04-24

- [x] [MKT-LANDING-CTA-01] Landing: corregir targets visuales de "Ver demo" y unificar CTAs de Excel con checkout MP ✅ 2026-04-24

- [x] [MKT-DEPLOY-01] Landing: corregir build roto por variables sin uso en `Landing.tsx` y reintentar deploy ✅ 2026-04-24

- [x] [MKT-LANDING-REMOVE-DELIVERY-01] Landing: quitar bloque "Recibilo por email o WhatsApp" ✅ 2026-04-24

- [x] [MKT-PLANS-CHECKOUT-01] Landing: conectar planes 33/49/119 al mismo checkout MP de n8n y capturar email para onboarding ✅ 2026-04-24

- [x] [MKT-MOBILE-PLANS-01] Landing mobile: centrar bloque de planes y CTA "Ver planes" ✅ 2026-04-24

- [x] [MKT-MOBILE-HEADER-01] Landing mobile: centrar logo del header en mobile ✅ 2026-04-24

- [x] [MKT-HERO-01] Landing: quitar logo/visual del hero y centrar copy principal + CTAs en desktop ✅ 2026-04-24

- [x] [MKT-16-SETUP-01] N8N: generar workflows importables (`octopus-notification`, `octopus-return`) + payload listo de checkout MP en `docs/` para aplicación manual en n8n ✅ 2026-04-24

- [x] [DEVOPS-LANDING-02] Configurar secrets/vars de GitHub y webhook de Portainer para activar deploy automático real de la landing en el dominio público ✅ 2026-04-24

- [x] [DEVOPS-LANDING-03] Crear stack compose dedicado para landing pública con Traefik y dominio separado ✅ 2026-04-24

- [x] [DEVOPS-LANDING-01] Landing: separar build/entrypoint y crear CI/CD dedicado para deploy automático en dominio público ✅ 2026-04-24

- [x] [AI-ARCH-02] IA Cotizaciones: validar implementación real de Luci (router/chat/history/store/ventas) y aterrizar propuesta multiagente sobre el codebase actual ✅ 2026-04-23

- [x] [AI-ARCH-01] IA Cotizaciones: relevamiento del codebase actual y propuesta de arquitectura multiagente segura para orquestador + subagentes paralelos ✅ 2026-04-23

- [x] [DOCS-03] README: versión comercial enfocada en funcionalidades actuales paso a paso + URL demo + autorización por WhatsApp (sin sección de instalación) ✅ 2026-04-23
- [x] [DOCS-02] README: simplificar documentación a estado actual real del sistema + guía de instalación/ejecución (Docker y local) ✅ 2026-04-23
- [x] [DOCS-01] README: reorganizar galería de screenshots en `docs/screenshots/` con nombres reales de archivos y todas las vistas actuales del sistema ✅ 2026-04-22
- [x] [CMS-TENANT-DEL-01] CMS: agregar acción visible para eliminar/purgar comercio desde Tenant Detail con confirmación fuerte ✅ 2026-04-22

- [x] [CMS-DASH-02] CMS Dashboard: mostrar métricas reales del negocio/plataforma, incluyendo clientes activos, tenants activos, usuarios activos y estado de facturación ✅ 2026-04-22

- [x] [AUTH-ONBOARD-01] Auth/CMS: cuando un usuario intente ingresar por primera vez, registrarlo automáticamente en Gestión de Usuarios pero dejarlo bloqueado/pendiente por defecto hasta aprobación ✅ 2026-04-22

- [x] [TAX-STD-01] Fiscal: normalizar condición fiscal en todo el sistema con dropdown único y opciones predeterminadas consistentes para backend/frontend/AFIP SDK ✅ 2026-04-22

- [x] [ARCA-CLEAN-01] Remover referencias activas a MrBot del CMS y documentación para dejar AFIP SDK como integración vigente ✅ 2026-04-22

- [x] [CMS-ARCA-01] CMS: aclarar onboarding de facturación electrónica para recordar qué pedir al cliente (token, acceso ARCA/certificados, test) ✅ 2026-04-22

- [x] [VOU-TABLE-UX-04] Comprobantes: mover detalle Titular/Autorizado/Retira a popover desde acciones de subfila ✅ 2026-04-22

- [x] [VOU-TABLE-UX-03] Comprobantes: agregar acciones útiles en subfilas (ver PDF) y reubicar Titular/Autorizado sin columnas dedicadas ✅ 2026-04-22

- [x] [VOU-TABLE-UX-02] Comprobantes: compactar columnas (más aire para Cliente), quitar Autorizado/Retira de tabla principal y ordenar Acciones en una sola fila ✅ 2026-04-22

- [x] [PREM-CC-03-UX-02] Facturación desde comprobantes: compactar aún más el modal y asegurar selección usable del cliente fiscal en Vouchers ✅ 2026-04-22

- [x] [PREM-CC-04] Facturación desde comprobantes: al emitir factura mostrar modal para elegir entre mantener precios originales del comprobante o actualizar precios vigentes, con trazabilidad del criterio aplicado ✅ 2026-04-22

- [x] [PREM-CC-04-EXP] Exploración técnica: unificación de estrategia de precios (histórico vs vigente) para facturación desde comprobantes en Sales/Vouchers + contrato API + trazabilidad ✅ 2026-04-22

- [x] [PREM-CC-03-UX-01] Facturación desde comprobantes: corregir selector de cliente fiscal y rediseñar modal compacto/horizontal sin scroll innecesario ✅ 2026-04-22

- [x] [PREM-CC-03-QA] QA/verify por código de `fiscal_client_id` en Sales/Vouchers (1 y varios), con evidencia y riesgos documentados ✅ 2026-04-22

- [x] [PREM-CC-03] Facturación desde comprobantes: al seleccionar 1 o varias cotizaciones/remitos del mismo cliente, permitir cambiar el cliente a facturar porque el titular fiscal final puede ser otra persona ✅ 2026-04-22

- [x] [PREM-CC-03-EXP] Investigación técnica: flujo actual compile-to-invoice y viabilidad de override de cliente fiscal al facturar desde comprobantes ✅ 2026-04-22

- [x] [PREM-CC-02] Premium: bloquear edición de presupuestos origen una vez compilados y marcarlos como "compilados" ✅ 2026-04-22

- [x] [PREM-CC-02-EXP] Investigación técnica: relevamiento backend/frontend para bloqueo de edición y marcado de presupuestos compilados ✅ 2026-04-22

### Ventas (Abril 2026)
- [x] [VOU-02] Ventas: permitir cargar comprobante por código de presupuesto y autocompletar tabla de productos ✅ 2026-04-21
- [x] [VOU-02-BUG-01] 🐛 Compilación múltiple: modal de pagos con selección por checkbox, referencia condicional y redondeo correcto de totales ✅ 2026-04-21
- [x] [VOU-02-UX-01] Comprobantes: mostrar cotizaciones compiladas como subfilas árbol dentro de la factura y compactar iconos de acciones ✅ 2026-04-21
- [x] [VOU-02-BUG-02] 🐛 Compilación múltiple: corregir cálculo backend para usar precios históricos de cotización + descuento explícito + redondeo monetario en validación de pagos ✅ 2026-04-21
- [x] [VOU-02-UX-02] Comprobantes: ocultar cotizaciones ya facturadas de la tabla raíz y mostrar árbol de subfilas consistente aunque cambie paginación/filtros ✅ 2026-04-21
- [x] [VOU-02-UX-03] Comprobantes: extender lógica de subfilas a remitos facturados (igual que cotizaciones) y ocultarlos de la tabla raíz ✅ 2026-04-21
- [x] [VOU-02-FLOW-01] Facturación mixta: permitir facturar 1 o más comprobantes seleccionados (cotización y/o remito) con validación por cliente ✅ 2026-04-21

### Marketing (Abril 2026)
- [x] [MKT-14-BUG-02] Landing: actualizar fallback de checkout al nuevo webhook `https://n8nw.qeva.xyz/webhook/octopus-mp` ✅ 2026-04-24
- [x] [MKT-15] Landing: exigir email antes de comprar y agregar botón para ver imagen demo del Excel ✅ 2026-04-24
- [x] [MKT-14-BUG-01] Landing: evitar fallback a WhatsApp cuando falta env de checkout, usando webhook MP activo por defecto ✅ 2026-04-24
- [x] [MKT-14] Landing: conectar botón de compra a webhook de checkout MP (POST) y redirección automática a `init_point` ✅ 2026-04-24
- [x] [MKT-12] Landing: eliminar CTA "Escribi COTIZADOR" y usar botones "Obtener Excel"/"Obtener Google Sheets" redirigidos a webhook ✅ 2026-04-24
- [x] [MKT-11] Landing: unificar logo de footer con header y mejorar version mobile responsive (look moderno) ✅ 2026-04-24
- [x] [MKT-10] Landing: actualizar branding de logos (header con `logo-tentaculo1.png` y footer con logo institucional) ✅ 2026-04-24
- [x] [MKT-09] Landing: eliminar configurador modular y simplificar oferta SaaS a 3 planes claros (33/45/119) con alcance comercial definido ✅ 2026-04-24
- [x] [MKT-08] Landing: quitar bloque "Demo visual: cotizacion en 10 segundos" del hero y reemplazarlo por visual mas limpio ✅ 2026-04-24
- [x] [MKT-07] Landing: usar logo1/logo1-dark en light/dark mode (header) para consistencia visual con nueva identidad ✅ 2026-04-24
- [x] [MKT-06] Rediseñar visual de la landing para acercarla al look&feel histórico (web-octopus) manteniendo la lógica nueva de compra/entrega automática ✅ 2026-04-24
- [x] [MKT-05] Implementar flujo de compra y entrega automatica del Cotizador (checkout + pagina de gracias + entrega de Excel/Google Sheets + captura de contacto) ✅ 2026-04-24
- [x] [MKT-04] Rediseñar landing de OctopusTrack con foco CRO (dual: Excel USD 11.99 + sistema SaaS modular), copy directo y configurador con precio dinámico ✅ 2026-04-24
- [x] [MKT-03] Optimizar pricing/copy de landing (combo Excel + reposicionamiento plan IA USD 600) ✅ 2026-04-21
- [x] [MKT-02] Definir oferta comercial híbrida (Excel + Sistema), posicionamiento y estructura de planes para la landing ✅ 2026-04-21
- [x] [MKT-01] Landing comercial para vender productos digitales de Excel (cotizadores) con copy orientado a conversión ✅ 2026-04-20

### Excels de Producto (Abril 2026)
- [x] [XLS-CC-01] Diseñar `CuentaCorriente_OctopusTrack.xlsx` (Config, Clientes, Movimientos, Estado_Cuenta, Dashboard, Impresion_Extracto, Ayuda) con branding OctopusTrack, fórmulas de saldo acumulado Debe/Haber, pivots, validaciones, formato condicional por riesgo y extracto A4 imprimible ✅ 2026-04-21
- [x] [XLS-CC-02] Generar plantilla funcional `excel/cotizador/CuentaCorriente_OctopusTrack.xlsx` con hojas, fórmulas, validaciones, dashboard y layout de impresión ✅ 2026-04-21

### Configuración (Abril 2026)
- [x] [CFG-DEV-01] Configurar credenciales de desarrollo para login (`DEV_LOGIN_EMAIL=demo@demo`, `DEV_LOGIN_PASSWORD=Demo1234!`) ✅ 2026-04-21

### Deploy y DevOps (Abril 2026)
- [x] [DEVOPS-09-BUG-01] 🐛 Release Docker: workflow ajustado para publicar imágenes con `backend/Dockerfile.prod` y `frontend/Dockerfile.prod` ✅ 2026-04-18
- [x] [DEVOPS-08] Release: preparar commit+push del nuevo release con recambio de screenshots en `docs/screenshots` ✅ 2026-04-18
- [x] [DEVOPS-07] GitHub Releases: automatizar creación de Release (badge Latest) al publicar tag semver en workflow `docker-release` ✅ 2026-04-17
- [x] [DEVOPS-06] Documentación secrets: ampliar guía con plantilla completa de `backend.env` y comandos SSH para crear/rotar `octopus_backend_env` ✅ 2026-04-17
- [x] [DEVOPS-05] Deploy domains: parametrizar stack/docs para `octopus.qeva.xyz` y `cms-octopus.qeva.xyz` con middleware Traefik en raíz ✅ 2026-04-17
- [x] [DEVOPS-04] Documentación deploy: crear guía MD para Hetzner + Portainer + Traefik + Secrets con pasos de build/push/deploy/verificación ✅ 2026-04-17
- [x] [DEVOPS-03] Deploy Traefik: separar subdominios ERP/CMS/API con middleware para abrir raíz sin mostrar `tenant.html`/`admin.html` ✅ 2026-04-17
- [x] [DEVOPS-02] Deploy Hetzner/Portainer: crear imagen backend prod compatible con Docker Secrets (`*_FILE`) + stack template de despliegue ✅ 2026-04-17
- [x] [DEVOPS-01-BUG-01] 🐛 CI backend: resolver conflicto `pytest==9.0.2` vs `pytest-asyncio==0.24.0` (requiere pytest < 9) ✅ 2026-04-17
- [x] [DEVOPS-01] CI/CD Release: publicar imágenes Docker (backend/frontend) en Docker Hub desde GitHub Releases/Tags (semver + latest + sha) y documentar secrets requeridos ✅ 2026-04-17

### Backup SQL y Productos
- [x] [DATA-06] 🐛 Import SQL: evitar duplicación de productos al importar SQL — ahora busca por código existente y actualiza en lugar de crear ✅ 2026-04-22
- [x] [DATA-05] 🐛 Backup SQL: corregir importación SQL real de productos/categorías/proveedores (parser robusto + mapeo de campos + manejo NULL/boolean + evitar duplicados) ✅ 2026-04-19
- [x] [DATA-05-BUG-03] 🐛 Import SQL: evitar duplicar categorías y proveedores si ya existen (buscar por nombre antes de crear) ✅ 2026-04-19
- [x] [DATA-05-BUG-02] 🐛 Import SQL: corregido `SyntaxError` en `backup_service.py` por f-strings con comillas anidadas en escape SQL ✅ 2026-04-18
- [x] [DATA-05-BUG-01] 🐛 Import SQL: corregir compatibilidad con dumps viejos que incluyen `barcode` (el modelo Product actual no tiene ese campo) ✅ 2026-04-17
- [x] [DATA-02] Productos: implementar descarga de backup SQL completo del tenant (incluyendo precios, bonificaciones y relaciones) ✅ 2026-04-12
- [x] [DATA-01] Productos: definir estrategia de backup SQL por tenant (dump lógico aislado, no export parcial Excel) ✅ 2026-04-12

### Onboarding Tours
- [x] [ONB-TOUR-01] Onboarding: Product Tour guiado por módulo implementado (Ventas por modo, Precios, Inventario, Clientes, Cuenta Corriente) con automatizaciones de flujo y UI compacta en modal de precios ✅ 2026-04-18
- [x] [ONB-TOUR-02] Onboarding: validar tour en entorno real (selector por pantalla + copy + persistencia por usuario) y ajustar pasos según feedback ✅ 2026-04-19
- [x] [ONB-TOUR-04] 🐛 Tour Precios: forzar posicionamiento del paso "Actualizar productos" sobre botón flotante (abajo) y esperar render tras selección ✅ 2026-04-18
- [x] [ONB-TOUR-03] 🐛 Tour Precios: corregir apertura automática del modal en paso "Actualizar productos" (se había perdido `onNextClick`) ✅ 2026-04-18
- [x] [UX-IMP-01] Productos: mostrar modal de loading/progreso durante importación SQL para feedback en tiempo real al usuario ✅ 2026-04-17

### Cuenta Corriente
- [x] [CC-14-FE] Cuenta Corriente UI: sección "Histórico de cierres" por titular, expandible por cierre y acceso a PDF final ✅ 2026-04-19
- [x] [CC-14-BE] Cuenta Corriente: endpoint de histórico de cierres por cliente titular con detalle de remitos incluidos por cierre ✅ 2026-04-19
- [x] [CC-13-FE] Cuenta Corriente UI: agregar botón "Vista preliminar" del cierre (abre PDF preliminar sin bloquear/afectar remitos) ✅ 2026-04-19
- [x] [CC-13-UX] Cuenta Corriente UI: flujo de confirmación en dos pasos (Previsualizar → Confirmar cierre) con mensajes claros de impacto ✅ 2026-04-19
- [x] [CC-12-PDF] Cuenta Corriente: crear template PDF compacto de cierre (densidad tipo Orden de Pedido) con desglose por remito, productos, descuento por ítem y descuento general por remito ✅ 2026-04-19
- [x] [CC-12-LINK] Cuenta Corriente: persistir vínculo explícito cierre↔remitos↔ítems para trazabilidad histórica ✅ 2026-04-19
- [x] [CC-12-BE] Cuenta Corriente: diseñar/implementar endpoints de cierre detallado (`preview` sin persistencia + `confirm` con persistencia) ✅ 2026-04-19
- [x] [CC-11] Cuenta Corriente: permitir autorizaciones titular→subcliente restringidas por Concepto/Obra y validar en emisión de remito ✅ 2026-04-19
- [x] [CC-10] Cuenta Corriente: crear "Concepto de Retiro / Obra" (catálogo por titular) para etiquetar remitos ✅ 2026-04-19
- [x] [CC-06] Cuenta Corriente: evaluar e implementar opción de interés por mora configurable ✅ 2026-04-19
- [x] [CC-02] Cuenta Corriente: permitir descuento global al cierre/liquidación de cuenta antes de emitir comprobante final ✅ 2026-04-19
- [x] [CC-PLAN-01] Analizar estado actual (backend/frontend/PDF) de cierre de Cuenta Corriente y preparar plan técnico + tareas accionables ✅ 2026-04-16
- [x] [CC-BUG-04] 🐛 Ventas Cta Cte: corregir selector titular/subcliente (autorizaciones + fallback a titular + payload `operating_client`) ✅ 2026-04-16
- [x] [CC-09-BUG-02] 🐛 Remito PDF CC: ubicar "Retira" debajo de domicilio y mostrar fallback TITULAR cuando no hay subcliente ✅ 2026-04-16
- [x] [CC-09] Remitos Cuenta Corriente: agregar campo/indicador "Autorizado" (sí/no) y mostrar nombre del subcliente retirador en listado/detalle/PDF según corresponda ✅ 2026-04-16
- [x] [CC-08] Cuenta Corriente UI: en "Subcliente autorizado" ocultar al cliente titular seleccionado para evitar autovínculo ✅ 2026-04-16
- [x] [CC-BUG-03] 🐛 Cuenta Corriente: evitar select de titular vacío cuando todos los clientes tienen `current_account_mode=disabled` ✅ 2026-04-16
- [x] [CC-BUG-02] 🐛 Cuenta Corriente: corregir carga de clientes en `CurrentAccount` (frontend enviaba `per_page=200`) ✅ 2026-04-16
- [x] [CC-01] Cuenta Corriente: crear nueva sección con tabla de clientes y remitos retirados para edición/control previo al cierre ✅ 2026-04-15
- [x] [CC-03] Cuenta Corriente: modelar relación pagador/retiro (cliente titular + subcliente autorizado existente) ✅ 2026-04-15
- [x] [CC-03-BUG-01] 🐛 SQLAlchemy: resolver AmbiguousForeignKeys entre `clients` y `vouchers` ✅ 2026-04-15
- [x] [CC-07] Clientes: agregar "Tipo de Cliente" (catálogo administrable por tenant) + flag `is_subclient_eligible` ✅ 2026-04-15
- [x] [CC-04] Cuenta Corriente: al cerrar cuenta generar comprobante pendiente de facturación con bandera "Cta Cte cerrada" ✅ 2026-04-15
- [x] [CC-05] Cuenta Corriente: bloquear edición/eliminación de remitos incluidos en cierre y auditar diff ✅ 2026-04-15
- [x] [SALES-CC-01] Ventas: agregar tipo de comprobante/flujo "Cuenta Corriente" con impresión con/sin precios y con/sin descuento ✅ 2026-04-15
- [x] [CMS-CC-01] CMS: agregar feature flag de Cuenta Corriente (modo automático / modo manual) por tenant ✅ 2026-04-15
- [x] [CMS-CC-02] CMS/UI: mostrar/ocultar ítem de sidebar "Cuenta Corriente" según toggle de feature flag ✅ 2026-04-15
- [x] [CMS-CC-04] CMS usuarios: mostrar permiso "Cuenta Corriente" solo cuando el módulo esté habilitado en el tenant ✅ 2026-04-15

### UI/UX y Branding
- [x] [BRAND-02] Rebranding UI: migrar TODO EL SISTEMA a la nueva paleta de colores (Light y Dark) ✅ 2026-04-14
- [x] [BRAND-01] Rebranding UI: aplicar nueva paleta (light/dark) y actualizar logo con fondo transparente ✅ 2026-04-14
- [x] [BRAND-03] Branding: actualizar logos (sidebar + login) y compactar pantalla de login ✅ 2026-04-14
- [x] [UI-06] Proveedores: rediseño compacto ✅ 2026-04-14
- [x] [UI-05] Clientes: rediseño compacto/bonito (tabla, filtros, modal, spacing) ✅ 2026-04-12

### Reportes y PDFs
- [x] [REP-01] Reportes: diseñar arquitectura de reportes PDF (ventas, productos, stock, cuentas corrientes) ✅ 2026-04-14
- [x] [REP-02] Reportes: implementar primera versión funcional de exportación PDF por reporte ✅ 2026-04-15
- [x] [PDF-07] Ajustar ancho de columnas en comprobantes PDF para maximizar "Producto / Servicio" ✅ 2026-04-15
- [x] [PDF-06] Comprobantes PDF: fijar columnas "Cantidad" y "Código" en 65px ✅ 2026-04-15
- [x] [PDF-05] Comprobantes PDF (Remito + Factura): igualar ancho de columna "Código" con "Cantidad" ✅ 2026-04-15
- [x] [PDF-04] Cotización PDF: achicar el ancho de la columna "Código" ✅ 2026-04-14
- [x] [PDF-03] PDFs: quitar footer con firma comercial "Sistema creado por Qeva AI" ✅ 2026-04-13

### ACL y Permisos
- [x] [AUTH-ACL-01] CMS/Sesiones: jerarquía de administración por negocio (admin crea sub-empleados) ✅ 2026-04-15
- [x] [AUTH-ACL-02] ACL backend: aplicar enforcement server-side por módulo ✅ 2026-04-15
- [x] [AUTH-ACL-BUG-01] 🐛 CMS usuarios: corregir error `tenant_memberships.module_permissions does not exist` ✅ 2026-04-15
- [x] [AUTH-ACL-BUG-02] 🐛 Tenant frontend en blanco: corregir `useAuthStore is not defined` ✅ 2026-04-15
- [x] [AUTH-ACL-UI-01] CMS usuarios: compactar tabla/permisos y dejar acciones en una sola fila ✅ 2026-04-15
- [x] [CMS-ACL-04] CMS/ACL: agregar toggles por tenant para Facturación, Remitos, Actualización de precios y Reportes ✅ 2026-04-16

### Varios
- [x] [VOU-TABLE-UX-01] Comprobantes: reemplazar árbol visual por desplegable limpio (sin flechas/conectores), normalizar subfilas origen y corregir overflow de columna Acciones ✅ 2026-04-22
- [x] [PREM-CC-03-BUG-01] 🐛 Sales (modal pendientes): al facturar 1 remito usa endpoint `convert-to-invoice` (solo cotización) y falla; debería enrutar por `compile-to-invoice` o soportar remito en convert ✅ 2026-04-22
- [x] [PREM-CC-03-BUG-02] 🐛 Inconsistencia 1 vs varios en Sales: unificar default de price_strategy a "historical" en convert-to-invoice (era "current") para que 1 comprobante y varios usen la misma estrategia ✅ 2026-04-22
- [x] [UI-SALES-HEADER-01] Ventas: reparar header para que "Limpiar" y "Borradores" muestren solo icono y todo el bloque quede en una sola fila ✅ 2026-04-22
- [x] [VOU-01] Ventas/Remitos: exponer en UI de impresión la opción incluir/quitar precios para Remitos ✅ 2026-04-14
- [x] [VOU-01-FIX] 🐛 Corregir alcance de toggle de precios: NO aplica a cotización (solo remito) ✅ 2026-04-14
- [x] [INV-01] Inventario: permitir eliminar órdenes con UX clara (confirmación + feedback) ✅ 2026-04-12
- [x] [INV-02] Inventario: registrar auditoría de eliminación de órdenes ✅ 2026-04-12
- [x] [INT-01] Clientes: investigar integración ARCA/AFIP para autocompletar datos por CUIT ✅ 2026-04-12
- [x] [INT-02] Clientes: implementar lookup CUIT y autocompletar campos con fallback manual ✅ 2026-04-12
- [x] [SUP-01] Proveedores: remover bonificaciones del formulario y del listado ✅ 2026-04-14
- [x] [PWA-META-01] Frontend: reemplazar meta tag deprecated `apple-mobile-web-app-capable` ✅ 2026-04-15
- [x] [UI-SALES-ALERT-01] Ventas: reemplazar `window.confirm` de "Limpiar" por modal UI ✅ 2026-04-15
- [x] [UI-CONFIRM-01] Frontend: reemplazar `window.confirm/confirm` restantes por modales UI ✅ 2026-04-15
- [x] [PLAN-03] Definir estrategia "Opción B" para Cuenta Corriente (CMS + modos + premium) ✅ 2026-04-13

### Admin y Premium
- [x] [ADMIN-01] CMS: agregar acción de borrado total de datos de tenant (solo superadmin) ✅ 2026-04-12
- [x] [ADMIN-02] CMS: registrar auditoría fuerte de borrado total ✅ 2026-04-12
- [x] Implementar control de funcionalidades premium desde CMS (fase 1: Agente IA) ✅ 2026-04-12
- [x] Corregir visibilidad del Agente IA en frontend tenant según feature flag ✅ 2026-04-12

## 🚧 Bloqueado
- [!] [MKT-20] N8N: definir e implementar workflow de retorno HTML (GET) + completar workflow de notificación (POST) para envío automático por Gmail 🚧 Definición técnica lista en `docs/n8n-octopus-mp-flujos.md`; pendiente aplicar cambios manuales en n8n UI (MCP no permite editar nodos)
- [!] [MKT-19] N8N: mostrar página HTML post-pago con botones Excel/Sheets 🚧 Debe implementarse en endpoint de retorno GET (back_urls), no en webhook de notificación POST de MercadoPago
- [!] [MKT-18] N8N/MP: usar mismo endpoint `octopus-notification` para `notification_url` y `back_urls` 🚧 El webhook actual acepta solo POST; `back_urls` de MercadoPago redirigen por GET y hoy devuelve 404
- [!] [MKT-17] N8N: alinear `notification_url` del checkout a `/webhook/octopus-notification` 🚧 Requiere edición manual en n8n UI (MCP actual no permite editar nodos)
- [!] [MKT-16] N8N: completar flujo post-pago (notificacion MP -> envio email con links/adjunto) y definir pruebas en sandbox antes de produccion 🚧 MCP no expone edición de nodos/workflow; requiere ajuste manual en n8n UI y luego validación
- [!] [MKT-13] N8N: duplicar workflow base para checkout de Mercadopago y conectar botón de compra de landing al webhook nuevo 🚧 MCP actual expone búsqueda/detalle/ejecución pero no endpoint de clonación; falta ID del workflow duplicado para continuar con ajustes
- [!] [DATA-03] Definir semántica "borrar base de datos completa" 🚧 El sistema es multitenant en una sola DB; no corresponde `DROP DATABASE`, sino purga transaccional por `business_id`.
- [!] [DATA-04] Definir formato final de backup "SQL completo del usuario" 🚧 En entorno compartido no se puede exponer dump global; hay que generar dump lógico por tenant.
- [!] [INT-03] Clientes: razón social AFIP por CUIT no confiable en algunos casos 🚧 Constancia devuelve errores regulatorios para ciertos CUITs.
