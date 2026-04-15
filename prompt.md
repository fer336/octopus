# Prompts Maestros — Productos Digitales en Excel (OctopusTrack)

> Paleta obligatoria para TODOS los Excel:
> - Negro: `#121325`
> - Blanco: `#f0f0f2`
> - Lila: `#9d84bf`
> - Púrpura: `#5c3a8c`

---

## 1) Prompt — Cotizador Profesional Automatizado

```txt
Actuá como especialista en Excel + UX y creá una plantilla profesional llamada “Cotizador_OctopusTrack.xlsx”.

Objetivo:
Construir un cotizador tipo SaaS dentro de Excel, visualmente similar al módulo de Ventas de OctopusTrack.

Diseño y branding (obligatorio):
- Usar paleta:
  - Fondo principal claro: #f0f0f2
  - Texto principal: #121325
  - Botones y títulos: #5c3a8c
  - Destacados suaves: #9d84bf
- Estilo limpio, moderno, sin cuadrícula visible en hojas de UI.
- Encabezados con bloques redondeados simulados (celdas combinadas y bordes suaves).
- Tipografía sugerida: Segoe UI/Calibri.
- Preparar versión “modo oscuro” en hoja separada con fondo #121325 y texto claro.

Estructura de hojas:
1) Config
2) BD_Productos
3) Cotizador
4) Impresion_A4
5) Ayuda

Reglas funcionales:
- En BD_Productos: Código, Descripción, Unidad, PrecioBase, IVA%, Activo.
- En Cotizador:
  - Selector de cliente, fecha, número de cotización.
  - Tabla de ítems con desplegable de producto.
  - Traer descripción/precio con XLOOKUP (o BUSCARV si no disponible).
  - Campos: Cantidad, Precio, Desc%, Subtotal línea.
  - Totales automáticos: Subtotal, Descuento, IVA, Total final.
- Validaciones:
  - Cantidad > 0
  - Desc% entre 0 y 100
- Botones simulados visualmente: “Agregar línea”, “Limpiar”, “Generar PDF”.
- Formato moneda ARS.

Impresión:
- Hoja Impresion_A4 lista para exportar PDF.
- Márgenes, encabezado con logo, datos de negocio, pie con observaciones.
- Área de impresión fija y salto de página correcto.
- Nombre sugerido de exportación: cotizacion_YYYY_MM_DD.pdf

Entregame:
- Estructura exacta de celdas por hoja.
- Fórmulas completas.
- Reglas de validación.
- Reglas de formato condicional.
- Pasos de implementación en orden.
```

---

## 2) Prompt — Gestor de Cuentas Corrientes y Fiado

```txt
Quiero que diseñes un Excel llamado “CuentaCorriente_OctopusTrack.xlsx” que replique la lógica de cuenta corriente del sistema.

Objetivo:
Controlar deuda por cliente, movimientos Debe/Haber y saldo acumulado con dashboard claro.

Branding obligatorio:
- Paleta OctopusTrack:
  - #121325, #f0f0f2, #9d84bf, #5c3a8c
- UI tipo panel ERP: tarjetas de resumen + tabla operativa.
- Hoja clara principal y hoja alternativa dark.

Hojas:
1) Config
2) Clientes
3) Movimientos
4) Estado_Cuenta
5) Dashboard
6) Impresion_Extracto
7) Ayuda

Lógica:
- Movimientos: Fecha, ClienteID, Cliente, Tipo (Factura/Pago/NotaCrédito/Ajuste), Debe, Haber, Observación.
- Saldo por movimiento (acumulado por cliente y fecha).
- Estado_Cuenta:
  - Saldo anterior
  - Total facturado período
  - Total pagado período
  - Saldo actual
- Dashboard:
  - Top clientes deudores
  - Total deuda general
  - Cantidad de clientes con deuda > límite
- Formato condicional:
  - Saldo alto en rojo
  - Riesgo medio en lila
  - Al día en tonos neutros

UX:
- Filtros por cliente y rango de fechas.
- Panel visual para “cuentas vencidas”.
- Botón visual “Imprimir extracto”.

Impresión:
- Extracto por cliente en A4 con branding.
- Tabla tipo extracto bancario.

Entregame:
- Diseño de cada hoja, fórmulas concretas, validaciones, pivots, y formato condicional detallado.
```

---

## 3) Prompt — Calculadora Maestra de Precios y Márgenes

```txt
Creá una plantilla Excel profesional “CalculadoraPrecios_OctopusTrack.xlsx”.

Objetivo:
Calcular precio sugerido de venta con descuentos en cadena, costos logísticos, impuestos y markup.

Diseño:
- Paleta OctopusTrack (#121325, #f0f0f2, #9d84bf, #5c3a8c).
- Estilo premium tipo panel de pricing.
- Inputs claramente separados de outputs.

Hojas:
1) Config_Impuestos
2) Lista_Productos
3) Calculadora
4) Simulador_Escenarios
5) Dashboard_Margenes
6) Ayuda

Lógica de negocio:
- Inputs por producto:
  - PrecioLista
  - Desc1%, Desc2%, Desc3%
  - CostoFlete
  - OtrosCostos
  - IVA%
  - IIBB%
  - Markup%
- Salidas:
  - Costo neto final
  - Precio sugerido sin IVA
  - Precio sugerido con IVA
  - Margen bruto %
  - Ganancia por unidad
- Permitir escenarios (conservador, estándar, agresivo).

Validaciones:
- % entre 0 y 100
- Precios > 0
- alertas si margen < umbral mínimo

Formato condicional:
- Margen negativo: rojo fuerte
- Margen bajo: alerta
- Margen sano: verde suave
- Campos clave en púrpura/lila para lectura rápida.

Entregame:
- Estructura exacta de celdas.
- Fórmulas listas para copiar.
- Tabla de escenarios.
- Dashboard con KPIs principales.
```

---

## 4) Prompt — Control de Inventario Inteligente

```txt
Diseñá “InventarioInteligente_OctopusTrack.xlsx” como mini-ERP de stock.

Objetivo:
Registrar entradas/salidas y calcular stock actual en tiempo real con alertas de reposición.

Branding:
- Paleta OctopusTrack:
  - Primario: #5c3a8c
  - Secundario: #9d84bf
  - Fondo: #f0f0f2
  - Texto: #121325
- Diseño similar al módulo Stock del sistema.

Hojas:
1) Config
2) Maestro_Productos
3) Entradas
4) Salidas
5) Stock_Actual
6) Alertas
7) Impresion_ControlFisico
8) Dashboard

Lógica:
- Stock_Actual = Entradas acumuladas - Salidas acumuladas por producto.
- Punto de pedido configurable por producto.
- Días de cobertura (opcional).
- Valorización de stock por costo.

Alertas:
- Si stock <= punto pedido => alerta visual destacada.
- Sin movimiento X días => alerta de rotación lenta.
- Quiebre de stock => estado crítico.

UX:
- Filtros por categoría/proveedor.
- Vista resumida y vista detallada.
- Dashboard con:
  - Productos críticos
  - Valor total de stock
  - Top faltantes

Impresión:
- Planilla de conteo físico A4 (sin precios), con columnas para conteo manual.

Entregame:
- Modelo de datos por hoja.
- Fórmulas clave.
- Reglas condicionales.
- Diseño visual replicable.
```

---

## 5) Prompt — Comparador de Proveedores

```txt
Creá una plantilla “ComparadorProveedores_OctopusTrack.xlsx” para decisiones de compra.

Objetivo:
Comparar precios por artículo entre múltiples proveedores y resaltar automáticamente la mejor opción.

Diseño:
- Mismo look & feel de OctopusTrack con paleta:
  - #121325, #f0f0f2, #9d84bf, #5c3a8c
- Estructura clara para uso diario por compras.

Hojas:
1) Config
2) Proveedores
3) Productos_Clave
4) Comparativa
5) Ranking_Ahorro
6) OrdenCompra_Sugerida
7) Ayuda

Lógica:
- En Comparativa:
  - Artículo
  - Precio Prov A, B, C (y escalable a más)
  - Mejor precio (MIN)
  - Proveedor ganador
  - Diferencia absoluta y %
- Detectar faltantes (cuando un proveedor no cotiza).
- Ranking_Ahorro:
  - cuánto ahorro mensual estimado por elegir mejor proveedor.

Formato condicional:
- Celda del mejor precio en lila/púrpura.
- Diferencias grandes en color de alerta.
- Disponibilidad incompleta marcada.

Output comercial:
- Hoja “OrdenCompra_Sugerida” con proveedor recomendado por artículo.
- Lista imprimible/exportable a PDF.

Entregame:
- Diseño exacto por hoja.
- Fórmulas.
- Validaciones.
- Formato condicional.
- Flujo operativo recomendado (paso a paso).
```
