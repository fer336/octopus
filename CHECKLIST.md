# 📋 CHECKLIST - Tareas Pendientes

---

## 🔜 Para mañana

### 1. Editar Borrador — Productos
- [ ] Cuando se edita un borrador, el modal solo muestra los productos que ya tenía la orden
- [ ] Debe volver al paso 1 (filtros) para que el usuario pueda cargar TODOS los productos del proveedor
- [ ] El borrador debería pre-rellenar los filtros (proveedor/categoría) y arrancar desde el paso 2 con todos los productos cargados, marcando los que ya estaban en la orden con su conteo y cantidad previos

---

### 2. PDF Orden de Pedido — Mejoras de diseño
- [ ] Quitar las columnas "Stock Sistema" y "Contado" — no se necesitan en la orden impresa
- [ ] Agregar columna Precio de Lista del producto
- [ ] Agregar columna Bonificaciones (ej: 10% + 5%)
- [ ] Orden de columnas: Código | Descripción | Categoría | P. Lista | Bonificaciones | P. Costo | IVA % | Cant. Pedir | Subtotal | Precio Final (con IVA)
- [ ] En vez de un bloque/rectángulo de totales al final, integrar el detalle dentro de las propias filas (diseño más compacto)
- [ ] Mantener estilo blanco y negro, sin rellenos, solo contornos

---

## ✅ Completado hoy (24/02/2026)

- [x] PDF Planilla de Conteo — blanco y negro, solo contornos, sin colores
- [x] PDF Planilla de Conteo — filas compactas (7mm), textos más grandes
- [x] PDF Planilla de Conteo — columnas Categoría, Proveedor y Stock del mismo ancho
- [x] PDF Planilla de Conteo — quitar columna "Diferencia"
- [x] PDF Planilla de Conteo — agregar columna "A Pedir"
- [x] PDF Orden de Pedido — blanco y negro, sin rellenos ni colores
- [x] Modal Nueva Orden — fix bug tabla vacía en paso 2 (conteo)
- [x] Modal Nueva Orden — fix "Atrás" ya no borra el progreso del conteo
- [x] Modal Nueva Orden — agregar columnas Bonificaciones, Precio Costo y Subtotal en paso 2
- [x] Modal Nueva Orden — botón "Guardar Borrador" en paso 3
- [x] Modal Nueva Orden — botón "Confirmar Orden" separado del borrador
- [x] Modal Editar Borrador — modo edición pre-carga los ítems del borrador en paso 3
- [x] Modal Detalle Orden — botón "Editar Borrador" (solo para borradores)
