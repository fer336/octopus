# TASKS - OctopusTrack

## 🔴 Pendiente
- [ ] [UX-IMP-01] Productos: mostrar modal de loading/progreso durante importación SQL para feedback en tiempo real al usuario
- [ ] [DATA-05] 🐛 Backup SQL: corregir importación SQL real de productos/categorías/proveedores (parser robusto + mapeo de campos + manejo NULL/boolean)
- [ ] [OPS-01] Replicar migraciones pendientes en entorno de deploy (`f1a2b3c4d5e6`, `a9b8c7d6e5f4`)
- [ ] [FB-07] Validar flujo E2E feedback + sync a Linear con API key real (crear ticket tenant y verificar issue)
- [ ] [VOU-02] Ventas: permitir cargar comprobante por código de presupuesto y autocompletar tabla de productos
- [ ] [CC-02] Cuenta Corriente: permitir descuento global al cierre/liquidación de cuenta antes de emitir comprobante final
- [x] [CC-03] Cuenta Corriente: modelar relación pagador/retiro (cliente titular + subcliente autorizado existente) con validación de alta obligatoria en padrón de clientes ✅ 2026-04-15
- [x] [CC-07] Clientes: agregar "Tipo de Cliente" (catálogo administrable por tenant) en alta/edición/filtros + flag `is_subclient_eligible` para habilitar retiro por terceros ✅ 2026-04-15
- [x] [CC-04] Cuenta Corriente: al cerrar cuenta generar comprobante pendiente de facturación en Ventas con bandera "Cta Cte cerrada" ✅ 2026-04-15
- [x] [CC-05] Cuenta Corriente: bloquear edición/eliminación de remitos incluidos en cierre y auditar diff before/after + motivo ✅ 2026-04-15
- [ ] [CC-06] Cuenta Corriente: evaluar e implementar opción de interés por mora configurable
- [ ] [CC-10] Cuenta Corriente: crear "Concepto de Retiro / Obra" (catálogo por titular) para etiquetar remitos (ej: CALIOPE 1234, FERLU 2334)
- [ ] [CC-11] Cuenta Corriente: permitir autorizaciones titular→subcliente restringidas por Concepto/Obra y validar en emisión de remito
- [ ] [CC-12-BE] Cuenta Corriente: diseñar/implementar endpoints de cierre detallado (`preview` sin persistencia + `confirm` con persistencia) manteniendo compatibilidad con CC-03/04/05/08/09
- [ ] [CC-12-PDF] Cuenta Corriente: crear template PDF compacto de cierre (densidad tipo Orden de Pedido) con desglose por remito, productos, descuento por ítem y descuento general por remito
- [ ] [CC-12-LINK] Cuenta Corriente: persistir vínculo explícito cierre↔remitos↔ítems para trazabilidad histórica (evitar depender de parseo de descripción)
- [ ] [CC-13-FE] Cuenta Corriente UI: agregar botón "Vista preliminar" del cierre (abre PDF preliminar sin bloquear/afectar remitos)
- [ ] [CC-13-UX] Cuenta Corriente UI: flujo de confirmación en dos pasos (Previsualizar → Confirmar cierre) con mensajes claros de impacto
- [ ] [CC-14-BE] Cuenta Corriente: endpoint de histórico de cierres por cliente titular con detalle de remitos incluidos por cierre
- [ ] [CC-14-FE] Cuenta Corriente UI: sección "Histórico de cierres" por titular, expandible por cierre y acceso a PDF final
- [ ] [CC-14-QA] Testing: cubrir cierre preview/final + bloqueo CC-05 + visibilidad CC-04 en pendientes de facturar
- [ ] [CMS-CC-03] CMS/UI/Ventas: al activar/desactivar Cuenta Corriente en CMS, mostrar/ocultar en tiempo real tanto el ítem del Sidebar como la opción "Cta Cte" del menú de Ventas
- [x] [SALES-CC-01] Ventas: agregar tipo de comprobante/flujo "Cuenta Corriente" con impresión con/sin precios y con/sin descuento ✅ 2026-04-15
- [ ] [PREM-CC-01] Premium: compilar múltiples presupuestos por código en un comprobante unificado
- [ ] [PREM-CC-02] Premium: bloquear edición de presupuestos origen una vez compilados y marcarlos como "compilados"

## 🟢 Hecho
- [x] [DEVOPS-01] CI/CD Release: publicar imágenes Docker (backend/frontend) en Docker Hub desde GitHub Releases/Tags (semver + latest + sha) y documentar secrets requeridos ✅ 2026-04-17
- [x] [UX-IMP-01] Productos: mostrar modal de loading/progreso durante importación SQL para feedback en tiempo real al usuario ✅ 2026-04-17
- [x] [DATA-05-BUG-01] 🐛 Import SQL: corregir compatibilidad con dumps viejos que incluyen `barcode` (el modelo Product actual no tiene ese campo) ✅ 2026-04-17
- [x] [CC-PLAN-01] Analizar estado actual (backend/frontend/PDF) de cierre de Cuenta Corriente y preparar plan técnico + tareas accionables ✅ 2026-04-16
- [x] [CC-BUG-04] 🐛 Ventas Cta Cte: corregir selector titular/subcliente (autorizaciones + fallback a titular + payload `operating_client`) ✅ 2026-04-16
- [x] [CC-09-BUG-02] 🐛 Remito PDF CC: ubicar "Retira" debajo de domicilio y mostrar fallback TITULAR cuando no hay subcliente ✅ 2026-04-16
- [x] [CC-09] Remitos Cuenta Corriente: agregar campo/indicador "Autorizado" (sí/no) y mostrar nombre del subcliente retirador en listado/detalle/PDF según corresponda ✅ 2026-04-16
- [x] [CC-08] Cuenta Corriente UI: en "Subcliente autorizado" ocultar al cliente titular seleccionado para evitar autovínculo (titular ≠ subcliente) ✅ 2026-04-16
- [x] [CC-BUG-03] 🐛 Cuenta Corriente: evitar select de titular vacío cuando todos los clientes tienen `current_account_mode=disabled`; agregar explicación + CTA + opción para incluir deshabilitados ✅ 2026-04-16
- [x] [CC-BUG-02] 🐛 Cuenta Corriente: corregir carga de clientes en `CurrentAccount` (frontend enviaba `per_page=200` y API de clientes limita a 100, devolviendo 422 silencioso) ✅ 2026-04-16
- [x] [CC-01] Cuenta Corriente: crear nueva sección con tabla de clientes y remitos retirados para edición/control previo al cierre ✅ 2026-04-15
- [x] [CC-03-BUG-01] 🐛 SQLAlchemy: resolver AmbiguousForeignKeys entre `clients` y `vouchers` al agregar `billing_client_id`/`operating_client_id` (fix en `foreign_keys` explícitos) ✅ 2026-04-15
- [x] [BRAND-02] Rebranding UI: migrar TODO EL SISTEMA a la nueva paleta de colores (botones, tablas, inputs, modales, etc.) garantizando soporte perfecto para versión Light y Dark. ✅ 2026-04-14
- [x] [DATA-01] Productos: definir estrategia de backup SQL por tenant (dump lógico aislado, no export parcial Excel) ✅ 2026-04-12

## 🟢 Hecho
- [x] [DATA-02] Productos: implementar descarga de backup SQL completo del tenant (incluyendo precios, bonificaciones y relaciones) ✅ 2026-04-12

## 🟡 En progreso

- [/] [DATA-05] 🐛 Backup SQL: corregir importación SQL real de productos/categorías/proveedores (parser robusto + mapeo de campos + manejo NULL/boolean)















## 🟢 Hecho
- [x] [CMS-ACL-04] CMS/ACL: agregar toggles por tenant para Facturación, Remitos, Actualización de precios y Reportes (backend + CMS + UI tenant) ✅ 2026-04-16
- [x] [BIZ-EXCEL-03] Diseñar Cotizador Excel con numeración automática, historial y guía completa de macros VBA ✅ 2026-04-14
- [x] [AUTH-ACL-01] CMS/Sesiones: jerarquía de administración por negocio (admin crea sub-empleados y gestiona permisos granulares por módulo) ✅ 2026-04-15
- [x] [AUTH-ACL-02] ACL backend: aplicar enforcement server-side por módulo para endurecer seguridad (además del bloqueo de UI) ✅ 2026-04-15
- [x] [AUTH-ACL-BUG-01] 🐛 CMS usuarios: corregir error `tenant_memberships.module_permissions does not exist` aplicando migración pendiente a `head` ✅ 2026-04-15
- [x] [AUTH-ACL-UI-01] CMS usuarios: compactar tabla/permisos y dejar acciones en una sola fila con iconos ✅ 2026-04-15
- [x] [AUTH-ACL-BUG-02] 🐛 Tenant frontend en blanco: corregir `useAuthStore is not defined` en MainLayout ✅ 2026-04-15
- [x] [PWA-META-01] Frontend: reemplazar meta tag deprecated `apple-mobile-web-app-capable` por `mobile-web-app-capable` ✅ 2026-04-15
- [x] [UI-SALES-ALERT-01] Ventas: reemplazar `window.confirm` de "Limpiar" por modal UI con paleta del sistema ✅ 2026-04-15
- [x] [UI-CONFIRM-01] Frontend: reemplazar `window.confirm/confirm` restantes por modales UI consistentes ✅ 2026-04-15
- [x] [CMS-CC-01] CMS: agregar feature flag de Cuenta Corriente (modo automático / modo manual) por tenant ✅ 2026-04-15
- [x] [CMS-CC-02] CMS/UI: mostrar/ocultar ítem de sidebar "Cuenta Corriente" según toggle de feature flag ✅ 2026-04-15
- [x] [CMS-CC-04] CMS usuarios: mostrar permiso "Cuenta Corriente" solo cuando el módulo esté habilitado en el tenant ✅ 2026-04-15
- [x] [BIZ-EXCEL-02] Documentar en `prompt.md` los 5 prompts maestros para crear los productos digitales en Excel ✅ 2026-04-14
- [x] [BIZ-EXCEL-01] Estrategia comercial: crear 5 prompts detallados para construir productos digitales en Excel basados en módulos del sistema ✅ 2026-04-14
- [x] [UI-CLIENTS-SUP-02] UI: unificar tamaño/layout general de Categorías, Clientes y Proveedores (contenedor + tabla + spacing) ✅ 2026-04-14
- [x] [BRAND-03-ADJ-8] Sidebar: aplicar tono violeta claro al wordmark "Octopus Track" y footer ✅ 2026-04-14
- [x] [UI-CLIENTS-SUP-01] UI: unificar diseño de header en Clientes y Proveedores al estilo de Categorías con paleta primary ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-10] Ventas: restaurar visibilidad de acciones "Limpiar" y "Borradores" con icono + texto en toolbar ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-9] Ventas: ajustar ancho del panel Resumen a 288px ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-8] Ventas: angostar panel Resumen y estirarlo hasta el final visual de la segunda tabla ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-7] Ventas: reducir 3px filas de tabla superior, mejorar distinción visual y reubicar zoom dentro de la tabla ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-6] Ventas: compactar filas de tabla superior para igualar densidad visual con tabla inferior y angostar resumen 3px ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-5] Ventas: priorizar ocupación horizontal (ancho) y revertir expansión vertical excesiva ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-4] Ventas: expandir layout principal para ocupar alto disponible (tablas + panel resumen) ✅ 2026-04-14
- [x] [UI-SALES-07-BUG-02] 🐛 Ventas: restaurar paleta `primary` en modal "Comprobantes Pendientes de Facturar" (tabs, focus, hover, CTA) ✅ 2026-04-14
- [x] [UI-SALES-07-BUG-01] 🐛 Ventas: corregir error JSX por cierre extra de `div` en toolbar compacta (`Adjacent JSX elements`) ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-3] Ventas: quitar control de porcentaje (zoom) y evitar barra horizontal del toolbar usando layout wrap ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ-2] Ventas: agrandar iconos de toolbar compacta (acciones + tipos + toggle precios) ✅ 2026-04-14
- [x] [UI-SALES-07-ADJ] Ventas: dejar botones Limpiar y Borradores solo con icono en toolbar compacta ✅ 2026-04-14
- [x] [UI-SALES-07] Ventas: compactar barra superior en una sola fila con botones por tipo (4) e iconografía mejorada (incluye toggle simple de precios en remito) ✅ 2026-04-14
- [x] [BRAND-03-ADJ-7] Sidebar: achicar más el wordmark y aplicar tono morado (`#5c3a8c`) ✅ 2026-04-14
- [x] [BRAND-03-ADJ-6] Sidebar: agrandar icono principal y achicar wordmark 2px ✅ 2026-04-14
- [x] [BRAND-03-ADJ-5] Sidebar: usar `logo-tenculo-finalpng` como icono principal ✅ 2026-04-14
- [x] [BRAND-03-ADJ-4] Sidebar: achicar branding del header en 2px (icono y wordmark) ✅ 2026-04-14
- [x] [BRAND-03-ADJ-3] Sidebar: reemplazar texto "Octopus" por imagen `texto-solo-octopus.png` y agrandar branding del header ✅ 2026-04-14
- [x] [BRAND-03-ADJ] Login: quitar texto negro "OctopusTrack" debajo del logo y dejar marca solo en la imagen ✅ 2026-04-14
- [x] [BRAND-03-ADJ-2] Login: reemplazar `logo-octopus` por `logo-tentaculo` y agrandar logo +3px ✅ 2026-04-14
- [x] [BRAND-03] Branding: actualizar logos (sidebar + login) y compactar pantalla de login ✅ 2026-04-14
- [x] [BRAND-01] Rebranding UI: aplicar nueva paleta (light/dark) y actualizar logo `logo-octopus.png` con fondo transparente ✅ 2026-04-14
- [x] [REP-01] Reportes: diseñar arquitectura de reportes PDF (ventas, productos, stock, cuentas corrientes) ✅ 2026-04-14
- [x] [SUP-01] Proveedores: remover bonificaciones del formulario y del listado ✅ 2026-04-14
- [x] [UI-06] Proveedores: rediseño compacto ✅ 2026-04-14
- [x] [VOU-01] Ventas/Remitos: exponer en UI de impresión la opción incluir/quitar precios para Remitos (backend ya soporta `show_prices`) ✅ 2026-04-14
- [x] [VOU-01-FIX] 🐛 Corregir alcance de toggle de precios: NO aplica a cotización (solo remito; Cuenta Corriente queda para su flujo específico) ✅ 2026-04-14
- [x] [PDF-04] Cotización PDF: achicar el ancho de la columna "Código" ✅ 2026-04-14
- [x] [PDF-05] Comprobantes PDF (Remito + Factura): igualar ancho en px de la columna "Código" con la columna "Cantidad" ✅ 2026-04-15
- [x] [PDF-06] Comprobantes PDF (Cotización + Remito + Factura): fijar columnas "Cantidad" y "Código" en 65px ✅ 2026-04-15
- [x] [PDF-07] Ajustar ancho de columnas en comprobantes PDF para maximizar "Producto / Servicio" (Cantidad/Código más angostas) ✅ 2026-04-15
- [x] [PDF-03] PDFs (cotización/remito/factura): quitar footer con firma comercial "Sistema creado por Qeva AI · Contacto: +54 9 225 459-6618" ✅ 2026-04-13
- [x] [PLAN-03] Definir estrategia "Opción B" para Cuenta Corriente (CMS + modos + premium por tenant) ✅ 2026-04-13
- [x] [INV-01] Inventario: permitir eliminar órdenes con UX clara (confirmación + feedback) ✅ 2026-04-12
- [x] [INV-02] Inventario: registrar auditoría de eliminación de órdenes (fecha, hora, usuario, N° orden) ✅ 2026-04-12
- [x] [UI-05] Clientes: rediseño compacto/bonito (tabla, filtros, modal, spacing) ✅ 2026-04-12
- [x] [INT-01] Clientes: investigar integración ARCA/AFIP para autocompletar datos por CUIT (Factura A) ✅ 2026-04-12
- [x] [INT-02] Clientes: implementar lookup CUIT y autocompletar campos con fallback manual ✅ 2026-04-12
- [x] [PLAN-02] Revisar y ajustar el plan con feedback del usuario, implementado backup SQL y CMS purga ✅ 2026-04-12
- [x] [REP-02] Reportes: implementar primera versión funcional de exportación PDF por reporte ✅ 2026-04-15

## 🟢 Hecho
- [x] Implementar control de funcionalidades premium desde CMS (fase 1: Agente IA) ✅ 2026-04-12
- [x] Corregir visibilidad del Agente IA en frontend tenant según feature flag ✅ 2026-04-12
- [x] Diagnosticar error 500 de Google callback por migración faltante (`users.password_hash`) ✅ 2026-04-12
- [x] Implementar login real por usuario/contraseña + vínculo con Google por mismo email ✅ 2026-04-12
- [x] [ADMIN-01] CMS: agregar acción de borrado total de datos de tenant (solo superadmin) ✅ 2026-04-12
- [x] [ADMIN-02] CMS: registrar auditoría fuerte de borrado total (quién, cuándo, tenant, motivo) ✅ 2026-04-12

## 🚧 Bloqueado
- [!] [DATA-03] Definir semántica "borrar base de datos completa" 🚧 El sistema es multitenant en una sola DB; no corresponde `DROP DATABASE`, sino purga transaccional por `business_id`.
- [!] [DATA-04] Definir formato final de backup "SQL completo del usuario" 🚧 En entorno compartido no se puede exponer dump global; hay que generar dump lógico por tenant con sanitización y control de permisos.
- [!] [INT-03] Clientes: razón social AFIP por CUIT no confiable en algunos casos 🚧 Constancia (`RegisterInscriptionProof`) devuelve errores regulatorios (F883 / RG 4280) para ciertos CUITs; se decidió no usar fallback para `name` y continuar mañana con estrategia UX (manual + mensaje claro + opcional fallback seguro sin razón social).
