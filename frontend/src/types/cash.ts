/**
 * Tipos TypeScript para el módulo de Caja.
 */

export type CashRegisterStatus = 'OPEN' | 'CLOSED'
export type CashMovementType = 'SALE' | 'PAYMENT_RECEIVED' | 'INCOME' | 'EXPENSE'
export type CashPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK' | 'OTHER'

export const PAYMENT_METHOD_LABELS: Record<CashPaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  CHECK: 'Cheque',
  OTHER: 'Otro',
}

export const MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  SALE: 'Venta',
  PAYMENT_RECEIVED: 'Cobro cta. cte.',
  INCOME: 'Ingreso manual',
  EXPENSE: 'Egreso manual',
}

export interface CashMovement {
  id: string
  type: CashMovementType
  payment_method: CashPaymentMethod
  amount: number
  description: string
  voucher_id: string | null
  created_by: string
  created_at: string
}

export interface CashRegister {
  id: string
  business_id: string
  opened_by: string
  closed_by: string | null
  status: CashRegisterStatus
  /** true si status=OPEN y han pasado más de 24hs desde la apertura */
  is_expired: boolean
  opening_amount: number
  opened_at: string
  closed_at: string | null
  counted_cash: number | null
  difference: number | null
  difference_reason: string | null
  closing_pdf_path: string | null
  movements: CashMovement[]
  created_at: string
}

export interface PaymentMethodSummary {
  payment_method: CashPaymentMethod
  total_sales: number
  total_payments_received: number
  total_income: number
  total_expense: number
  net: number
}

export interface CashSummary {
  by_method: PaymentMethodSummary[]
  total_net: number
  expected_cash: number
}

/** Versión resumida de la caja para el historial (sin movimientos). */
export interface CashRegisterSummary {
  id: string
  status: CashRegisterStatus
  is_expired: boolean
  opening_amount: number
  opened_at: string
  closed_at: string | null
  difference: number | null
}

// ─── Requests ────────────────────────────────────────────────────────────────

export interface OpenCashRequest {
  opening_amount: number
}

export interface CloseCashRequest {
  counted_cash: number
  difference_reason?: string
}

export interface AddMovementRequest {
  type: 'INCOME' | 'EXPENSE'
  payment_method: CashPaymentMethod
  amount: number
  description: string
}
