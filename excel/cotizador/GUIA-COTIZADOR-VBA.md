# Cotizador OctopusTrack en Excel (.xlsm)

Guía para crear un cotizador con:
- Numeración automática
- Historial de cotizaciones
- Botones con macros VBA
- Exportación a PDF

Paleta visual (OctopusTrack):
- Fondo claro: `#f0f0f2`
- Texto principal: `#121325`
- Primario: `#5c3a8c`
- Secundario: `#9d84bf`

---

## 1) Crear archivo y hojas

1. Crear archivo nuevo y guardar como **Libro habilitado para macros**: `Cotizador_OctopusTrack.xlsm`.
2. Crear hojas (en este orden):
   - `Config`
   - `BD_Productos`
   - `Cotizador`
   - `Historial`
   - `Impresion_A4`

---

## 2) Estructura mínima por hoja

## Hoja `Config`

| Celda | Valor |
|---|---|
| A2 | NombreNegocio |
| B2 | Octopus Track |
| A3 | Prefijo |
| B3 | COT |
| A4 | PuntoVenta |
| B4 | 0001 |
| A5 | UltimoNumero |
| B5 | 0 |
| A6 | CarpetaPDF |
| B6 | C:\\Cotizaciones\\ |

> `B5` se incrementa automáticamente al guardar.

## Hoja `BD_Productos`

Encabezados en fila 1:

`A: Codigo` | `B: Descripcion` | `C: Unidad` | `D: PrecioBase` | `E: IVA` | `F: Activo`

Cargar productos desde fila 2.

## Hoja `Cotizador`

### Encabezado
- `B2`: Cliente
- `E2`: Fecha
- `H2`: Número Cotización

### Tabla detalle (arranca fila 7)

Encabezados en fila 7:

| Col | Campo |
|---|---|
| A | Ítem |
| B | Código |
| C | Descripción |
| D | Unidad |
| E | Cantidad |
| F | Precio |
| G | Desc% |
| H | IVA% |
| I | Total Línea |

### Totales (sugerido)
- `H32`: Subtotal
- `I32`: `=SUM(I8:I31)`
- `H33`: IVA
- `I33`: `=SUMPRODUCT((E8:E31*F8:F31*(1-G8:G31/100))*H8:H31/100)`
- `H34`: Total Final
- `I34`: `=I32+I33`

## Hoja `Historial`

Fila 1 (encabezados):

`FechaGuardado | Numero | Cliente | FechaCotizacion | CantItems | Subtotal | IVA | Total | Usuario`

## Hoja `Impresion_A4`

Diseño para impresión A4 (encabezado/logo, datos de cliente, tabla y total).

---

## 3) Formato y UX (copiar look del sistema)

- Encabezados y botones en `#5c3a8c` con texto blanco.
- Fondos de panel suaves en `#f0f0f2`.
- Bordes finos gris suave.
- Alternar filas de detalle con color muy tenue.
- Ocultar cuadrícula en `Cotizador` e `Impresion_A4`.

---

## 4) Validaciones recomendadas

En `Cotizador`:
- `E8:E31` (Cantidad): número decimal > 0.
- `G8:G31` (Desc%): entre 0 y 100.
- `H8:H31` (IVA%): entre 0 y 100.

En `B8:B31` (Código): lista desplegable desde `BD_Productos!A:A` (si usás rango con nombre, mejor).

---

## 5) Instalar macros VBA

1. `ALT + F11` (Editor VBA)
2. Botón derecho en VBAProject → `Import File...`
3. Importar archivo: `modCotizador.bas`
4. Guardar (`Ctrl + S`)

---

## 6) Crear botones y asignar macros

En hoja `Cotizador`, pestaña **Desarrollador** → **Insertar** → **Botón (Control de formulario)**

Crear y asignar:

- Botón “Nuevo” → `NuevoCotizador`
- Botón “Agregar línea” → `AgregarLinea`
- Botón “Limpiar” → `LimpiarCotizador`
- Botón “Guardar historial” → `GuardarEnHistorial`
- Botón “Preparar impresión” → `PrepararImpresionA4`
- Botón “Exportar PDF” → `ExportarPDF`

---

## 7) Flujo operativo diario

1. Cargar cliente + fecha.
2. Elegir códigos de producto (descripción/unidad/precio se completan).
3. Ajustar cantidad y descuentos.
4. Guardar historial.
5. Preparar impresión y exportar PDF.
6. Nuevo cotizador para siguiente operación.

---

## 8) Control de numeración automática

- El número se arma como: `Prefijo-PuntoVenta-Numero8Digitos`
- Ejemplo: `COT-0001-00000025`
- Al guardar historial:
  - incrementa `Config!B5`
  - deja el número listo en `Cotizador!H2`

---

## 9) Sugerencia de respaldo

- Guardar copia diaria del `.xlsm` con fecha.
- Mantener backup de la carpeta PDF configurada.
