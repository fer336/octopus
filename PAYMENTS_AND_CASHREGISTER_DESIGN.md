# 💰 Diseño: Métodos de Pago y Cierre de Caja

## 📋 Objetivo

Implementar un sistema completo de gestión de pagos y control de caja que permita:

1. **Registrar métodos de pago** al generar facturas/remitos
2. **Apertura de caja** al inicio del día con monto inicial
3. **Cierre de caja** al final del día con:
   - Desglose por método de pago
   - Diferencias entre esperado vs real
   - Total facturado del día

---

## 🏗️ Arquitectura de Datos

### **Tabla: `payment_methods`** (Catálogo de métodos)

```sql
CREATE TABLE payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    name VARCHAR(100) NOT NULL,  -- "Efectivo", "Débito", "Crédito", "Transferencia"
    code VARCHAR(20) NOT NULL,   -- "CASH", "DEBIT", "CREDIT", "TRANSFER"
    is_active BOOLEAN DEFAULT TRUE,
    requires_reference BOOLEAN DEFAULT FALSE,  -- Si requiere N° de transacción
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(business_id, code)
);
```

**Métodos por defecto:**
- Efectivo (CASH)
- Débito (DEBIT)
- Crédito (CREDIT)
- Transferencia (TRANSFER)
- Mercado Pago (MP)
- Cheque (CHECK)

---

### **Tabla: `voucher_payments`** (Pagos de un comprobante)

```sql
CREATE TABLE voucher_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    payment_method_id UUID NOT NULL REFERENCES payment_methods(id),
    amount NUMERIC(12, 2) NOT NULL,  -- Monto pagado con este método
    reference VARCHAR(100),           -- N° de transacción, cheque, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT positive_amount CHECK (amount > 0)
);
```

**Ejemplo:**
```
Factura #123 - Total: $10,000
Pagos:
  - Efectivo: $5,000
  - Débito: $3,000
  - Transferencia: $2,000 (Ref: TRX-ABC123)
```

---

### **Tabla: `cash_registers`** (Cajas)

```sql
CREATE TABLE cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    opened_by UUID NOT NULL REFERENCES users(id),
    closed_by UUID REFERENCES users(id),
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP,
    
    -- Montos de apertura
    opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- Efectivo inicial
    
    -- Montos esperados (calculados del sistema)
    expected_cash NUMERIC(12, 2),      -- Efectivo esperado
    expected_debit NUMERIC(12, 2),     -- Débito esperado
    expected_credit NUMERIC(12, 2),    -- Crédito esperado
    expected_transfer NUMERIC(12, 2),  -- Transferencia esperada
    expected_other NUMERIC(12, 2),     -- Otros métodos
    expected_total NUMERIC(12, 2),     -- Total esperado
    
    -- Montos reales (ingresados al cerrar)
    real_cash NUMERIC(12, 2),
    real_debit NUMERIC(12, 2),
    real_credit NUMERIC(12, 2),
    real_transfer NUMERIC(12, 2),
    real_other NUMERIC(12, 2),
    real_total NUMERIC(12, 2),
    
    -- Diferencias
    diff_cash NUMERIC(12, 2),     -- = real_cash - expected_cash
    diff_debit NUMERIC(12, 2),
    diff_credit NUMERIC(12, 2),
    diff_transfer NUMERIC(12, 2),
    diff_other NUMERIC(12, 2),
    diff_total NUMERIC(12, 2),
    
    notes TEXT,  -- Observaciones del cierre
    status VARCHAR(20) DEFAULT 'OPEN',  -- OPEN, CLOSED
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 📊 Flujo de Trabajo

### **1. Apertura de Caja**

```
Usuario: Cajero/Admin
Acción: 
  1. Ingresa al sistema
  2. Click "Abrir Caja"
  3. Ingresa monto inicial de efectivo: $5,000
  4. Click "Confirmar Apertura"

Backend:
  - Verificar que NO haya una caja abierta
  - Crear registro en cash_registers:
      opened_by = current_user
      opened_at = NOW()
      opening_cash = $5,000
      status = 'OPEN'
```

---

### **2. Registro de Venta con Métodos de Pago**

```
Usuario: Vendedor
Acción:
  1. Genera una factura de $10,000
  2. Modal de confirmación se abre
  3. Sección "Métodos de Pago":
     ┌────────────────────────────────┐
     │ ✓ Efectivo       [ $5,000 ]   │
     │ ✓ Débito         [ $3,000 ]   │
     │ ✓ Transferencia  [ $2,000 ]   │
     │   Ref: TRX-ABC123              │
     │ ─────────────────────────────  │
     │ Total asignado: $10,000 ✅     │
     └────────────────────────────────┘
  4. Click "Emitir Factura"

Backend:
  - Crear voucher
  - Crear voucher_payments:
      - {method: CASH, amount: 5000}
      - {method: DEBIT, amount: 3000}
      - {method: TRANSFER, amount: 2000, ref: "TRX-ABC123"}
  - Validar que suma = total de la factura
```

---

### **3. Cierre de Caja**

```
Usuario: Cajero/Admin
Acción:
  1. Click "Cerrar Caja"
  2. Sistema muestra:
     ┌───────────────────────────────────────┐
     │ Resumen del Día                       │
     ├───────────────────────────────────────┤
     │ Apertura: 08:30 AM                    │
     │ Efectivo inicial: $5,000              │
     │                                       │
     │ VENTAS DEL DÍA:                       │
     │ - 25 facturas                         │
     │ - 10 remitos                          │
     │ - Total facturado: $150,000           │
     │                                       │
     │ ESPERADO POR MÉTODO DE PAGO:          │
     │ - Efectivo:       $80,000             │
     │ - Débito:         $40,000             │
     │ - Crédito:        $20,000             │
     │ - Transferencia:  $10,000             │
     │ ─────────────────────────────────     │
     │ Total:           $150,000             │
     └───────────────────────────────────────┘
  
  3. Usuario ingresa montos REALES contados:
     ┌───────────────────────────────────────┐
     │ INGRESE MONTOS REALES:                │
     ├───────────────────────────────────────┤
     │ Efectivo:       [ $79,500 ]  ⚠️ -$500 │
     │ Débito:         [ $40,000 ]  ✅       │
     │ Crédito:        [ $20,200 ]  ⚠️ +$200 │
     │ Transferencia:  [ $10,000 ]  ✅       │
     │ ─────────────────────────────────     │
     │ Total:          $149,700  ⚠️ -$300    │
     │                                       │
     │ Observaciones:                        │
     │ [Faltaron $500 en efectivo...]        │
     │                                       │
     │ [Cancelar]  [Confirmar Cierre]        │
     └───────────────────────────────────────┘

Backend:
  - Obtener caja abierta del día
  - Calcular totales esperados (suma de voucher_payments del día)
  - Guardar montos reales
  - Calcular diferencias
  - Actualizar cash_register:
      closed_by = current_user
      closed_at = NOW()
      expected_* = calculados
      real_* = ingresados
      diff_* = real - expected
      status = 'CLOSED'
```

---

## 🔧 Implementación

### **FASE 1: Métodos de Pago (AHORA)**

#### Backend:
1. ✅ Crear modelo `PaymentMethod`
2. ✅ Crear modelo `VoucherPayment`
3. ✅ Migration para ambas tablas
4. ✅ Seedear métodos de pago por defecto
5. ✅ Endpoint `GET /payment-methods` (listar activos)
6. ✅ Modificar endpoint de creación de voucher para recibir `payments: [{method_id, amount, reference}]`
7. ✅ Validar que suma de payments = total del voucher

#### Frontend:
1. ✅ Agregar sección "Métodos de Pago" en modal de confirmación de venta
2. ✅ Lista de checkboxes con métodos disponibles
3. ✅ Input de monto por cada método seleccionado
4. ✅ Input de referencia (opcional, solo para algunos métodos)
5. ✅ Validación en tiempo real: suma = total
6. ✅ Indicador visual de diferencia

---

### **FASE 2: Apertura/Cierre de Caja (DESPUÉS)**

#### Backend:
1. ✅ Crear modelo `CashRegister`
2. ✅ Migration
3. ✅ Endpoint `POST /cash-register/open` - Abrir caja
4. ✅ Endpoint `POST /cash-register/close` - Cerrar caja
5. ✅ Endpoint `GET /cash-register/current` - Caja actual
6. ✅ Endpoint `GET /cash-register/history` - Historial de cajas
7. ✅ Endpoint `GET /cash-register/{id}/pdf` - **PDF de cierre de caja**
8. ✅ Servicio para calcular totales esperados del día
9. ✅ Servicio PDF para generar reporte de cierre

#### Frontend:
1. ✅ Página `/cash-register`
2. ✅ Modal de Apertura de Caja
3. ✅ Modal de Cierre de Caja con inputs de montos reales
4. ✅ **Abrir PDF automáticamente al cerrar caja**
5. ✅ Dashboard de caja actual (sidebar indicator)
6. ✅ Historial de cierres con botón "Ver PDF"

---

## 🎯 Validaciones

### Métodos de Pago:
- ✅ Suma de payments debe igualar total del voucher
- ✅ No permitir montos negativos
- ✅ Métodos de pago deben estar activos
- ✅ Referencia obligatoria para ciertos métodos (configurable)

### Apertura de Caja:
- ✅ Solo 1 caja abierta a la vez por negocio
- ✅ Monto inicial >= 0
- ✅ Solo usuarios autorizados

### Cierre de Caja:
- ✅ Debe haber una caja abierta
- ✅ Solo puede cerrar quien abrió o un admin
- ✅ Montos reales >= 0
- ✅ Calcular diferencias automáticamente
- ✅ Observaciones obligatorias si hay diferencias > $100

---

## 🚀 Orden de Implementación

### **Paso 1: Modelos y Migraciones (Backend)**
```
1. payment_methods (catálogo)
2. voucher_payments (relación N:N con vouchers)
3. cash_registers (cajas)
```

### **Paso 2: Servicios y Endpoints (Backend)**
```
1. PaymentMethodService + endpoints básicos
2. Modificar VoucherService.create() para aceptar payments
3. CashRegisterService completo
```

### **Paso 3: Frontend - Métodos de Pago**
```
1. Modificar modal de confirmación en Sales.tsx
2. Agregar selector de métodos de pago
3. Validación de suma = total
```

### **Paso 4: Frontend - Caja**
```
1. Crear página CashRegister.tsx
2. Modales de apertura/cierre
3. Reporte de cierre
```

---

## 📄 PDF de Cierre de Caja

### **Contenido del PDF:**

```
┌─────────────────────────────────────────────────────┐
│                  CIERRE DE CAJA                     │
│                                                     │
│  Negocio: Medano S.A                                │
│  Fecha: 14/02/2026                                  │
│  Cajero: Juan Pérez                                 │
│                                                     │
│  ══════════════════════════════════════════════     │
│  APERTURA DE CAJA                                   │
│  ══════════════════════════════════════════════     │
│  Hora: 08:30 AM                                     │
│  Efectivo inicial: $5,000.00                        │
│                                                     │
│  ══════════════════════════════════════════════     │
│  MOVIMIENTOS DEL DÍA                                │
│  ══════════════════════════════════════════════     │
│  Total facturas emitidas: 25                        │
│  Total remitos: 10                                  │
│  Total facturado: $150,000.00                       │
│                                                     │
│  ══════════════════════════════════════════════     │
│  DESGLOSE POR MÉTODO DE PAGO                        │
│  ══════════════════════════════════════════════     │
│                                                     │
│  Método          Esperado      Real      Diferencia │
│  ─────────────────────────────────────────────────  │
│  Efectivo        $80,000.00   $79,500.00   -$500.00│
│  Débito          $40,000.00   $40,000.00     $0.00 │
│  Crédito         $20,000.00   $20,200.00   +$200.00│
│  Transferencia   $10,000.00   $10,000.00     $0.00 │
│  ─────────────────────────────────────────────────  │
│  TOTAL          $150,000.00  $149,700.00   -$300.00│
│                                                     │
│  ══════════════════════════════════════════════     │
│  OBSERVACIONES                                      │
│  ══════════════════════════════════════════════     │
│  Faltaron $500 en efectivo por cambio entregado     │
│  a cliente sin registro.                            │
│                                                     │
│  ──────────────────────────────────────────────     │
│  Cierre realizado por: Juan Pérez                   │
│  Hora de cierre: 18:45 PM                           │
│                                                     │
│  Firma: _____________________                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### **Template HTML:**
- `backend/app/templates/pdf/cash_register_closure.html`
- Diseño simple y legible para imprimir
- Incluir gráfico de barras (opcional) con diferencias
- Espacio para firma del cajero

### **Generación:**
- Al confirmar cierre → Generar PDF automáticamente
- Almacenar referencia en `cash_registers.pdf_path` (opcional)
- Abrir en modal para imprimir/guardar
- Disponible en historial para re-descargar

---

## 📝 Notas Importantes

- **Métodos de pago son opcionales** en cotizaciones y remitos
- **Métodos de pago son OBLIGATORIOS** en facturas
- **Una factura puede tener múltiples métodos** (pago mixto)
- **El cierre de caja es irreversible** una vez confirmado
- **Solo se pueden abrir cajas nuevas** si la anterior está cerrada

---

**Fecha**: 2026-02-14  
**Estado**: Diseño completo  
**Próximo paso**: Implementar FASE 1 (Métodos de Pago)
