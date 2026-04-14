# TASKS - OctopusTrack

## 🔴 Pendiente
- [ ] [OPS-01] Replicar migraciones pendientes en entorno de deploy (`f1a2b3c4d5e6`, `a9b8c7d6e5f4`)
- [ ] [FB-07] Validar flujo E2E feedback + sync a Linear con API key real (crear ticket tenant y verificar issue)
- [ ] [AUTH-ACL-01] CMS/Sesiones: jerarquía de administración por negocio (admin crea sub-empleados y gestiona permisos granulares por módulo)
- [ ] [CC-01] Cuenta Corriente: crear nueva sección con tabla de clientes y remitos retirados para edición/control previo al cierre
- [ ] [CMS-CC-01] CMS: agregar feature flag de Cuenta Corriente (modo automático / modo manual) por tenant
- [ ] [VOU-02] Ventas: permitir cargar comprobante por código de presupuesto y autocompletar tabla de productos
- [ ] [CC-02] Cuenta Corriente: permitir descuento global al cierre/liquidación de cuenta antes de emitir comprobante final
- [ ] [CMS-CC-02] CMS/UI: mostrar/ocultar ítem de sidebar "Cuenta Corriente" según toggle de feature flag
- [ ] [SALES-CC-01] Ventas: agregar tipo de comprobante/flujo "Cuenta Corriente" con impresión con/sin precios y con/sin descuento
- [ ] [PREM-CC-01] Premium: compilar múltiples presupuestos por código en un comprobante unificado
- [ ] [PREM-CC-02] Premium: bloquear edición de presupuestos origen una vez compilados y marcarlos como "compilados"

## 🟢 Hecho
- [x] [BRAND-02] Rebranding UI: migrar TODO EL SISTEMA a la nueva paleta de colores (botones, tablas, inputs, modales, etc.) garantizando soporte perfecto para versión Light y Dark. ✅ 2026-04-14
- [x] [DATA-01] Productos: definir estrategia de backup SQL por tenant (dump lógico aislado, no export parcial Excel) ✅ 2026-04-12

## 🟢 Hecho
- [x] [DATA-02] Productos: implementar descarga de backup SQL completo del tenant (incluyendo precios, bonificaciones y relaciones) ✅ 2026-04-12

## 🟡 En progreso
- [/] [REP-02] Reportes: implementar primera versión funcional de exportación PDF por reporte

## 🟢 Hecho
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
- [x] [PDF-03] PDFs (cotización/remito/factura): quitar footer con firma comercial "Sistema creado por Qeva AI · Contacto: +54 9 225 459-6618" ✅ 2026-04-13
- [x] [PLAN-03] Definir estrategia "Opción B" para Cuenta Corriente (CMS + modos + premium por tenant) ✅ 2026-04-13
- [x] [INV-01] Inventario: permitir eliminar órdenes con UX clara (confirmación + feedback) ✅ 2026-04-12
- [x] [INV-02] Inventario: registrar auditoría de eliminación de órdenes (fecha, hora, usuario, N° orden) ✅ 2026-04-12
- [x] [UI-05] Clientes: rediseño compacto/bonito (tabla, filtros, modal, spacing) ✅ 2026-04-12
- [x] [INT-01] Clientes: investigar integración ARCA/AFIP para autocompletar datos por CUIT (Factura A) ✅ 2026-04-12
- [x] [INT-02] Clientes: implementar lookup CUIT y autocompletar campos con fallback manual ✅ 2026-04-12
- [x] [PLAN-02] Revisar y ajustar el plan con feedback del usuario, implementado backup SQL y CMS purga ✅ 2026-04-12

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
