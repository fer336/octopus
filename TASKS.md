# TASKS - OctopusTrack

## 🔴 Pendiente
- [ ] [DEVOPS-STAGING-MIGRATIONS-02] Aplicar migraciones Alembic sobre `octopustrack_staging` antes de validar staging
- [ ] [SALES-ACOPIO-26] Remito principal de acopio: definir/implementar renglón sintético auditable en voucher_items o producto sistema para PDF/listado completo
- [ ] [SALES-ACOPIO-15] Remito: mostrar botón "Buscar acopio" en resumen al seleccionar cliente para vincular retiro a acopio abierto
- [ ] [SALES-ACOPIO-16] Backend: endpoint para listar acopios abiertos por cliente con saldo disponible, total retirado y fecha snapshot
- [ ] [SALES-ACOPIO-17] Remito: selector de acopios abiertos y carga de datos congelados del snapshot en vez de precios vigentes
- [ ] [SALES-ACOPIO-18] Remito vinculado a acopio: calcular retiro actual contra saldo disponible y bloquear confirmación si excede saldo
- [ ] [SALES-ACOPIO-19] Persistir relación remito parcial hijo → acopio padre para árbol de comprobantes/acopios
- [ ] [SALES-ACOPIO-20] Resumen Remito+Acopio: mostrar acopio Nº, fecha de acopio, precios válidos al, importe total, retirado, saldo y retiro actual
- [ ] [SALES-ACOPIO-21] PDF Remito parcial de acopio: mostrar leyenda visible "Precios correspondientes al acopio del [fecha]"
- [ ] [SALES-ACOPIO-07] Rediseñar creación de acopio para que siempre nazca desde un remito principal de acopio
- [ ] [SALES-ACOPIO-08] Generar automáticamente remito de acopio al confirmar, con cliente, monto total y datos relevantes
- [ ] [SALES-ACOPIO-09] Persistir snapshot inmutable de precios vigentes al crear acopio para aislarlo de cambios futuros de lista
- [ ] [SALES-ACOPIO-10] Implementar facturación final de acopio al cierre consolidando remitos parciales de retiro
- [ ] [SALES-ACOPIO-11] Implementar facturación anticipada de acopio en un único renglón descriptivo
- [ ] [SALES-ACOPIO-12] Restaurar/agregar sidebar Acopios como panel de consulta con árbol colapsable remito principal → remitos parciales
- [ ] [SALES-ACOPIO-13] Agregar modalidad de caducidad de acopio: con fecha límite de retiro o sin caducidad
- [ ] [SALES-ACOPIO-14] Permitir configurar/editar caducidad desde Ventas al crear o editar un acopio
- [ ] [SALES-RETURNS-INVOICE-ONLY-07] Restringir saldo a favor/devolución excedente exclusivamente al flujo Factura y quitar leyenda contable del PDF
- [ ] [CC-INVOICE-01] Diseñar lógica de comprobantes CC: facturas con budget/circle budget diferente, estado impago, y generar pago desde la factura para cobrar cuenta corriente
- [ ] [CC-PAY-01] Backend: migraciones y modelos para facturación CC con plazos de pago
- [ ] [CC-PAY-02] Backend: endpoint POST /vouchers/{id}/pay para registrar pagos de facturas CC
- [ ] [CC-PAY-03] Frontend Sales: selector de "Factura Cta Cte" con dropdown de días de plazo
- [ ] [CC-PAY-04] Frontend Vouchers: opción "Pagar Cuenta Corriente" para facturas pendientes
- [ ] [CC-PAY-05] PDF Factura: mostrar fecha de vencimiento cuando hay payment_days
- [ ] [CC-PAY-06] Backend: registrar movimiento en caja al pagar factura CC
- [ ] [CMS-SYS-DEPLOY-07] Publicar cambios de CMS y sistema en commit/tag selectivo (sin mezclar landing)
- [ ] [N8N-POSTPURCHASE-08] Diseñar flujo n8n post-compra: HTML de confirmación + otorgar acceso según plan (Excel/Sistema)
- [ ] [SEO-LEGAL-LINKS-05] Agregar enlaces visibles desde landing principal a política de privacidad y política de seguridad
- [ ] [SEO-SITEMAP-04] Agregar URLs de páginas legales al sitemap (`politicas-privacidad.html` y `politicas-seguridad.html`)
- [b] [DEVOPS-LANDING-05] 🐛 Diagnosticar por qué `landing-deploy` queda en 4/6 y no ejecuta deploy
- [ ] [BILLING-N8N-CREATE-WF-12] Crear workflow nuevo n8n para post-pago (webhook + activación backend + email)
- [ ] [BILLING-N8N-WF-FORM-10] Definir si reutilizar `octopus-formulario` o crear webhook nuevo para post-pago y emails transaccionales
- [ ] [LANDING-LOGIN-BTN-ENABLE-06] Revisar y re-habilitar botones "Iniciar sesión" en /acceder (OctopusTrack/OctopusFlow)
- [ ] [LANDING-PLANS-REWORK-05] Actualizar estructura/copy/precios de planes OctopusTrack (Básico/Negocio/Completo/Premium)
- [ ] [LANDING-PRICE-DISCOUNT-04] Landing: mostrar precio actual 5.99 con precio anterior 20.99 tachado (oferta visual)
- [ ] [LANDING-MP-PRICE-SYNC-03] Unificar precio visible y precio enviado a MercadoPago en landing (fuente única)
- [ ] [LANDING-FORM-TRACK-02] Enriquecer webhook de formulario con UTM + entry_point + page_url para atribución de origen
- [ ] [LANDING-FORM-PRICE-01] Landing: cambiar precio de Excel a USD 5.99, mover captura de email a modal al click en CTAs y enviar formulario a webhook `octopus-formulario`
- [ ] [VOUCHER-PDF-500-01] 🐛 Diagnosticar y corregir 500 en `GET /api/tenant/vouchers/{id}/pdf` desde Ventas
- [ ] [DEVOPS-DOCKER-ARM64-05] Diagnosticar cancelación de build multi-arch en GitHub Actions y re-ejecutar deploy
- [ ] [BILLING-MP-04] Implementar endpoint backend único de activación de plan (`POST /billing/mp/activate`) con idempotencia por `payment_id`
- [ ] [BILLING-MP-05] Implementar tabla `payment_events` + `tenant_subscriptions` para auditoría e idempotencia
- [ ] [BILLING-MP-06] Implementar workflow n8n productivo (webhook POST + verify payment + call backend + alertas)
- [ ] [RESP-MOBILE-VOUCHERS-01] Mobile cards Comprobantes: mejorar renderCard para mostrar child rows cuando está expandido el acordión
- [ ] [RESP-MOBILE-VOUCHERS-02] Mobile cards Comprobantes: agregar GSAP animateButton a botones de Products/Clients/Sales
- [ ] [CMS-RESP-TABLE-02] Conectar acción real de edición de usuario/tenant (hoy botón editar queda como placeholder UX)
- [ ] [SEO-TECH-05] Habilitar compresión Brotli/Gzip en Nginx para HTML/CSS/JS (actualmente respuestas sin `content-encoding`)
- [ ] [SEO-TECH-06] Reducir peso de branding images (`favicon.ico` y `logo-tenculo-final.png` ~320KB) y generar variantes optimizadas
- [ ] [SEO-ONPAGE-07] Ajustar Schema.org: revisar `AggregateRating` (evitar rich snippets inválidos si no hay evidencia pública verificable)
- [ ] [SEO-ONPAGE-08] Definir estrategia de indexación para `/acceder` (noindex/follow o canonical específico) para evitar canibalización con landing principal
- [ ] [SEO-CONTENT-09] Crear 3 landings SEO por intención (`cotizador ferretería`, `cotizador sanitarios`, `software corralón`) con títulos/H1/meta específicos
- [ ] [MKT-LANDING-MOTION-01] Landing/UI: incorporar animaciones de entrada, scroll reveal, hover interactivo y transición en /acceder
- [x] [SEO-SITEMAP-01] Landing: crear sitemap.xml para octopustrack.shop con URLs canonicales y priority correctos ✅ 2026-04-27
- [x] [SEO-SITEMAP-02] Landing: actualizar robots.txt para referenciar sitemap.xml ✅ 2026-04-27
- [x] [SEO-SITEMAP-03] Landing: agregar meta tags SEO (description, og:*) en landing.html para indexación ✅ 2026-04-27
- [ ] [BRAND-HEADER-01] Branding/PDF: definir para qué sirve `header_text` y hacerlo visible realmente en los comprobantes o pantallas donde corresponda
- [x] [IVA-DUPLICADO-01] 🐛 Facturación: corregir duplicación de IVA al seleccionar método de pago — el código calculaba IVA 2 veces porque sale_price ya incluye IVA pero se recalculaba ✅ 2026-04-27
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
- [/] [PRICEUPDATE-MOBILE-EDIT-PARITY-08] Diseñar adaptación mobile de la lógica de edición de precios sin navegación por Enter
- [/] [SALES-RETURNS-INVOICE-ONLY-07] Restringir saldo a favor/devolución excedente exclusivamente al flujo Factura y quitar leyenda contable del PDF
- [/] [DEVOPS-DEPLOY-SELECTIVE-15] Implementar deploys independientes: system-v* (backend+frontend), cms-v* (solo CMS), landing-v* (solo landing)
- [/] [CMS-LOCALHOST-CONN-06] 🐛 Diagnosticar por qué CMS no conecta en localhost (error de conexión)
- [/] [N8N-POSTPURCHASE-08] Diseñar flujo n8n post-compra: HTML de confirmación + otorgar acceso según plan (Excel/Sistema)
- [/] [DEVOPS-LANDING-05] 🐛 Diagnosticar por qué `landing-deploy` queda en 4/6 y no ejecuta deploy
- [/] [BILLING-N8N-WF-FORM-10] Definir si reutilizar `octopus-formulario` o crear webhook nuevo para post-pago y emails transaccionales
- [/] [VOUCHER-PDF-500-01] 🐛 Diagnosticar y corregir 500 en `GET /api/tenant/vouchers/{id}/pdf` desde Ventas
- [/] [DEVOPS-DOCKER-ARM64-05] Diagnosticar cancelación de build multi-arch en GitHub Actions y re-ejecutar deploy
- [/] [BILLING-MP-07] Configurar firma/HMAC y allowlist IP (si aplica) para endurecer webhook MP→n8n
- [/] [RESP-MOBILE-INV-DETAIL-02] Ajustar jerarquía visual en modal Orden de Pedido (títulos/ícono cierre/botones footer)
- [/] [RESP-MOBILE-PRICEUPDATE-01] Reemplazar tabla de "Actualizar Productos" por cards en mobile manteniendo desktop intacto
- [/] [RESP-MOBILE-SALES-STEPPER-08] Optimizar modal de productos a 90-95vh sin espacios muertos y con contraste explícito de iconos/acciones
- [/] [RESP-MOBILE-SALES-STEPPER-07] Mejorar UX visual de modal "Configurar productos" + edición qty/desc unitario en resumen mobile
- [/] [RESP-MOBILE-SALES-STEPPER-06] Ajustar Sales mobile para cumplir 1:1 con referencia visual (Paso 1/2/3 exactos)
- [/] [RESP-MOBILE-SALES-STEPPER-05] Implementar stepper mobile en Sales basado en referencia HTML (solo `<lg>`, desktop intacto)
- [/] [RESP-MOBILE-QA-03] Ejecutar Fase 3 QA responsive (375/390/768/1024) y corregir regresiones visuales
- [/] [DEVOPS-LANDING-04] Pipeline landing: probar build solo amd64 para evitar falla QEMU arm64 y validar deploy




## 🟢 Hecho

- [x] [DEVOPS-STAGING-CI-07] Corregir CI staging por conflicto Ruff UP035 vs mypy usando anotaciones diferidas ✅ 2026-05-08
- [x] [DEVOPS-STAGING-TAG-06] Cambiar stack staging para usar imagen `staging` por defecto desde YAML ✅ 2026-05-08
- [x] [DEVOPS-STAGING-WORKFLOW-05] Crear workflow `develop` → imagen `staging` → webhook Portainer staging ✅ 2026-05-08
- [x] [DEVOPS-ALEMBIC-GRAPH-01] 🐛 Corregir grafo Alembic para DB fresca: dependencia de `tenant_memberships` y duplicado `related_voucher_id` ✅ 2026-05-08
- [x] [DEVOPS-STAGING-STACK-04] Crear stack YAML aislado para `staging.octopustrack.shop` basado en `stack.system.yml` ✅ 2026-05-08
- [x] [DEVOPS-STAGING-BRANCH-03] Crear rama `develop` desde `origin/master` para deploy automático a staging ✅ 2026-05-08
- [x] [DEVOPS-STAGING-DB-01] Crear base de datos `octopustrack_staging` y usuario PostgreSQL aislado `octopus_staging_user` para staging ✅ 2026-05-08
- [x] [DEVOPS-RELEASE-TAG-09] Crear tag productivo `1.9.1` para deploy de cambios de acopio vía Portainer ✅ 2026-05-08
- [x] [SALES-ACOPIO-28] Implementar reglas avanzadas de acopio: anulación sin hijos, reimpresión hijos, numeración/descripción y devoluciones controladas ✅ 2026-05-07
- [x] [SALES-ACOPIO-27] Implementar flujo end-to-end de remito hijo de acopio: persistencia, saldo, PDF especial y árbol sidebar ✅ 2026-05-07
- [x] [SALES-ACOPIO-25] 🐛 Corregir pantalla en blanco al buscar acopios desde Remito por mismatch `{items,total}` vs array ✅ 2026-05-07
- [x] [SALES-ACOPIO-24] 🐛 Crear remito principal confirmado al generar acopio y vincularlo con `principal_voucher_id` ✅ 2026-05-07
- [x] [SALES-ACOPIO-23] 🐛 Corregir crash al crear acopio por serializer sin campos v2 obligatorios ✅ 2026-05-07
- [x] [SALES-ACOPIO-22] 🐛 Corregir crash Pydantic `StockpileOpenResponse` por annotation `date_type` no definida ✅ 2026-05-07
- [x] [SALES-ACOPIO-FOUNDATION-01] Implementar DB/models/schemas foundation: expiration_mode, due_date, principal_voucher_id en stockpiles; stockpile_id en vouchers; Alembic migration ✅ 2026-05-07
- [x] [SALES-ACOPIO-01] Implementar Fase 1 de Acopio integrado en Ventas: creación por importe, descuento y emisión desde pestaña Acopio ✅ 2026-05-07
- [x] [SALES-ACOPIO-02] Acopio en Ventas: ítem sintético editable con código/descripción, precio editable, y opción explícita "Generar factura Sí/No" con aviso de Fase 2 pendiente para emisión real ✅ 2026-05-07
- [x] [SALES-ACOPIO-03] 🐛 Corregir vista desktop de Acopio para mostrar renglón sintético editable en productos seleccionados ✅ 2026-05-07
- [x] [SALES-ACOPIO-04] 🐛 Conectar botón Generar Acopio al flujo real de creación sin validar items del carrito común ✅ 2026-05-07
- [x] [SALES-ACOPIO-05] 🐛 Corregir 404 al crear acopio registrando router `/api/tenant/stockpiles` en FastAPI ✅ 2026-05-07
- [x] [SALES-ACOPIO-06] 🐛 Corregir 500/Network error al crear acopio validando cliente y evitando lazy-load async en serializer ✅ 2026-05-07
- [x] [SALES-ACOPIO-BACKEND-02] Implementar endpoints backend para buscar acopios abiertos por cliente y validar retiro desde Remito ✅ 2026-05-07
- [x] [SALES-ACOPIO-DESIGN-01] Diseñar arquitectura técnica para acopio vía remito principal, retiros parciales, snapshot, facturación y árbol ✅ 2026-05-07
- [x] [SALES-ACOPIO-FRONTEND-03] Remito UI: botón Buscar acopio, selector de acopios abiertos con saldo, resumen lateral y bloqueo por saldo disponible ✅ 2026-05-07
- [x] [PRODUCTS-BULK-DELETE-MULTIBUSINESS-01] 🐛 Corregir eliminación masiva de productos cuando el usuario tiene múltiples negocios ✅ 2026-05-06
- [x] [PRICEUPDATE-ACTIONBAR-HEIGHT-20] Corregir altura y alineación uniforme de barra de acciones en Paso 1 ✅ 2026-05-06
- [x] [PRICEUPDATE-EXCEL-MASS-19] Agregar actualización masiva de precios por Excel con mapeo flexible, confirmación y progreso violeta ✅ 2026-05-06
- [x] [PRICEUPDATE-DRAFT-EXPLICIT-SAVE-18] Cambiar borradores de actualización de precios a guardado explícito por usuario ✅ 2026-05-06
- [x] [PRICEUPDATE-PRD-STATE-ARCH-17] Documentar en PRD la arquitectura de estado del modal de actualización de precios ✅ 2026-05-06
- [x] [PRICEUPDATE-DRAFT-SAVE-LOOP-16] 🐛 Cortar bucle de autosave y evitar reversión de cambios al aplicar en Editar Productos ✅ 2026-05-06
- [x] [PRICEUPDATE-DRAFT-VALUES-15] 🐛 Mantener productos editados del borrador al cerrar y reabrir Editar Productos ✅ 2026-05-06
- [x] [PRICEUPDATE-DRAFT-PENDING-STATE-14] Persistir indicadores P pendientes dentro de borradores de actualización masiva ✅ 2026-05-06
- [x] [PRICEUPDATE-SHIFT-BACK-NAV-13] Agregar navegación hacia atrás con Shift en Editar Productos ✅ 2026-05-06
- [x] [PRICEUPDATE-DRAFT-AUTOSAVE-404-12] 🐛 Recuperar autosave de borrador cuando el draft id previo ya no existe ✅ 2026-05-06
- [x] [PRICEUPDATE-DRAFTS-DELETE-MODAL-11] Reemplazar confirm nativo de eliminar borradores por modal violeta del sistema ✅ 2026-05-06
- [x] [PRICEUPDATE-DRAFTS-DELETE-ALL-10] Agregar eliminación masiva de borradores con botón violeta del sistema ✅ 2026-05-06
- [x] [PRICEUPDATE-NUMERIC-EMPTY-09] 🐛 Permitir borrar campos numéricos en Editar Productos sin que vuelvan automáticamente a 0 ✅ 2026-05-06
- [x] [PRICEUPDATE-PROGRESS-VIOLET-07] Corregir modal de progreso para usar paleta violeta real del sistema ✅ 2026-05-06
- [x] [PRICEUPDATE-PROGRESS-PALETTE-06] Ajustar modal de progreso a paleta corporativa azul del PRD ✅ 2026-05-06
- [x] [PRICEUPDATE-BATCH-DRAFT-PROGRESS-05] Actualización diferida por borrador, círculo P pendiente y modal de progreso 0-100% al guardar cambios ✅ 2026-05-06
- [x] [PRICEUPDATE-MAIN-READONLY-04] Panel principal Actualización de precios: quitar edición inline y dejar productos solo lectura ✅ 2026-05-06
- [x] [PRICEUPDATE-422-03] 🐛 Corregir 422 al guardar fila individual de productos desde ventana Editar ✅ 2026-05-06
- [x] [AUTH-ENUM-500-01] 🐛 Corregir 500 por enum PostgreSQL inexistente `authorizationstatus` en autorizaciones pendientes ✅ 2026-05-06
- [x] [PRICEUPDATE-MODAL-ENTER-02] Ventana Editar Productos: navegación Enter, guardado individual por fila y badge circular verde ✅ 2026-05-06
- [x] [PRICEUPDATE-INDIVIDUAL-01] Panel Actualización de precios: edición individual por fila con navegación Enter, guardado por producto y badge circular verde ✅ 2026-05-06

- [x] [SALES-RETURNS-RECEIPT-06] Caja diaria: mantener devoluciones como actividad no monetaria sin impactar efectivo esperado ✅ 2026-05-04
- [x] [SALES-RETURNS-RECEIPT-05] Frontend Comprobantes/Cuenta Corriente: identificar y reimprimir remitos de devolución ✅ 2026-05-04
- [x] [SALES-RETURNS-RECEIPT-04] Backend: generar remito de devolución reimprimible cuando la devolución excedente queda como saldo a favor ✅ 2026-05-04

- [x] [SALES-RETURNS-CREDIT-03] Frontend: mostrar confirmación/aviso para guardar saldo a favor cuando la devolución supere la venta ✅ 2026-05-04
- [x] [SALES-RETURNS-CREDIT-02] Backend: registrar saldo a favor por devolución excedente en cuenta corriente con movimiento auditado ✅ 2026-05-04
- [x] [SALES-RETURNS-CREDIT-01] Ventas: permitir devoluciones con cantidad negativa, factura siempre positiva y excedente como saldo a favor del cliente ✅ 2026-05-04

- [x] [SALES-RETURNS-NEGATIVE-QTY-01] Analizar soporte de cantidades negativas en Ventas para devoluciones con impacto inverso en stock y totales ✅ 2026-05-04

- [x] [CI-VOUCHERS-CURRENT-USER-01] 🐛 Corregir fallo CI Ruff F821 por `current_user` indefinido en `pending-quotations` ✅ 2026-05-04

- [x] [CMS-USER-CC-PERMISSION-06] Bloquear Cuenta Corriente por permiso de empleado además del plan del tenant ✅ 2026-05-04

- [x] [CMS-PLAN-GUARDS-05] Auditar y reforzar validaciones backend/frontend para que los flags del CMS no puedan saltearse por plan ✅ 2026-05-04

- [x] [VOUCHERS-ACTIONS-OFFSET-05] Comprobantes: desplazar 1px a la izquierda la fila de acciones ✅ 2026-05-04

- [x] [VOUCHERS-FILTERS-CALENDAR-ICON-04] Comprobantes: centrar iconos de calendario en filtros compactos ✅ 2026-05-04

- [x] [VOUCHERS-FILTERS-CALENDAR-COMPACT-03] Comprobantes: compactar calendarios y evitar corte del botón limpiar ✅ 2026-05-04

- [x] [CMS-CC-GATE-04] Bloquear generación/visibilidad de Cuenta Corriente según flag del CMS y corregir UI de calendarios en filtros ✅ 2026-05-04

- [x] [VOUCHERS-FILTERS-DESIGN-02] Comprobantes: mejorar diseño visual del panel de filtros CC/fechas ✅ 2026-05-04

- [x] [VOUCHERS-FILTERS-CC-DATE-01] Comprobantes: agregar filtro de Cuenta Corriente y rango de fechas con calendario ✅ 2026-05-04

- [x] [CC-INVOICE-VOUCHER-PAY-UI-01] Comprobantes/Sales: badges de factura en cuenta corriente con vencimiento y acción para registrar pago/remito de pago ✅ 2026-05-04

- [x] [SALES-INVOICE-MODAL-COMPACT-01] Compactar modal de emisión de factura electrónica para reducir scroll vertical ✅ 2026-05-04

- [x] [DEVOPS-ROOT-CLEANUP-14] Limpiar raíz del repo moviendo/eliminando YML sueltos a ubicación correcta ✅ 2026-05-02

- [x] [DEVOPS-CICD-REFactor-13] Integrar nuevo workflow CI y refactorizar CI/CD (`ci.yml`, `release.yml`, `stack.yml`, `ruff.toml`, `SETUP_NOTES.py`) ✅ 2026-05-02

- [x] [DEVOPS-ROLLBACK-LATEST-12] Revertir compose prod a `latest` por incidente de carga en servidor ✅ 2026-05-02

- [x] [DEVOPS-IMAGE-TAGS-11] Reemplazar `latest` por tags versionados en `docker-compose-prod.yml` para deploy determinístico ✅ 2026-05-02

- [x] [DEVOPS-RELEASE-RETRY-10] Crear nuevo tag de release para re-disparar deploy productivo vía Portainer ✅ 2026-05-02

- [x] [DEVOPS-RELEASE-TAG-09] Crear tag de release (`vX.Y.Z`) para ejecutar jobs de `Create GitHub Release` + `Deploy to Swarm via Portainer` ✅ 2026-05-02

- [x] [DEVOPS-GHA-RETRY-08] Re-ejecutar workflow `landing-deploy` en GitHub Actions y validar que build pase tras fix de tipos ✅ 2026-05-02

- [x] [DEVOPS-BUILD-TS-07] 🐛 Corregir fallo de build TypeScript en `src/admin/pages/TenantDetail.tsx` por propiedades faltantes en `TenantFeaturesUpdate` ✅ 2026-05-02

- [x] [CMS-SYS-DEPLOY-07] Publicar cambios de CMS y sistema en commit/tag selectivo (sin mezclar landing) ✅ 2026-05-02

- [x] [SEO-LEGAL-LINKS-05] Agregar enlaces visibles desde landing principal a política de privacidad y política de seguridad ✅ 2026-05-02

- [x] [SEO-SITEMAP-04] Agregar URLs de páginas legales al sitemap (`politicas-privacidad.html` y `politicas-seguridad.html`) ✅ 2026-05-02

- [x] [LANDING-LEGAL-PAGES-13] Diseñar y crear `politicas-privacidad.html` y `politicas-seguridad.html` para la landing ✅ 2026-05-02

- [x] [DEVOPS-MCP-N8N-12] Verificar capacidad MCP n8n para crear/editar workflows: creación y edición confirmadas sobre flujo nuevo `NxUzDAwBIWoEE5QW` ✅ 2026-05-02

- [x] [DEVOPS-MCP-N8N-11] Configurar `n8n-mcp` remoto en `~/.config/opencode/opencode.json` usando variable de entorno en vez de API key hardcodeada ✅ 2026-05-02

- [x] [BILLING-BE-ACTIVATE-09] Backend: exponer endpoint seguro `POST /api/billing/mp/activate` para activación automática por plan ✅ 2026-05-01

- [x] [CMS-TENANT-FEATURES-04] Revisar y corregir feature flags por plan en tenant (Cta Cte/Remitos/Cotizaciones/Inventario/Backup SQL/ARCA crt-key) ✅ 2026-05-01

- [x] [LANDING-LOGIN-BTN-ENABLE-06] Revisar y re-habilitar botones "Iniciar sesión" en /acceder (OctopusTrack/OctopusFlow) ✅ 2026-05-01

- [x] [LANDING-PLANS-REWORK-05] Actualizar estructura/copy/precios de planes OctopusTrack (Básico/Negocio/Completo/Premium) ✅ 2026-05-01

- [x] [LANDING-PRICE-DISCOUNT-04] Landing: mostrar precio actual 5.99 con precio anterior 20.99 tachado (oferta visual) ✅ 2026-05-01

- [x] [LANDING-MP-PRICE-SYNC-03] Unificar precio visible y precio enviado a MercadoPago en landing (fuente única) ✅ 2026-05-01

- [x] [LANDING-FORM-TRACK-02] Enriquecer webhook de formulario con UTM + entry_point + page_url para atribución de origen ✅ 2026-05-01

- [x] [LANDING-FORM-PRICE-01] Landing: cambiar precio de Excel a USD 5.99, mover captura de email a modal al click en CTAs y enviar formulario a webhook `octopus-formulario` ✅ 2026-05-01

- [x] [BILLING-MP-03] Definir arquitectura robusta MercadoPago→n8n→FastAPI (webhook, idempotencia, seguridad, retries) ✅ 2026-05-01

- [x] [SALES-MOBILE-RECEIPT-PRICE-01] Mobile Ventas: agregar toggle de Remito con/sin precio (paridad con desktop) ✅ 2026-05-01
- [x] [SALES-TOAST-UX-02] Quitar toast de “producto quitado” en selección temporal de Ventas ✅ 2026-05-01
- [x] [SALES-TOAST-UX-01] Quitar toast de confirmación al agregar productos en Ventas (evitar ruido visual) ✅ 2026-05-01
- [x] [SALES-TOTAL-ROUND-02] Usar total calculado por backend como fuente de verdad antes de emitir factura para evitar cualquier deriva de redondeo frontend/backend ✅ 2026-05-01
- [x] [SALES-TOTAL-ROUND-01] 🐛 Corregir discrepancia entre total visual de Ventas y total validado al emitir factura (alinear redondeo frontend con backend por renglón + IVA) ✅ 2026-05-01

- [x] [RESP-MOBILE-SALES-STEPPER-14] Permitir borrar manualmente cantidad/% sin autocompletar a 0 en inputs mobile ✅ 2026-05-01
- [x] [RESP-MOBILE-SALES-STEPPER-13] Ocultar flechas nativas de inputs number en steppers mobile y alinear verticalmente subtotal con Cant./Desc% ✅ 2026-05-01
- [x] [RESP-MOBILE-SALES-STEPPER-12] Alinear simétricamente botones +/- con input en steppers mobile y centrar valor de subtotal ✅ 2026-05-01
- [x] [RESP-MOBILE-SALES-STEPPER-11] Integrar steppers verticales dentro del card mobile sin desborde visual ✅ 2026-05-01
- [x] [RESP-MOBILE-SALES-STEPPER-10] Rediseñar steppers mobile de Cant./Desc% a layout vertical (+ arriba, valor centro, - abajo) para mejorar legibilidad ✅ 2026-05-01
- [x] [RESP-MOBILE-VOUCHERS-NAV-05] Corregir navegación mobile en comprobantes para abrir cotización/remito relacionado sin redirigir al dashboard ✅ 2026-05-01
- [x] [RESP-MOBILE-VOUCHERS-ACTIONS-03] Ajustar acciones del visor PDF en mobile (Descargar/Imprimir/Cerrar) para que entren en una sola fila priorizando íconos ✅ 2026-05-01
- [x] [RESP-MOBILE-PRODUCT-CONFIG-04] Restaurar flechas de steppers en mobile para cantidad/% y forzar incremento de porcentaje en pasos de 1.0 ✅ 2026-05-01

- [x] [RESP-MOBILE-FEEDBACK-01] Reemplazar tabla de "Mis reportes" por cards en mobile manteniendo desktop intacto ✅ 2026-04-29
- [x] [RESP-MOBILE-SUPPLIERS-01] Reemplazar tabla de Proveedores por cards en mobile manteniendo desktop intacto ✅ 2026-04-29
- [x] [RESP-MOBILE-CATEGORIES-01] Reemplazar tabla de Categorías por cards en mobile manteniendo desktop intacto ✅ 2026-04-29
- [x] [RESP-MOBILE-CLIENTS-01] Reemplazar tabla de Clientes por cards en mobile manteniendo desktop intacto ✅ 2026-04-29
- [x] [RESP-MOBILE-INV-DETAIL-01] Ajustar modal "Orden de Pedido" en mobile (items/totales/footer sin overflow) ✅ 2026-04-29

- [x] [RESP-MOBILE-PRICEUPDATE-01] Reemplazar tabla de "Actualizar Productos" por cards en mobile manteniendo desktop intacto ✅ 2026-04-29

- [x] [RESP-MOBILE-PRODUCTS-02] Ajustar sección "Configuración de Precios" en modal de Productos para mobile (grid responsive + desglose apilado) ✅ 2026-04-29

- [x] [RESP-MOBILE-PRODUCTS-01] Reemplazar tabla de Productos por cards en mobile con badges y acciones, manteniendo desktop intacto ✅ 2026-04-29

- [x] [RESP-MOBILE-SALES-STEPPER-09] Corregir barra inferior mobile en Sales: overflow horizontal, duplicados de Atrás y tamaños de acciones por paso ✅ 2026-04-29

- [x] [PAYMENT-MOBILE-KPI-02] Compactar KPIs de Métodos de Pago mobile en una sola fila de tres columnas ✅ 2026-04-29

- [x] [PAYMENT-MOBILE-CARDS-01] Rediseñar Métodos de Pago en mobile como cards manteniendo tabla desktop intacta ✅ 2026-04-29

- [x] [CASH-UX-01] Ajustar vista Caja: quitar título redundante y centrar columna PDF en historial ✅ 2026-04-29

- [x] [RESP-DENSITY-WINDOWS-01] Compactar spacing desktop en Comprobantes, Métodos de pago, Caja y Cuentas Corrientes manteniendo mínima luz entre componentes ✅ 2026-04-29

- [x] [RESP-MOBILE-SALES-DESKTOP-10] Ajustar densidad desktop de Sales para ocupar espacios blancos con mínima separación entre componentes ✅ 2026-04-29

- [x] [RESP-MOBILE-SALES-DESKTOP-09] 🐛 Restaurar paleta/fondo desktop del modal de productos afectado por ajustes mobile ✅ 2026-04-29

- [x] [RESP-MOBILE-SALES-HTML-04] Revisar referencia `ventas_mobile_stepper.html` y mapearla a implementación en `Sales.tsx` ✅ 2026-04-29

- [x] [CMS-RESP-TABLE-03] Aplicar patrón ResponsiveTable + cards mobile en Feedback de usuarios ✅ 2026-04-29

- [x] [CMS-RESP-TABLE-01] Implementar patrón ResponsiveTable con renderCard para vistas mobile de Usuarios/Tenants en admin ✅ 2026-04-29

- [x] [RESP-MOBILE-IMPL-02] Ejecutar Fase 2 mobile en pantallas críticas (Sales + TenantList/TenantDetail) ✅ 2026-04-29

- [x] [RESP-MOBILE-IMPL-01] Ejecutar Fase 1 (shell responsive global: MainLayout/Sidebar/Header en tenant + admin) ✅ 2026-04-29

- [x] [RESP-MOBILE-PROP-01] Redactar propuesta técnica formal (alcance/fases/risgos) para responsividad mobile de CMS + Octopus ✅ 2026-04-29

- [x] [RESP-MOBILE-PLAN-01] Definir plan integral de responsividad mobile para Octopus (tenant) y CMS (admin) ✅ 2026-04-29

- [x] [MKT-DEPLOY-LOGIN-URL-01] Deploy landing a producción y verificación de bundle en `/acceder` para login de OctopusFlow en `login-flow.octopustrack.shop` ✅ 2026-04-29

- [x] [MKT-LOGIN-ENV-VALIDATION-01] Landing acceso: validar en runtime env de URLs de login y deshabilitar CTA si faltan ✅ 2026-04-29

- [x] [MKT-CONFIG-URL-01] Landing acceso: mover URLs de login a variables de entorno (sin hardcode) ✅ 2026-04-29

- [x] [MKT-LOGIN-URL-01] Landing acceso: cambiar URL de login de Presupuestos a `login-flow.octopustrack.shop` ✅ 2026-04-29

- [x] [MKT-OG-WHATSAPP-01] Ajustar preview de compartido (OG/Twitter) para mostrar solo "OctopusTrack-ERP -- Sistema Integral" ✅ 2026-04-28

- [x] [MKT-ANCHOR-VER-SISTEMA-01] Landing: bajar un poco más el anclaje del botón "Ver sistema completo" para alinear inicio visual de sección ✅ 2026-04-28

- [x] [SEO-INDEX-13] SEO: excluir rutas de acceso (`/acceder`, `admin`, `tenant`) de indexación y actualizar `sitemap.xml`/`robots.txt` para reindexado limpio ✅ 2026-04-28

- [x] [SEO-ARCH-12] Definir mapa SEO de indexación (rutas indexables/noindex/canonical) para separar adquisición vs acceso ✅ 2026-04-28

- [x] [SEO-ASSETS-11] Actualizar referencias en `landing.html`, `index.html`, `admin.html`, `tenant.html`, `manifest.json` y componentes React a nuevas rutas en `/images/*` ✅ 2026-04-28
- [x] [SEO-ASSETS-10] 🐛 Estructura nueva de imágenes normalizada (`images/og` + `logo-header@2x.png`) y referenciada correctamente ✅ 2026-04-28

- [x] [SEO-ASSETS-12] Verificar estructura final de imágenes SEO (`favicon`, `logos`, `og`) y detectar referencias legacy activas ✅ 2026-04-28

- [x] [SEO-AUDIT-04] Ejecutar auditoría SEO completa de octopustrack.shop (indexación, on-page, técnico, contenido y quick wins) ✅ 2026-04-28

- [x] [SKILL-SEO-01] Instalar skill `mysticaltech/marketingskills` para habilitar auditoría SEO ✅ 2026-04-28

- [x] [MKT-CARD-LABEL-02] Landing: aumentar tamaño de "OctopusTool" en card slider (+5/+6px) ✅ 2026-04-28

- [x] [MKT-CARD-LABEL-01] Landing: agregar texto centrado "OctopusTool" dentro del card del slider ✅ 2026-04-28

- [x] [MKT-COPY-EMPHASIS-02] Landing: aumentar 2px extra y pasar "OctopusTrack" a blanco ✅ 2026-04-28

- [x] [MKT-COPY-EMPHASIS-01] Landing: destacar "OctopusTrack" en copy de migración (+2px y negrita) ✅ 2026-04-28

- [x] [MKT-LOGO-SIZE-01] Landing/UI: aumentar apenas tamaño del logo tentáculo animado ✅ 2026-04-28

- [x] [MKT-LOGO-MOTION-04] Landing/UI: dejar logo solo flotante, sin enrosque/desenrosque ✅ 2026-04-28

- [x] [MKT-LOGO-MOTION-03] Landing/UI: revertir tentáculo a animación anterior y aumentar tamaño +2px ✅ 2026-04-28

- [x] [MKT-LOGO-MOTION-02] Landing/UI: intensificar animación GSAP del tentáculo (enrosque/desenrosque más orgánico) ✅ 2026-04-28

- [x] [MKT-LOGO-MOTION-01] Landing/UI: animar tentáculo SVG con GSAP (enrollar/desenrollar + movimiento suave) usando `logo-tenculo-final.svg` ✅ 2026-04-28

- [x] [MKT-LOGIN-BTN-05] Landing header: igualar estilo de "Iniciar sesión" al botón "Cotizá con Excel" ✅ 2026-04-28

- [x] [MKT-LOGIN-BTN-04] Landing header: quitar halo/borde blanco residual del botón "Iniciar sesión" ✅ 2026-04-28

- [x] [MKT-LOGIN-BTN-03] Landing header: refinar botón "Iniciar sesión" a estilo sobrio monocromático violeta ✅ 2026-04-28

- [x] [MKT-LOGIN-BTN-02] Landing header: aplicar estilo morado con gradiente luminoso tenue al botón "Iniciar sesión" ✅ 2026-04-28

- [x] [MKT-LANDING-PRICEFX-01] Landing: modernizar card de precio (glass/gradient) y animar valor USD con efecto numérico progresivo al entrar en viewport ✅ 2026-04-28

- [x] [MKT-LANDING-CARD-CTA-01] Landing: achicar/centrar tipografía en card de precio Excel y simplificar CTA de contacto a botón flotante único (sin modal) ✅ 2026-04-28

- [x] [MKT-TYPO-02] Landing/UI: actualizar tipografía global a `Ubuntu, Segoe UI, sans-serif` por preferencia de marca ✅ 2026-04-28

- [x] [MKT-TYPO-01] Landing/UI: cambiar tipografía global a stack estilo macOS (`-apple-system`) para look más nativo ✅ 2026-04-28

- [x] [MKT-LANDING-MOTION-02-BUG] 🐛 Landing: corregir pantalla en blanco por íconos `Shield/Users` usados en Footer pero no importados tras refactor de hero ✅ 2026-04-28

- [x] [MKT-LANDING-MOTION-01] Landing/UI: incorporar animaciones de entrada, scroll reveal, hover interactivo y transición en /acceder ✅ 2026-04-28

- [x] [MKT-LANDING-TRUST-01] Landing: quitar claims de social proof "Garantía de por vida" y "+500 negocios" del hero ✅ 2026-04-28

- [x] [MKT-LOGIN-SELECT-06] Landing acceso: simplificar CTA de retorno del header a botón ícono flecha sin texto ✅ 2026-04-28

- [x] [MKT-LOGIN-SELECT-05] Landing acceso: agregar header con navegación de regreso a la web principal ✅ 2026-04-28

- [x] [MKT-LOGIN-SELECT-04] Landing acceso: aplicar botón azul en card de OctopusFlow para consistencia de marca ✅ 2026-04-28

- [x] [MKT-LOGIN-BTN-01] Landing header: corregir estilo del botón "Iniciar sesión" para evitar fondo blanco y mejorar contraste en dark ✅ 2026-04-28

- [x] [MKT-LOGIN-SELECT-03] Landing acceso: agrandar contenedor visual de cards para mejorar proporción de imágenes ✅ 2026-04-28

- [x] [MKT-LOGIN-SELECT-02] Landing acceso: ajustar tamaño/encuadre de imágenes en cards de selección para que se vean completas ✅ 2026-04-28

- [x] [MKT-LOGIN-SELECT-01] Landing: crear página de selección de producto (OctopusTrack/OctopusFlow) y redirigir botón "Iniciar Sesión" a esa ruta ✅ 2026-04-28

- [x] [UI-LISTAS-01] Rediseñar vistas Clientes/Proveedores/Categorías con estilo compacto moderno y mejor aprovechamiento vertical ✅ 2026-04-28

- [x] [GLOBAL-LAYOUT-02] Reducir padding global del contenedor de vistas sin tocar Sales ni romper scroll ✅ 2026-04-28

- [x] [SALES-LAYOUT-02] Ventas: expandir área izquierda al ancho/alto disponible y reducir espacios sobrantes ✅ 2026-04-28

- [x] [SALES-LAYOUT-01] Ventas: contener pantalla en viewport sin scroll de página, con scroll interno en tablas y resumen fijo ✅ 2026-04-28

- [x] [ARCA-CLEAN-02] Remover referencias activas restantes a proveedor legado de facturación en CMS/API/docs fuente ✅ 2026-04-28

- [x] [CMS-TENANT-USER-05] CMS Tenant Detail: permitir quitar/desasignar usuarios de un comercio y evaluar eliminación segura ✅ 2026-04-28

- [x] [CMS-LOGIN-01] Admin Login: unificar branding, íconos y paleta con login tenant ✅ 2026-04-28

- [x] [CMS-TENANT-BILLING-02] 🐛 Auth: quitar bloqueo legacy por estado de membresía para que el acceso dependa del comercio ✅ 2026-04-28

- [x] [CMS-TENANT-BILLING-01] CMS Tenants: mover vencimiento/bloqueo mensual de usuario a comercio con días restantes y renovación 30 días ✅ 2026-04-28

- [x] [CMS-TENANT-USER-04] CMS Tenant Detail: reemplazar input de asignar usuario por combobox con lupita y búsqueda de correos existentes ✅ 2026-04-28

- [x] [CMS-TENANT-USER-03] CMS Tenants: reemplazar texto de owner por combobox con lupita para buscar correos existentes ✅ 2026-04-28

- [x] [CMS-TENANT-USER-02] CMS Tenants: agregar buscador de owner inicial, asignación owner segura y eliminación manual de comercios vacíos/automáticos ✅ 2026-04-28

- [x] [CMS-TENANT-USER-01] CMS/Auth: evitar creación automática de comercios al registrar usuarios; permitir crear comercio manualmente desde Tenant y asignar usuarios ✅ 2026-04-28

- [x] [MKT-WHATSAPP-HARDCODE-01] Landing: hardcodear WhatsApp comercial en código y remover override del pipeline de deploy ✅ 2026-04-24

- [x] [MKT-WHATSAPP-CTA-01] Landing: configurar botón "Probar sistema" con WhatsApp real y mensaje directo ✅ 2026-04-24

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

- [x] [ARCA-CLEAN-01] Remover referencias activas a proveedor legado del CMS y documentación para dejar AFIP SDK como integración vigente ✅ 2026-04-22

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
- [!] [VOUCHER-PDF-500-01-QA] Verificar fix de PDF 500 con test automatizado local 🚧 Entorno local sin `pytest` disponible (`python3 -m pytest` -> No module named pytest)
- [!] [BILLING-N8N-CREATE-WF-12] Crear workflow nuevo n8n por MCP 🚧 Conexión actual expone lectura/detalle pero falla en operaciones de listado/gestión (schema mismatch -32602)
- [!] [BILLING-N8N-EMAIL-ACTIVATION-08] Edición directa de nodos n8n desde MCP no disponible 🚧 Se dejó especificación completa en `docs/n8n-payment-approved-email-and-activation.md` para aplicar en UI n8n

- [x] [MKT-LOTTIE-01] Landing: falta asset `tentaculo.json` (Lottie) o fuente final de animación; se cambia estrategia a GSAP sobre SVG existente ✅ 2026-04-28
- [!] [MKT-20] N8N: definir e implementar workflow de retorno HTML (GET) + completar workflow de notificación (POST) para envío automático por Gmail 🚧 Definición técnica lista en `docs/n8n-octopus-mp-flujos.md`; pendiente aplicar cambios manuales en n8n UI (MCP no permite editar nodos)
- [!] [MKT-19] N8N: mostrar página HTML post-pago con botones Excel/Sheets 🚧 Debe implementarse en endpoint de retorno GET (back_urls), no en webhook de notificación POST de MercadoPago
- [!] [MKT-18] N8N/MP: usar mismo endpoint `octopus-notification` para `notification_url` y `back_urls` 🚧 El webhook actual acepta solo POST; `back_urls` de MercadoPago redirigen por GET y hoy devuelve 404
- [!] [MKT-17] N8N: alinear `notification_url` del checkout a `/webhook/octopus-notification` 🚧 Requiere edición manual en n8n UI (MCP actual no permite editar nodos)
- [!] [MKT-16] N8N: completar flujo post-pago (notificacion MP -> envio email con links/adjunto) y definir pruebas en sandbox antes de produccion 🚧 MCP no expone edición de nodos/workflow; requiere ajuste manual en n8n UI y luego validación
- [!] [MKT-13] N8N: duplicar workflow base para checkout de Mercadopago y conectar botón de compra de landing al webhook nuevo 🚧 MCP actual expone búsqueda/detalle/ejecución pero no endpoint de clonación; falta ID del workflow duplicado para continuar con ajustes
- [!] [DATA-03] Definir semántica "borrar base de datos completa" 🚧 El sistema es multitenant en una sola DB; no corresponde `DROP DATABASE`, sino purga transaccional por `business_id`.
- [!] [DATA-04] Definir formato final de backup "SQL completo del usuario" 🚧 En entorno compartido no se puede exponer dump global; hay que generar dump lógico por tenant.
- [!] [INT-03] Clientes: razón social AFIP por CUIT no confiable en algunos casos 🚧 Constancia devuelve errores regulatorios para ciertos CUITs.
