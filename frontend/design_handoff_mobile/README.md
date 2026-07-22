# Handoff: OctopusTrack — App mobile

## Overview
Versión mobile (app nativa) de OctopusTrack: dashboard, catálogo/productos, nueva venta
(cotización/remito/factura), caja diaria, cuenta corriente, comprobantes, asistente IA y un
menú lateral con todos los módulos del ERP. Pensada para el comerciante que la usa en ráfagas
cortas, parado en el mostrador.

## Sobre los archivos de este paquete
`OctopusTrack Mobile.dc.html` es una **referencia de diseño hecha en HTML** (un prototipo que
muestra el aspecto y comportamiento buscados), **no** código de producción para copiar tal cual.
La tarea es **recrear este diseño dentro de tu codebase React/TypeScript existente**
(`frontend/src`), usando tus patrones (componentes, Tailwind, lucide-react, react-router) — no
embeber el HTML.

El prototipo está construido con estilos inline y SVGs de Lucide pegados a mano. Al portarlo:
- Reemplazá los estilos inline por **clases Tailwind** con tus tokens (`bg-primary-600`,
  `text-primary-700`, `rounded-2xl`, etc.). Los valores ya coinciden con tu `tailwind.config.js`.
- Reemplazá los `<svg>` inline por **`lucide-react`** (los nombres están listados abajo).
- Usá tus fuentes ya cargadas: **Bricolage Grotesque** (display/números) y **Figtree** (texto).

## Fidelidad
**Alta fidelidad (hifi).** Colores, tipografía, espaciado e interacciones son finales.
Recrealo pixel-perfect con tus librerías. Las medidas y hex exactos están más abajo.

## Stack sugerido para el port
- React + TypeScript (igual que `frontend/src`).
- **Tailwind** con tus escalas `primary-*` / `tool-*` / `flow-*` y fuentes `font-display`/`font-sans`.
- **lucide-react** para todos los íconos (ya lo usás en el landing).
- Router: una vista por pantalla + un layout `MobileShell` con header, contenido scrolleable y tab bar.
- Estado local con `useState`/`useReducer` (carrito, tab activa, overlays). No hace falta lib extra.

---

## Tokens de diseño (exactos)

### Color
| Uso | Hex | Token Tailwind |
|---|---|---|
| Fondo de página | `#f0f0f2` | `bg-primary` / `--brand-white` |
| Tarjeta (light) | `#ffffff` | `bg-white` |
| Borde hairline | `#ece6f6` | `border-primary-100` |
| Borde input | `#e7e0f2` | `border-[#e7e0f2]` |
| Tinta / texto primario | `#121325` | `text-primary` / `--brand-black` |
| Texto secundario (lila) | `#5c3a8c` | `text-primary-700` |
| Texto muted | `#7b6b95` / `#9089a0` | `--text-muted` |
| Acento Track (default) | `#7c5ca8` (strong), `#5c3a8c` (mid), `#2f1d4d` (ink), `#9d84bf` (bright), `#ece6f6` (tint) | `primary-600/700/...` |
| Acento Tool (verde) | `#3d8c47` (strong), `#1f5a28` (mid), `#5aad62` (bright), `#e0f5e2` (tint) | `tool-*` |
| Acento Flow (azul) | `#2563eb` (strong), `#1d4ed8` (mid), `#3b82f6` (bright), `#dbeafe` (tint) | `flow-*` |
| Caja / éxito (verde) | gradiente `#1a3d1f → #3d8c47`, highlight `#7ecf86` | `--success` |
| Peligro / debe | `#dc2626` | `--danger` |
| Warning / pendiente | `#f97316` | `--warning` |

> El **acento es conmutable por producto** (Track lila / Tool verde / Flow azul). En el prototipo
> es la prop `accent`. En React: un contexto o prop que mapea a un objeto de colores
> (`ink/mid/strong/bright/tint/shadow`) y se aplica a header, FAB, tab activa, botones primarios y chips.

### Tipografía
- **Display:** Bricolage Grotesque, weight 800. Títulos de header (21px), números grandes/hero
  (26–38px), montos en tarjetas (16–22px). Tracking `-0.01em` a `-0.02em`, line-height ~1.05.
- **Body:** Figtree. Texto 13–14px, labels 11–12px, eyebrows 10–11px en MAYÚSCULAS con
  `letter-spacing` 0.08–0.16em.
- **Mono** (system mono): códigos de producto y números de comprobante a 10.5–11.5px.

### Radios
- Inputs / botones chicos: `13px`. Botones / chips: `11–13px`. Tarjetas: `15–16px`.
- Hero / sheets: `18–20px` (sheets `26px` arriba). Pills/badges: `999px`. Avatares: `12px` o círculo.

### Sombras (tintadas al acento)
- Tarjeta: borde hairline + sombra muy suave. FAB/botón primario: `0 8px 18px rgba(92,58,140,.35)`.
- Hero verde: `0 14px 30px rgba(26,61,31,.30)`.

### Espaciado
- Padding de pantalla: `16px` lateral. Gap entre tarjetas de lista: `9px`. Padding interno tarjeta: `13–14px`.
- Header: `padding-top` ~54px (safe area), `16px` abajo. Tab bar: alto ~64px + `padding-bottom` 24px (home indicator).

---

## Layout general (MobileShell)
Columna de altura completa:
1. **Header** (fijo, gradiente del acento `linear-gradient(140deg, ink, mid)` con dot-grid sutil
   enmascarado en la esquina sup. der.): botón menú (☰), nombre del comercio (eyebrow) + título de
   pantalla (display 21px), botón IA (sparkles) y avatar con iniciales.
2. **Contenido** scrolleable (`overflow-y:auto`), una vista según la tab/ruta activa.
3. **Tab bar** (fija, blanca translúcida con blur, borde superior `#e7e0f2`): 5 slots —
   Inicio, Productos, **Vender** (FAB central elevado, círculo con gradiente del acento y badge de
   cantidad del carrito), Caja, Cuenta. Tab activa en color del acento; inactivas `#a59fb5`.
4. **Overlays** absolutos sobre todo: menú lateral, sheet de IA, sheet de movimiento de caja, scanner.

---

## Pantallas / Vistas

### 1. Inicio (Dashboard)
- **Propósito:** ver cómo viene el día de un vistazo.
- **Componentes (en orden):**
  - Saludo: "Hola **Fernando** — martes 30 de junio".
  - **Hero verde "Ingresado en caja"** (gradiente `#1a3d1f→#3d8c47`, blob lila difuminado en esquina):
    label con ícono `CreditCard`, monto `$624.563,65` en display 38px, línea con ícono `TrendingUp`,
    y fila de 3 sub-stats (Facturado / Pendiente / Facturas) separada por borde superior translúcido.
  - **2 tarjetas métricas** (grid 1fr/1fr): "Ventas hoy" (`ShoppingCart`, `$116.320,00`) y
    "Comprob." (`FileText`, `8`).
  - **Composición de ingresos:** donut con `conic-gradient` (Facturas 78% verde, Acopios 14% acento,
    Otros 8% lila claro) + leyenda. Centro blanco con "$624k".
  - **Accesos rápidos** (grid 2×2): Nueva venta, Consultar precio, Caja diaria, Cuenta corriente.
    Cada uno: medallón redondeado con ícono del acento + título + subtítulo. Navegan a su pantalla.
  - **Actividad reciente:** lista de tarjeta con badge de 2 letras (FB/CO/$/RE), título, subtítulo,
    monto y tiempo relativo.

### 2. Productos
- **Propósito:** consultar precio y stock, agregar al carrito.
- **Componentes:**
  - Barra de búsqueda (`Search`) + botón **scanner** (`ScanLine`, gradiente del acento) que abre overlay.
  - Chips de categoría horizontales scrolleables (Todas, Plomería, Grifería, Sanitarios, Ferretería, Insumos).
    Chip activo: relleno del acento, texto blanco.
  - Contador "N productos".
  - Lista de tarjetas de producto: código (badge mono lila), badge "Stock bajo" (naranja) si `stock < 12`,
    descripción, línea `marca · Stock N · Lista $...`, a la derecha precio venta (display) + botón **+** (acento).
- **Datos de ejemplo:** 12 productos de sanitarios/ferretería (ver `products` en el HTML).

### 3. Nueva venta (Ventas) — pantalla insignia
- **Propósito:** armar cotización/remito/factura.
- **Componentes:**
  - Selector de **cliente** (tarjeta con ícono usuario, "Consumidor final", chevron).
  - Chips de **tipo de comprobante** scrolleables: Cotización, Remito, Factura, Cta Cte, Acopio. Activo = acento.
  - Encabezado "Productos (N)" + botón "Agregar +" (va a Productos).
  - **Líneas del carrito:** cada una con código, descripción, botón borrar (`Trash2`), stepper de cantidad
    (− / valor / +), precio unitario y subtotal de línea (display). Empty state si no hay items.
  - **Barra de totales fija** (sobre la tab bar): Subtotal sin IVA, IVA (21%), **Total** (display 26px) y
    botón CTA con gradiente del acento (texto según tipo: "Generar", "Facturar", etc.) + `ArrowRight`.
- **Cálculo:** `subtotal = Σ qty·price`; `iva = subtotal·0.21`; `total = subtotal + iva`. Formato AR.

### 4. Caja diaria
- **Componentes:**
  - Hero verde "Caja abierta" (dot pulsante), saldo actual (display 34px), botones "Movimiento"
    (abre sheet) y "Cerrar caja".
  - 2 tarjetas: Ingresos (verde) / Egresos (rojo).
  - Lista "Movimientos de hoy": ícono circular con flecha (abajo=ingreso verde / arriba=egreso rojo),
    label, `método · hora`, monto con signo.
  - **Sheet "Registrar movimiento":** toggle Ingreso/Egreso, monto, concepto, botón confirmar (acento).

### 5. Cuenta corriente
- **Componentes:**
  - Hero (gradiente del acento) "Total por cobrar" `$397.583,64` + "N clientes con saldo deudor".
  - Búsqueda de cliente.
  - Lista de clientes: avatar con iniciales (tint del acento), nombre, tipo, monto a la derecha
    (rojo=Debe / verde=A favor / gris=Al día) + estado.

### 6. Comprobantes
- **Componentes:**
  - Chips de filtro: Todos, Cotización, Remito, Factura.
  - Lista de tarjetas: badge de tipo (Factura=lila, Remito=azul, Cotización=ámbar), número mono,
    pill de estado a la derecha (Cobrado=verde, Pendiente=naranja, Vigente=lila), cliente, fecha, monto (display).

### 7. Menú lateral (todos los módulos)
- **Disparador:** botón ☰ en el header.
- **Aspecto:** drawer desde la izquierda, ~298px, **gradiente oscuro del acento**
  (`linear-gradient(168deg, ink, #150e29)`) — espejo del sidebar del ERP de escritorio.
- **Header del drawer:** tentáculo + "OctopusTrack" (display blanco) + nombre del comercio + cerrar.
- **Grupos** (con eyebrow en mayúsculas, texto blanco translúcido):
  - *General:* Dashboard
  - *Ventas y caja:* Ventas, Comprobantes, Métodos de pago, Caja diaria, Cuenta corriente, Acopios
  - *Catálogo e inventario:* Productos, Actualizar precios, Listas de precios, Inventario, Mercado Libre
  - *Análisis y ajustes:* Rentabilidad, Configuración
- Ítem activo: fondo `rgba(255,255,255,.14)`, texto blanco, punto del color `bright` a la derecha.
- **Footer:** versión mono "OctopusTrack v1.6.4" + "Salir" (`LogOut`).
- Los ítems con pantalla navegan; el resto van a una vista stub "módulo en adaptación".

### 8. Asistente IA (sheet)
- **Disparador:** botón sparkles del header.
- Bottom sheet con header del acento, hilo de mensajes (burbujas: usuario=acento a la derecha,
  IA=blanca a la izquierda), chips de preguntas sugeridas, e input + botón enviar (`Send`).
- En el prototipo las respuestas son canned (keyword-based). En producción: conectar a tu `aiService`.

### 9. Scanner (overlay)
- Fondo oscuro, marco con esquinas del color `bright` del acento y línea de escaneo. Botón "Cancelar".
- En producción: integrar tu lector real (el repo ya tiene `QrScanner`).

---

## Íconos (lucide-react)
`Menu` (header), `Sparkles` (IA), `CreditCard` (caja/métodos), `ShoppingCart` (ventas/vender),
`FileText`/`Receipt` (comprobantes), `TrendingUp` (actualizar precios/subir), `Search`, `ScanLine`,
`Plus`, `Minus`, `Trash2`, `ArrowRight`, `ChevronRight`, `X`, `Home`, `Package` (productos),
`Wallet` (caja), `Users` (cuenta), `Layers` (acopios), `List` (listas de precios), `Boxes` (inventario),
`ShoppingBag` (Mercado Libre), `BarChart3` (rentabilidad), `Settings`, `Send`, `LogOut`.
Stroke ~1.8–2, joins redondeados, grilla 24. Color = acento o muted.

## Estado (state) necesario
- `tab`: pantalla activa (`inicio | productos | ventas | caja | cuenta | comprobantes | stub`).
- `cart`: array `{ code, desc, qty, price }` — add/incrementar/decrementar(min 1)/quitar.
- `query`, `cat`: búsqueda y filtro de productos. `compFilter`: filtro de comprobantes. `docType`: tipo de comprobante en venta.
- `menuOpen`, `aiOpen`, `scanOpen`, `movOpen`: visibilidad de overlays. `aiMsgs`: hilo del chat.
- `accent`: producto activo (track/tool/flow) → mapa de colores.

## Formato de números (AR)
`n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` → `236.253,54`.
Prefijo `$`. IVA 21%.

## Assets
- `assets/tentacle.png` — logo tentáculo (header del menú, stub). Viene de tu design system / `octopus-landing/public`.
- `assets/wordmark.png` — wordmark "OctopusTrack" (negro, para superficies claras).
- `assets/mascot.png` — pulpo 3D (promo). Usá los PNG, no recrees el pulpo en SVG.
- `ios-frame.jsx` — solo para el preview en marco de iPhone; **no portar**, tu app real ya corre en el dispositivo.

## Archivos en este paquete
- `OctopusTrack Mobile.dc.html` — el prototipo completo (markup + lógica). Abrilo en el navegador para
  ver e interactuar. Es la fuente de verdad de medidas, colores y comportamiento.
