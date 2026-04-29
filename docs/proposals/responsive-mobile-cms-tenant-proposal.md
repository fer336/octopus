# Propuesta: Responsividad Mobile CMS + Octopus

## 1) Contexto y problema
Hoy el sistema tiene mejoras responsive parciales, pero no una estrategia unificada para mobile. En pantallas críticas (especialmente Ventas y listados de CMS), la densidad visual y los layouts de escritorio degradan la experiencia en celulares.

## 2) Objetivo
Diseñar e implementar una base responsive consistente para:
- **Tenant (Octopus):** operación diaria de ventas, clientes, productos y caja.
- **CMS (Admin):** gestión de tenants, usuarios y configuración.

Meta: experiencia usable y estable en 360–767px sin romper desktop.

## 3) Alcance
### Incluye
- Estandarización de breakpoints, spacing y comportamiento de layout.
- Refactor de shell global (Sidebar/Header/MainLayout) para mobile drawer + topbar compacta.
- Rediseño mobile de pantalla de **Ventas** (flujo por pasos/tabs en celular).
- Estrategia de tablas responsive (desktop tabla, mobile cards/stack + acciones contextuales).
- Formularios mobile-first (1 columna, CTAs sticky, targets táctiles).
- QA responsive en anchos de referencia (375, 390, 768, 1024).

### No incluye
- Nuevas funcionalidades de negocio (facturación, reglas fiscales, nuevos endpoints).
- Rediseño visual total de marca.
- Optimización de performance avanzada fuera de quick wins de UX.

## 4) Enfoque técnico por fases
### Fase 0 — Baseline (1-2 días)
- Definir contrato responsive (breakpoints, grids, tipografías, spacing).
- Matriz de prioridad de pantallas (Tier 1/2/3).

### Fase 1 — Shell global (2-3 días)
- Ajustar `MainLayout`, `Sidebar`, `Header` en tenant y admin.
- Eliminar doble scroll y overflow horizontal no intencional.

### Fase 2 — Flujos críticos (5-8 días)
- **Ventas (`Sales.tsx`)**: patrón mobile por pasos (Cliente → Productos → Resumen/Emitir).
- **CMS Tenants (`TenantList.tsx`, `TenantDetail.tsx`)**: cards mobile + menú de acciones.

### Fase 3 — QA y hardening (2-3 días)
- Checklist visual/funcional por viewport.
- Smoke E2E de login, crear venta y operaciones básicas CMS.

## 5) Riesgos y mitigación
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Regresiones en desktop | Alto | Feature flags por pantalla + QA cruzado por breakpoint |
| Sobre-esfuerzo en Sales | Alto | Entrega iterativa: primero navegación/estructura, luego refinamiento |
| Inconsistencias entre CMS y tenant | Medio | Componentes compartidos responsive (drawer, table/cards, sticky actions) |

## 6) Criterios de aceptación
- 0 desbordes horizontales no intencionales en pantallas Tier 1.
- Navegación completa en mobile sin bloqueos.
- Ventas usable en celular con flujo claro de punta a punta.
- Listados CMS legibles y accionables en mobile.
- Desktop sin regresiones visuales críticas.

## 7) Áreas impactadas
- `frontend/src/components/layout/MainLayout.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/pages/Sales.tsx`
- `frontend/src/admin/pages/TenantList.tsx`
- `frontend/src/admin/pages/TenantDetail.tsx`

## 8) Rollback
Rollback por módulo (layout, ventas, CMS) vía commits atómicos. Si aparece regresión crítica, revertir solo el módulo afectado y mantener mejoras estables ya validadas.

## 9) Próximo paso recomendado
Crear task breakdown técnico por fase con estimación por archivo y definición de orden de implementación (Fase 1 → Fase 2 → Fase 3).
