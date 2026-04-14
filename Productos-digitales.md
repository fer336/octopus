# Estrategia de Productos Digitales (Plantillas Excel/Sheets)

Esta es la estrategia para escindir los módulos del sistema OctopusTrack en herramientas de un solo propósito (Single-Purpose Tools) basadas en Excel, con diseño premium (UI/UX) usando la paleta de colores de la marca (Blanco `#f0f0f2`, Negro `#121325`, Lila `#9d84bf`, Púrpura `#5c3a8c`).

## 1. Cotizador Profesional Automatizado (Módulo: Ventas / Presupuestos)
*   **El Problema:** El dueño pierde 40 minutos armando un presupuesto a mano o en un Word, con errores de cálculo y mala presentación que genera desconfianza.
*   **La Solución en Excel:** 
    *   **Base de Datos:** Pestaña con lista de artículos y precios base.
    *   **El Cotizador:** Panel limpio (dark/light) donde elige el producto de un desplegable (con BUSCARV o XLOOKUP), ingresa la cantidad, y calcula subtotal, impuestos y totales automáticamente.
    *   **El Gancho:** Área de impresión configurada perfectamente en tamaño A4, con logo del negocio, encabezados en Lila/Púrpura, lista para guardar como PDF y enviar por WhatsApp con un solo clic.

## 2. Gestor de Cuentas Corrientes y "Fiado" (Módulo: Clientes / CC)
*   **El Problema:** La "libreta del almacenero". Retiros sin cobrar, cuentas desordenadas, plata "en la calle" sin cuantificar.
*   **La Solución en Excel:**
    *   **Movimientos:** Registro simple de Fecha, Cliente, Concepto (Retiro/Pago), y Monto (Debe/Haber).
    *   **Dashboard Resumen:** Tabla dinámica o panel de resumen que totaliza la deuda actualizada por cliente.
    *   **El Gancho:** Formato condicional que pinta de Púrpura oscuro o Rojo a los clientes que superan su límite de crédito preestablecido. Control total visual de la deuda.

## 3. Calculadora Maestra de Precios y Márgenes (Módulo: Productos / Pricing)
*   **El Problema:** Inflación constante. Remarcación "a ojo" sobre el costo, olvidando fletes, impuestos o descuentos, perdiendo rentabilidad mes a mes.
*   **La Solución en Excel:**
    *   **Matriz de Costeo:** Ingreso de Precio de Lista, aplicación de descuentos en cadena (ej. 10% + 5%), suma de fletes, suma de impuestos (IVA, IIBB) y aplicación del "Markup" (Ganancia deseada).
    *   **El Gancho:** Cálculo exacto al centavo del **Precio de Venta Sugerido**. Le salva la rentabilidad mensual al dueño del negocio.

## 4. Control de Inventario Inteligente (Módulo: Productos / Stock)
*   **El Problema:** Galpón lleno de mercadería estancada, quiebres de stock repentinos en productos clave (ej. cemento, pegamento).
*   **La Solución en Excel:**
    *   **Registro:** Pestaña de Entradas (compras) y Salidas (ventas/retiros).
    *   **El Gancho:** Columna de "Stock Actual" calculada en tiempo real cruzando entradas y salidas. Formato condicional de alerta visual (fondo llamativo) cuando un producto cae por debajo de su "Punto de Pedido", avisando que hay que reponer.

## 5. Comparador de Proveedores (Módulo: Proveedores)
*   **El Problema:** Compras por costumbre al mismo proveedor sin comparar precios, perdiendo margen de ganancia en artículos de alta rotación.
*   **La Solución en Excel:**
    *   **Comparativa:** Ingreso de un artículo clave y los precios de Proveedor A, B y C.
    *   **El Gancho:** Fórmula `MIN()` combinada con formato condicional (color Lila) que resalta automáticamente la mejor opción de compra para cada artículo. Ahorro directo comprobable en las compras mayoristas.