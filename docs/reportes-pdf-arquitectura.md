# Arquitectura de Reportes PDF (REP-01)

## Objetivo
Definir una arquitectura mantenible para generar reportes PDF de:

- Stock
- Categoría
- Proveedor
- Ventas por período
- Cuenta Corriente cliente

alineada al PRD (sección 3.11), separando claramente **orquestación**, **consulta de datos**, **cálculo de métricas** y **render PDF**.

---

## Principios de diseño

1. **Router liviano**: recibe request, valida filtros y delega.
2. **Servicio por caso de uso**: cada reporte tiene su service dedicado.
3. **Pipeline común PDF**: contexto -> template Jinja -> WeasyPrint.
4. **Contexto tipado**: schemas de request/response por reporte.
5. **Escalable**: agregar un reporte nuevo sin tocar los existentes.

---

## Estructura propuesta

```text
backend/app/
  routers/
    reports.py
  schemas/
    report_schemas.py
  services/
    reporting/
      report_pdf_service.py            # Orquestador común
      report_template_registry.py      # Mapea tipo -> template/metadata
      common_context_builder.py        # Header/footer/tokens comunes

      stock_report_service.py
      category_report_service.py
      supplier_report_service.py
      sales_report_service.py
      client_account_report_service.py

  templates/pdf/reports/
    stock_report.html
    category_report.html
    supplier_report.html
    sales_report.html
    client_account_report.html
```

---

## Flujo end-to-end

1. `GET /reports/{type}/pdf` recibe filtros.
2. `report_schemas.py` valida filtros (`date_from`, `date_to`, `supplier_id`, etc.).
3. `reports.py` invoca al service específico según tipo.
4. Service específico:
   - consulta DB (solo datos del `business_id` actual),
   - calcula métricas/subtotales,
   - arma contexto de template.
5. `report_pdf_service.py` renderiza HTML + genera PDF.
6. Se devuelve `StreamingResponse` con nombre de archivo descriptivo.

---

## Contratos (schemas)

### Request base
- `business_id` (inyectado por tenant context)
- `date_from`, `date_to` (opcionales según reporte)
- filtros opcionales por recurso (`supplier_id`, `category_id`, `low_stock_only`, etc.)

### Contexto base para templates
- `business`: logo, nombre, CUIT, domicilio
- `report`: título, fecha/hora generación, usuario
- `filters`: resumen legible
- `pagination`: número de página (manejado en CSS paged media)
- `rows`: dataset principal
- `summary`: KPIs / totales

---

## Reglas por reporte (mínimo REP-01)

### Stock (landscape)
- columnas: código, código producto, descripción, categoría, proveedor, stock, costo, venta, valor stock
- summary: ítems, valor total stock, bajo stock

### Categoría (landscape)
- agrupado por categoría
- subtotal por bloque
- total general final

### Proveedor (landscape)
- header con datos del proveedor
- productos del proveedor + margen
- highlight margen bajo/negativo

### Ventas por período (portrait/landscape híbrido)
- portada de resumen + detalle paginado
- soportar top productos y top clientes

### Cuenta Corriente (portrait)
- resumen de cuenta + extracto de movimientos
- vencidos destacados en rojo

---

## Decisiones técnicas

1. **WeasyPrint + Jinja2** (ya usado en proyecto) para consistencia.
2. **CSS @page por reporte** (`portrait` o `landscape`) según PRD.
3. **Template por reporte** (evita mega-template condicional).
4. **Servicios especializados** en lugar de un único service monolítico.
5. **Sin lógica de negocio en template**: totales calculados en service.

---

## Plan de implementación (puente a REP-02)

1. Crear `routers/reports.py` con endpoint de stock PDF.
2. Crear `schemas/report_schemas.py` con filtros de stock.
3. Implementar `stock_report_service.py` + `stock_report.html`.
4. Agregar tests de integración del endpoint de stock.
5. Repetir patrón para categoría, proveedor, ventas y cuenta corriente.

---

## Criterios de aceptación de arquitectura

- Cada reporte tiene service + template independiente.
- Router no contiene cálculos ni SQL complejo.
- Todos los reportes comparten header/footer estándar configurable.
- Nombre de archivo sigue convención PRD (`reporte_<tipo>_YYYY_MM_DD.pdf`).
- Multi-tenant garantizado por filtro obligatorio de negocio.
