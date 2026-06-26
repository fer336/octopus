# Especificación funcional — Módulo de Rentabilidad y Márgenes para OctopusTrack

## 1. Objetivo general

Diseñar e implementar un módulo de **Rentabilidad y Márgenes** dentro de OctopusTrack que permita analizar de forma clara cuánto vende el comercio, cuánto cuestan esas ventas y qué productos, clientes, vendedores, marcas, categorías, listas de precios y operaciones generan realmente ganancia.

El módulo debe estar orientado a comercios, ferreterías, sanitarios, distribuidores y mayoristas.

La funcionalidad no debe limitarse a mostrar un margen general. Debe ayudar al usuario a responder preguntas concretas del negocio:

- ¿Qué producto me deja más dinero?
- ¿Qué producto tiene mejor margen?
- ¿Qué producto estoy vendiendo con pérdida?
- ¿Qué cliente compra mucho pero deja poco margen?
- ¿Qué vendedor factura mucho pero descuenta demasiado?
- ¿Qué lista de precios es más rentable?
- ¿Qué categoría genera más ganancia?
- ¿Estoy vendiendo más pero ganando menos?
- ¿Cuánto margen pierdo al aplicar descuentos?
- ¿Qué precio necesito para alcanzar un margen objetivo?
- ¿Qué operaciones no pueden analizarse porque no tienen costo registrado?

---

# 2. Nombre del módulo

Nombre recomendado:

## Rentabilidad y Márgenes

Descripción corta:

> Analizá cuánto vendés, cuánto te cuesta y qué productos, clientes y vendedores generan realmente la ganancia de tu negocio.

---

# 3. Alcance funcional

El módulo debe permitir analizar la rentabilidad desde las siguientes dimensiones:

- Período.
- Producto.
- Categoría.
- Marca.
- Proveedor.
- Cliente.
- Grupo de clientes.
- Vendedor.
- Sucursal.
- Lista de precios.
- Tipo de comprobante.
- Documento individual.
- Canal de venta.
- Estado de la operación.

El sistema debe distinguir entre:

- Rentabilidad estimada.
- Rentabilidad comprometida.
- Rentabilidad real.

---

# 4. Definiciones principales

## 4.1 Venta neta

Monto vendido sin impuestos y descontando bonificaciones, descuentos, devoluciones y notas de crédito.

```text
venta_neta = subtotal_sin_impuestos - descuentos - bonificaciones - devoluciones
```

## 4.2 Costo de mercadería vendida

Costo histórico de los productos efectivamente vendidos.

```text
costo_total = costo_unitario_historico × cantidad
```

## 4.3 Ganancia bruta

```text
ganancia_bruta = venta_neta - costo_total
```

## 4.4 Margen bruto porcentual

```text
margen_porcentaje = ganancia_bruta / venta_neta × 100
```

## 4.5 Markup porcentual

```text
markup_porcentaje = ganancia_bruta / costo_total × 100
```

## 4.6 Diferencia entre margen y markup

Ejemplo:

| Costo | Venta | Ganancia | Markup | Margen |
|---:|---:|---:|---:|---:|
| $100 | $150 | $50 | 50% | 33,33% |

El sistema debe mostrar margen y markup como conceptos diferentes.

---

# 5. Regla crítica: costo histórico

La rentabilidad histórica no debe recalcularse utilizando el costo actual del producto.

Cuando una venta se confirma, cada línea debe guardar una fotografía del costo utilizado en ese momento.

## Campos mínimos recomendados por línea de venta

```text
sale_item.unit_cost_snapshot
sale_item.cost_method
sale_item.cost_source
sale_item.cost_snapshot_date
sale_item.unit_price_net
sale_item.quantity
sale_item.discount_amount
sale_item.net_total
sale_item.total_cost
sale_item.gross_profit
sale_item.margin_percentage
sale_item.markup_percentage
```

## Ejemplo

Una venta realizada en enero debe conservar el costo de enero.

Si el costo del producto cambia en junio, la rentabilidad histórica de enero no debe modificarse.

---

# 6. Métodos de costo soportados

El sistema debe contemplar los siguientes métodos:

- Último costo de compra.
- Costo promedio ponderado.
- Costo estándar.
- Costo manual.
- Costo actual.
- Costo histórico registrado en la venta.

## Configuración recomendada

Cada empresa debe poder elegir su método de costo predeterminado.

También debe registrarse en cada línea qué método fue utilizado.

---

# 7. Tipos de rentabilidad

## 7.1 Rentabilidad estimada

Corresponde a:

- Presupuestos.
- Cotizaciones.
- Pedidos no confirmados.

Debe utilizar precios y costos actuales.

## 7.2 Rentabilidad comprometida

Corresponde a:

- Pedidos confirmados.
- Ventas reservadas.
- Operaciones aprobadas pendientes de facturación.

## 7.3 Rentabilidad real

Corresponde a:

- Facturas emitidas.
- Ventas finalizadas.
- Remitos considerados venta.
- Operaciones descontando devoluciones, anulaciones y notas de crédito.

---

# 8. Estructura de navegación

El módulo debe organizarse en pestañas.

## 8.1 Resumen

Debe mostrar:

- Indicadores principales.
- Evolución temporal.
- Comparación contra período anterior.
- Alertas.
- Productos más rentables.
- Productos con pérdida.
- Clientes más rentables.
- Vendedores con mejor aporte.

## 8.2 Productos

Debe permitir analizar:

- Producto.
- Categoría.
- Marca.
- Proveedor.
- Cantidad vendida.
- Venta neta.
- Costo.
- Ganancia.
- Margen.
- Markup.
- Participación en la ganancia total.

## 8.3 Clientes

Debe mostrar:

- Ventas.
- Costos.
- Ganancia.
- Margen.
- Descuento promedio.
- Ticket promedio.
- Cantidad de operaciones.
- Lista de precios utilizada.
- Saldo de cuenta corriente.
- Días promedio de cobro.
- Última compra.

## 8.4 Vendedores

Debe mostrar:

- Ventas netas.
- Cantidad de operaciones.
- Ganancia total.
- Margen promedio.
- Descuentos aplicados.
- Ticket promedio.
- Participación sobre la ganancia total.
- Operaciones con margen bajo o negativo.

## 8.5 Documentos

Debe permitir analizar cada comprobante:

- Tipo.
- Número.
- Fecha.
- Cliente.
- Vendedor.
- Venta neta.
- Costo.
- Ganancia.
- Margen.
- Estado.
- Lista de precios.
- Sucursal.

## 8.6 Pérdidas y alertas

Debe mostrar:

- Ventas debajo del costo.
- Margen negativo.
- Margen debajo del mínimo.
- Productos sin costo.
- Costos no determinados.
- Descuentos excesivos.
- Operaciones con pérdida.
- Productos cuyo costo aumentó fuertemente.

## 8.7 Configuración

Debe permitir definir:

- Método de costo.
- Margen mínimo global.
- Margen mínimo por categoría.
- Margen mínimo por producto.
- Margen objetivo.
- Permisos.
- Tipos de comprobantes incluidos.
- Tratamiento de remitos.
- Tratamiento de presupuestos.
- Colores del semáforo.
- Reglas de alertas.

---

# 9. Filtros generales

Todos los reportes deben poder filtrarse por:

- Fecha desde.
- Fecha hasta.
- Sucursal.
- Vendedor.
- Cliente.
- Grupo de clientes.
- Producto.
- Categoría.
- Marca.
- Proveedor.
- Lista de precios.
- Tipo de comprobante.
- Estado.
- Canal de venta.
- Rentabilidad estimada, comprometida o real.

## Filtro principal

```text
Calcular rentabilidad sobre:
- Facturas
- Ventas confirmadas
- Remitos
- Pedidos
- Presupuestos
- Todos
```

No deben mezclarse operaciones presupuestadas con ventas reales sin indicarlo claramente.

---

# 10. Tarjetas principales del tablero

La primera fila debe mostrar:

## 10.1 Ventas netas

Monto total vendido sin impuestos.

## 10.2 Costo de mercadería

Costo histórico total.

## 10.3 Ganancia bruta

```text
ganancia_bruta = ventas_netas - costo_mercaderia
```

## 10.4 Margen bruto

```text
margen_bruto = ganancia_bruta / ventas_netas × 100
```

## 10.5 Markup promedio

```text
markup = ganancia_bruta / costo_mercaderia × 100
```

## 10.6 Unidades vendidas

Total de unidades.

## 10.7 Ticket promedio

```text
ticket_promedio = ventas_netas / cantidad_operaciones
```

## 10.8 Comparación contra período anterior

Cada tarjeta debe mostrar:

- Valor actual.
- Valor anterior.
- Diferencia absoluta.
- Diferencia porcentual.
- Indicador de subida o bajada.

---

# 11. Gráficos recomendados

## 11.1 Evolución temporal

Gráfico de líneas o barras con:

- Ventas netas.
- Costo.
- Ganancia bruta.
- Margen porcentual.

Agrupación por:

- Día.
- Semana.
- Mes.
- Trimestre.
- Año.

Objetivo:

Detectar situaciones como:

> Se vendió más, pero se ganó menos.

## 11.2 Productos con mayor aporte

Ranking por ganancia total.

## 11.3 Productos con mejor margen

Ranking por margen porcentual.

Estos rankings deben estar separados.

Un producto puede tener gran margen y poca ganancia total.

## 11.4 Rentabilidad por categoría

Mostrar:

- Categoría.
- Ventas.
- Costo.
- Ganancia.
- Margen.
- Participación.

## 11.5 Rentabilidad por marca

Mismos indicadores que categoría.

## 11.6 Rentabilidad por cliente

Mostrar clientes ordenados por:

- Ganancia.
- Margen.
- Ventas.
- Ticket promedio.
- Descuento promedio.

## 11.7 Rentabilidad por vendedor

Mostrar:

- Facturación.
- Ganancia.
- Margen.
- Descuentos.
- Cantidad de operaciones.

## 11.8 Cuadrante de productos

Crear una matriz:

| | Margen alto | Margen bajo |
|---|---|---|
| Venta alta | Productos estrella | Mucha venta, poca ganancia |
| Venta baja | Oportunidades | Productos a revisar |

---

# 12. Tablas principales

## 12.1 Tabla de productos

Columnas:

| Producto | Categoría | Marca | Cantidad | Venta neta | Costo | Ganancia | Margen | Markup |
|---|---|---|---:|---:|---:|---:|---:|---:|

Ordenamientos:

- Mayor ganancia.
- Mayor margen.
- Mayor facturación.
- Mayor cantidad.
- Menor margen.
- Mayor pérdida.
- Mayor participación.

## 12.2 Tabla de clientes

| Cliente | Ventas | Costo | Ganancia | Margen | Descuento promedio | Ticket promedio |
|---|---:|---:|---:|---:|---:|---:|

## 12.3 Tabla de vendedores

| Vendedor | Ventas | Operaciones | Descuentos | Ganancia | Margen |
|---|---:|---:|---:|---:|---:|

## 12.4 Tabla de documentos

| Documento | Fecha | Cliente | Vendedor | Venta | Costo | Ganancia | Margen |
|---|---|---|---|---:|---:|---:|---:|

## 12.5 Tabla de alertas

| Documento | Producto | Cliente | Venta | Costo | Margen | Motivo |
|---|---|---|---:|---:|---:|---|

---

# 13. Alertas y semáforo

## Estados visuales

- Verde: margen saludable.
- Amarillo: margen debajo del objetivo.
- Rojo: margen crítico o negativo.
- Gris: costo no disponible.

## Alertas mínimas

- Venta debajo del costo.
- Margen negativo.
- Margen debajo del mínimo.
- Producto sin costo.
- Costo histórico faltante.
- Descuento excesivo.
- Cambio importante de costo.
- Documento sin rentabilidad calculable.

## Configuración

El usuario debe poder definir:

```text
margen_verde_desde
margen_amarillo_desde
margen_rojo_hasta
```

También se deben permitir límites por:

- Empresa.
- Categoría.
- Marca.
- Producto.

---

# 14. Simulador de margen

El sistema debe permitir seleccionar un producto y simular precios.

## Datos mostrados

- Costo actual.
- Precio actual.
- Margen actual.
- Markup actual.
- Margen objetivo.
- Precio recomendado.
- Descuento máximo posible.
- Ganancia estimada.

## Fórmula para precio según margen objetivo

```text
precio_objetivo = costo / (1 - margen_objetivo_decimal)
```

## Ejemplo

```text
Costo:                $10.000
Precio actual:        $14.000
Margen actual:          28,57%
Margen objetivo:        35,00%
Precio recomendado:   $15.385
```

---

# 15. Impacto de descuentos

Cada venta debe poder mostrar:

- Ganancia antes del descuento.
- Ganancia después del descuento.
- Pérdida de ganancia.
- Reducción porcentual del margen.

Ejemplo:

```text
Ganancia sin descuento:        $85.000
Ganancia después del descuento: $54.000
Reducción de ganancia:           36,47%
```

El sistema debe alertar si el descuento lleva la operación debajo del margen mínimo.

---

# 16. Comparación de listas de precios

OctopusTrack debe permitir comparar la rentabilidad de un producto o conjunto de productos según la lista aplicada.

| Lista | Venta estimada | Ganancia | Margen |
|---|---:|---:|---:|
| Minorista | $150.000 | $50.000 | 33,33% |
| Mayorista | $130.000 | $30.000 | 23,08% |
| Cliente especial | $120.000 | $20.000 | 16,67% |

El módulo debe permitir detectar:

- Listas poco rentables.
- Clientes con listas especiales demasiado agresivas.
- Productos cuyo precio quedó atrasado.
- Diferencias excesivas entre listas.

---

# 17. Rentabilidad por cliente

Además de la venta y el margen, se recomienda analizar:

- Descuentos.
- Bonificaciones.
- Costos financieros.
- Saldo de cuenta corriente.
- Días promedio de cobro.
- Morosidad.
- Devoluciones.
- Frecuencia de compra.

## Fase avanzada

Calcular rentabilidad comercial ajustada:

```text
rentabilidad_ajustada =
ganancia_bruta
- costos_financieros
- costos_logisticos
- descuentos_adicionales
- incobrables
```

---

# 18. Devoluciones y notas de crédito

Las devoluciones deben revertir:

- Venta neta.
- Costo.
- Ganancia.
- Cantidad vendida.
- Margen acumulado.

La nota de crédito debe utilizar el costo histórico de la operación original cuando sea posible.

No se debe aplicar el costo actual para revertir una venta histórica.

---

# 19. Remitos

El sistema debe permitir configurar si un remito:

- No impacta rentabilidad.
- Impacta rentabilidad comprometida.
- Impacta rentabilidad real.
- Impacta solo cuando se factura.

La configuración debe ser por empresa.

---

# 20. Presupuestos

Los presupuestos deben mostrar rentabilidad estimada.

No deben sumarse a la rentabilidad real.

Deben permitir:

- Simular descuentos.
- Ver margen estimado.
- Alertar antes de confirmar una venta.
- Comparar listas de precios.
- Mostrar precio mínimo recomendado.

---

# 21. Permisos

Permisos sugeridos:

```text
profitability.view_summary
profitability.view_costs
profitability.view_margin
profitability.view_by_product
profitability.view_by_customer
profitability.view_by_seller
profitability.view_documents
profitability.export
profitability.configure
profitability.view_alerts
profitability.use_simulator
```

## Regla importante

No todos los usuarios deben poder ver costos y ganancias.

Ejemplos:

- Administrador: acceso completo.
- Gerente: acceso completo sin configuración.
- Vendedor: solo margen de sus operaciones o alertas.
- Cajero: sin acceso a costos.
- Contador: acceso a reportes.

---

# 22. Exportaciones

Debe permitirse exportar a:

- Excel.
- CSV.
- PDF.

Cada exportación debe respetar:

- Filtros aplicados.
- Orden actual.
- Columnas visibles.
- Rango de fechas.
- Empresa y sucursal.

---

# 23. Rendimiento

Los reportes deben estar optimizados para grandes volúmenes.

Recomendaciones:

- Agregaciones por período.
- Índices en fechas, producto, cliente, vendedor y sucursal.
- Tablas de resumen.
- Caché de indicadores.
- Procesamiento asíncrono para exportaciones grandes.
- Paginación.
- Filtros del lado del servidor.

---

# 24. Modelo de datos sugerido

## Tabla de rentabilidad por línea

```text
sale_item_profitability
- id
- business_id
- branch_id
- sale_id
- sale_item_id
- document_type
- document_number
- sale_date
- product_id
- category_id
- brand_id
- supplier_id
- customer_id
- seller_id
- price_list_id
- quantity
- unit_price_net
- discount_amount
- net_sale_amount
- unit_cost_snapshot
- total_cost
- gross_profit
- margin_percentage
- markup_percentage
- cost_method
- cost_source
- cost_snapshot_date
- profitability_type
- status
- created_at
- updated_at
```

## Tabla de configuración

```text
profitability_settings
- id
- business_id
- default_cost_method
- default_minimum_margin
- target_margin
- green_margin_from
- yellow_margin_from
- red_margin_to
- include_invoices
- include_delivery_notes
- include_orders
- include_quotes
- delivery_note_behavior
- created_at
- updated_at
```

## Tabla de reglas de margen

```text
profitability_margin_rules
- id
- business_id
- entity_type
- entity_id
- minimum_margin
- target_margin
- created_at
- updated_at
```

`entity_type` puede ser:

- product
- category
- brand
- price_list

---

# 25. API sugerida

## Resumen

```http
GET /api/profitability/summary
```

Filtros:

```text
date_from
date_to
branch_id
seller_id
customer_id
product_id
category_id
brand_id
supplier_id
price_list_id
document_type
profitability_type
```

## Productos

```http
GET /api/profitability/products
```

## Clientes

```http
GET /api/profitability/customers
```

## Vendedores

```http
GET /api/profitability/sellers
```

## Documentos

```http
GET /api/profitability/documents
```

## Alertas

```http
GET /api/profitability/alerts
```

## Simulación

```http
POST /api/profitability/simulate
```

Payload:

```json
{
  "product_id": 123,
  "quantity": 10,
  "price": 15000,
  "discount_percentage": 5,
  "target_margin": 35
}
```

## Configuración

```http
GET /api/profitability/settings
PUT /api/profitability/settings
```

---

# 26. Respuesta sugerida del endpoint de resumen

```json
{
  "period": {
    "from": "2026-06-01",
    "to": "2026-06-30"
  },
  "summary": {
    "net_sales": 12500000,
    "cost_of_goods": 8200000,
    "gross_profit": 4300000,
    "gross_margin_percentage": 34.4,
    "markup_percentage": 52.44,
    "units_sold": 1850,
    "average_ticket": 125000
  },
  "comparison": {
    "previous_period_net_sales_change": 12.5,
    "previous_period_profit_change": 5.2,
    "previous_period_margin_change": -2.1
  },
  "alerts": {
    "negative_margin_sales": 8,
    "low_margin_sales": 24,
    "products_without_cost": 3
  }
}
```

---

# 27. Reglas de negocio

1. Nunca recalcular rentabilidad histórica con costos actuales.
2. Guardar costo histórico por línea.
3. Separar margen de markup.
4. Excluir impuestos del cálculo.
5. Descontar notas de crédito y devoluciones.
6. No mezclar presupuestos con ventas reales.
7. Mostrar operaciones sin costo como no calculables.
8. Permitir configurar si los remitos impactan.
9. Respetar permisos de acceso a costos.
10. Aplicar filtros por `business_id` para evitar mezcla de datos entre comercios.
11. Toda consulta debe respetar sucursal y empresa.
12. Las anulaciones deben revertir la rentabilidad.
13. El margen promedio debe calcularse sobre totales, no promediando porcentajes individuales.

## Fórmula correcta del margen total

```text
margen_total =
suma_ganancia_bruta / suma_ventas_netas × 100
```

No usar:

```text
promedio(margen_por_linea)
```

---

# 28. Experiencia de usuario

## Diseño recomendado

- Interfaz clara.
- Tarjetas en la parte superior.
- Filtros visibles.
- Tablas ordenables.
- Colores semánticos.
- Tooltips para explicar margen y markup.
- Vista adaptable a escritorio y móvil.
- Acceso rápido a operaciones con pérdida.
- Posibilidad de abrir el documento original.

## Mensajes de ayuda

Ejemplo:

> El margen indica qué porcentaje de la venta representa la ganancia.

> El markup indica cuánto se incrementó el precio respecto del costo.

> Una operación sin costo histórico no puede incluirse en el cálculo de rentabilidad.

---

# 29. Estados vacíos

## Sin ventas

> No hay ventas para los filtros seleccionados.

## Sin costos

> Existen operaciones sin costo registrado. La rentabilidad puede estar incompleta.

## Sin permisos

> No tenés permisos para visualizar costos y rentabilidad.

## Sin configuración

> Configurá el método de costo para comenzar a analizar la rentabilidad.

---

# 30. Primera versión recomendada

Implementar:

1. Tarjetas de ventas, costo, ganancia, margen y markup.
2. Evolución temporal.
3. Rentabilidad por producto.
4. Rentabilidad por categoría.
5. Rentabilidad por marca.
6. Rentabilidad por cliente.
7. Rentabilidad por vendedor.
8. Tabla de documentos.
9. Operaciones con pérdida.
10. Filtros generales.
11. Exportación.
12. Costo histórico por línea.
13. Permisos.
14. Comparación con período anterior.

---

# 31. Segunda versión

Implementar:

- Margen objetivo.
- Simulador de precios.
- Impacto de descuentos.
- Comparación de listas.
- Rentabilidad por proveedor.
- Cuadrante de productos.
- Alertas automáticas.
- Comparación estimada versus real.
- Reglas de margen por categoría.
- Reglas de margen por producto.

---

# 32. Tercera versión

Implementar:

- Rentabilidad neta.
- Costos logísticos.
- Costos financieros.
- Gastos indirectos.
- Distribución de gastos.
- Proyecciones.
- Presupuestos comerciales.
- Recomendaciones mediante IA.
- Detección de precios atrasados.
- Sugerencias automáticas de precio.
- Predicción de pérdida de margen.

---

# 33. Criterios de aceptación

## Resumen

- Debe mostrar ventas, costo, ganancia, margen y markup.
- Debe permitir filtrar por período.
- Debe comparar contra el período anterior.
- Debe respetar permisos.

## Productos

- Debe mostrar ganancia y margen por producto.
- Debe permitir ordenar por ganancia y margen.
- Debe diferenciar mayor margen de mayor aporte.

## Costos

- Cada línea debe conservar costo histórico.
- Cambiar el costo actual no debe modificar ventas pasadas.

## Alertas

- Debe detectar ventas debajo del costo.
- Debe detectar productos sin costo.
- Debe identificar margen debajo del mínimo.

## Devoluciones

- Deben revertir venta, costo y ganancia.

## Filtros

- Todos los reportes deben respetar filtros.
- Los totales deben coincidir con las tablas.

## Seguridad

- Un usuario sin permiso no debe acceder a costos mediante la interfaz ni la API.

---

# 34. Resultado esperado

El módulo debe convertirse en una herramienta de decisión y no solo en un reporte.

Debe permitir que el comerciante entienda:

- Qué vende.
- Cuánto gana.
- Dónde pierde dinero.
- Qué precios debe corregir.
- Qué descuentos afectan el margen.
- Qué clientes son realmente rentables.
- Qué vendedores aportan ganancia.
- Qué productos sostienen el negocio.

El objetivo final es que OctopusTrack ayude a tomar mejores decisiones comerciales utilizando información real y accionable.
