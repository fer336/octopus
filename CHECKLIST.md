# 📋 CHECKLIST - Tareas Pendientes

## ✅ COMPLETADO

### 1. 🛒 Mejoras en Pantalla de Ventas - ✅ COMPLETADO

#### **Implementación Final:**
- [x] **Click simple → Selecciona fila (azul)**
- [x] **Enter o Doble Click → Toggle selección (verde con ✓)**
- [x] **ESC → Abre modal de configuración**
- [x] **Modal con inputs de cantidad y descuento editables**
- [x] **Enter navega entre campos automáticamente**
- [x] **Último Enter → Agrega al carrito**
- [x] **Limpieza automática al confirmar (sin propagación de eventos)**
- [x] **Modal bonito para "Borrador guardado"** (sin alert nativo)

#### **Archivos a Modificar:**
```
frontend/src/pages/Sales.tsx
frontend/src/components/sales/ProductSelector.tsx (si existe)
```

#### **Comportamiento Esperado:**
```
1. Usuario hace click en "Grifo" → Se agrega a la lista (sin modal)
2. Usuario hace click en "Codo" → Se agrega a la lista
3. Usuario hace click en "Tubo" → Se agrega a la lista
4. Usuario ve en panel lateral: 3 productos agregados
5. Usuario presiona ESC o click "Confirmar"
6. → Modal se abre con los 3 productos para editar cantidades/precios
```

---

### 2. 📄 Notas de Crédito - Facturación Electrónica AFIP - ✅ COMPLETADO

#### **Investigación Requerida:**
- [x] Leer documentación de **AFIPSDK** sobre Notas de Crédito
- [x] Revisar endpoint de MrBot API para NC
- [x] Identificar campos requeridos vs opcionales
- [x] Entender relación NC → Factura Original

#### **Tipos de Comprobante (AFIP):**
```
Nota de Crédito A: CbteTipo = 3
Nota de Crédito B: CbteTipo = 8
Nota de Crédito C: CbteTipo = 13
```

#### **Implementación Backend:**

**a) Modelos y Schemas:**
- [x] Verificar si tabla `vouchers` soporta NC (campo `voucher_type`)
- [x] Crear schema `CreditNoteCreate` en `schemas/credit_note.py`
- [x] Agregar campos:
  ```python
  original_voucher_id: UUID  # Factura a la que anula/modifica
  reason: str  # Motivo de la NC
  items: List[CreditNoteItem]  # Productos con cantidades a devolver
  ```

**b) Service AFIP:**
- [x] Crear método `emit_credit_note()` en `afip_sdk_service.py`
- [x] Implementar validaciones:
  - NC no puede ser mayor al monto original ✅
  - Factura original debe estar aprobada (tener CAE) ✅
  - Fecha de NC >= Fecha de Factura Original ✅
  - Cantidad NC <= Cantidad original por producto ✅
- [x] Construir JSON según estructura AFIP con CbtesAsoc
- [x] Almacenar CAE de la NC en la DB

**c) Endpoints:**
- [x] `POST /vouchers/{voucher_id}/credit-note` - Crear NC desde una factura
- [x] Validar que la factura original exista y tenga CAE

**d) Estructura JSON para NC (basarse en AFIPSDK/MrBot):**
```json
{
  "Auth": { ... },
  "FeCAEReq": {
    "FeCabReq": {
      "CantReg": 1,
      "PtoVta": 1,
      "CbteTipo": 3,  // NC A, B, o C
    },
    "FeDetReq": {
      "Concepto": 1,
      "CbtesAsoc": [  // IMPORTANTE: Asociar con factura original
        {
          "Tipo": 6,  // Tipo de comprobante original
          "PtoVta": 1,
          "Nro": 123  // Número de factura original
        }
      ],
      "DocTipo": 96,
      "DocNro": "12345678",
      "Items": [...],
      "ImpTotal": -1210.00,  // NEGATIVO para NC
      "ImpNeto": -1000.00,
      "ImpIVA": -210.00,
      ...
    }
  }
}
```

#### **Implementación Frontend:**

**a) UI en Comprobantes:**
- [x] Botón "Generar NC" en cada factura de la tabla (solo si tiene CAE)
- [x] Modal `CreditNoteModal.tsx`:
  - Mostrar datos de factura original (read-only) ✅
  - Tabla de items con checkboxes (seleccionar qué devolver) ✅
  - Input de cantidades (parcial o total) ✅
  - Input de motivo (obligatorio) ✅
  - Preview del monto total de la NC ✅
  - Botones: Cancelar / Emitir NC ✅

**b) Validaciones Frontend:**
- [x] No permitir NC de comprobantes sin CAE ✅
- [x] No permitir NC mayor al monto original ✅
- [x] Validar que haya al menos 1 item seleccionado ✅
- [x] Validar que cantidad <= cantidad original ✅

**c) Service:**
- [x] Crear `creditNoteService.ts` ✅
- [x] Método: `create()` ✅

#### **Archivos Creados/Modificados:**
```
Backend: ✅
  ✅ app/services/afip_sdk_service.py (método emit_credit_note)
  ✅ app/services/voucher_service.py (método create_credit_note)
  ✅ app/schemas/credit_note.py (NUEVO)
  ✅ app/routers/vouchers.py (endpoint POST /credit-note)

Frontend: ✅
  ✅ src/components/vouchers/CreditNoteModal.tsx (NUEVO)
  ✅ src/api/creditNoteService.ts (NUEVO)
  ✅ src/pages/Vouchers.tsx (botón NC agregado)
```

---

## 🎉 **NOTAS DE CRÉDITO - RESUMEN DE IMPLEMENTACIÓN**

### **✅ Backend Completo:**
1. **Schema `CreditNoteCreate`** con validaciones de Pydantic
2. **Servicio `create_credit_note()`** con validaciones:
   - Factura existe y es factura (no cotización/remito)
   - Tiene CAE (emitida en AFIP)
   - Productos existen en factura original
   - Cantidades NC <= Cantidades originales
   - Total NC <= Total factura original
3. **Método `emit_credit_note()`** en AfipSdkService:
   - Usa `CbtesAsoc` para referenciar factura original
   - Montos en valores absolutos
   - Determina tipo automático (NC_A/B/C)
4. **Endpoint `POST /vouchers/{voucher_id}/credit-note`**
   - Crea NC en DB
   - Emite en AFIP
   - Si falla AFIP → Rollback
   - Retorna NC con CAE

### **✅ Frontend Completo:**
1. **Servicio `creditNoteService.ts`** con tipos TypeScript
2. **Modal `CreditNoteModal.tsx`** con:
   - Datos de factura original (read-only)
   - Tabla con checkboxes para seleccionar items
   - Inputs de cantidad con validación
   - Textarea de motivo
   - Resumen con totales calculados en tiempo real
   - Botón "Emitir NC" (rojo, requiere selección + motivo)
3. **Botón en página Vouchers:**
   - Ícono RotateCcw (naranja)
   - Solo visible en facturas con CAE
   - Abre modal al hacer click

### **🔑 Puntos Técnicos Clave:**
- ✅ Montos NEGATIVOS en DB, valores absolutos a AFIP
- ✅ `CbtesAsoc` obligatorio con tipo, punto venta y número de factura original
- ✅ Tipo de NC coincide con tipo de factura (A→A, B→B, C→C)
- ✅ Validaciones en backend Y frontend
- ✅ Rollback automático si falla AFIP
- ✅ Toast de confirmación al emitir

---

## 🔧 Fixes Menores Pendientes

### 3. Fix Import en suppliers.py - ✅ COMPLETADO
- [x] Agregar `from sqlalchemy import select` en `routers/suppliers.py` línea 144
```python
from sqlalchemy import select
```

### 4. Verificar Actualización de Precios
- [ ] Testear que los cálculos de precio final sean correctos
- [ ] Verificar que las acciones rápidas funcionen
- [ ] Probar con categoría/proveedor

---

## 📚 Recursos para Mañana

### **Documentación AFIP/MrBot:**
- [ ] Leer: https://api-facturacion-electronica.mrbot.com.ar/docs (si existe)
- [ ] Revisar AGENTS.md sección "AGENTE 4: Especialista en Facturación Electrónica"
- [ ] Buscar ejemplos de JSON de Nota de Crédito en la doc de AFIPSDK

### **Referencias en el Proyecto:**
```
PRD.md - Sección de comprobantes
AGENTS.md - Agente 4 (Facturación Electrónica)
backend/app/services/arca_service.py (si existe)
backend/app/routers/vouchers.py
```

---

## ✅ Orden de Ejecución Sugerido para Mañana:

1. **🛒 Ventas** (1-2 horas)
   - Implementar selección múltiple sin modal
   - Agregar preview lateral
   - Modal solo al presionar ESC

2. **📄 Notas de Crédito** (3-4 horas)
   - Investigar documentación AFIP
   - Implementar backend (service + endpoints)
   - Crear UI (modal + botones)
   - Testing con ambiente de homologación

3. **🔧 Fixes** (30 min)
   - Fix import en suppliers.py
   - Verificaciones finales

---

## 📝 Notas Importantes

**Para Notas de Crédito:**
- ⚠️ Los importes en NC van **NEGATIVOS** (ImpTotal: -1210.00)
- ⚠️ Debe tener referencia a la factura original (`CbtesAsoc`)
- ⚠️ El tipo de NC (A/B/C) debe coincidir con el tipo de factura original
- ⚠️ AFIP valida que el monto de NC no supere el de la factura

**Para Ventas:**
- 💡 Considerar usar estado local para productos "en selección"
- 💡 Panel lateral puede ser un componente `SelectedProductsPanel.tsx`
- 💡 ESC key listener con `useEffect` y event listener

---

## 🎯 Resultado Esperado al Final del Día

- ✅ Ventas con selección múltiple fluida
- ✅ Notas de Crédito funcionando con AFIP
- ✅ Sistema completo de facturación (Facturas + NC)
- ✅ Todos los bugs menores resueltos

---

**Fecha:** 2026-02-13  
**Estimación Total:** 4-6 horas  
**Prioridad:** Alta

---

¡Nos vemos mañana hermano! 🚀
