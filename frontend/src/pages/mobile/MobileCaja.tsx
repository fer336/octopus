/**
 * Native mobile "Caja diaria" screen. Self-fetching via the existing
 * `useCash.ts` hooks (`useCurrentCash`/`useOpenCash`/`useCloseCash`/
 * `useAddMovement`/`useCashSummary`) — reused as-is, same service layer
 * desktop `Cash.tsx` already consumes, no new endpoint/hook invented.
 *
 * Three states:
 * - No open register (`GET /cash/current` -> null): "Abrir caja" empty
 *   state with an opening-amount input.
 * - Open register: green "Caja abierta" hero (current balance =
 *   `expected_cash` from the real `/cash/{id}/summary` endpoint, NOT a
 *   locally-recomputed guess), Ingresos/Egresos cards aggregated from the
 *   same summary's `by_method` totals, and a "Movimientos de hoy" list
 *   sourced directly from the register's own `movements[]` (already
 *   included in `GET /cash/current`, no extra call needed).
 * - "Registrar movimiento" sheet: the design handoff (README section 4)
 *   only shows Ingreso/Egreso + monto + concepto — it does NOT show a
 *   payment_method field. The backend's `POST /{id}/movements` REQUIRES
 *   `payment_method` (`CashMovementCreateRequest.payment_method`), so this
 *   screen adds a payment_method <select> beyond the mockup (same class of
 *   gotcha already hit and fixed for Acopio in PR4/MobileSales) to avoid a
 *   real runtime failure that mock-based tests would otherwise hide.
 * - "Cerrar caja" sheet: the backend's `CashCloseRequest.counted_cash` is
 *   optional (blank -> auto-uses the expected cash), but the frontend's own
 *   `CloseCashRequest` type (`types/cash.ts`) declares it as a required
 *   `number`, and desktop's `Cash.tsx` `CloseCashModal` never omits it
 *   either (`canSubmit` requires `countedCash !== ''`). This screen matches
 *   that same established frontend contract rather than inventing a blank/
 *   auto-close path the rest of the app doesn't have. When the counted
 *   amount differs from `expected_cash`, the backend requires
 *   `difference_reason` — mirrored locally via `hasClosingDifference`
 *   before enabling the confirm button, instead of discovering the 422 at
 *   submit time.
 */
import { useState } from 'react'
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp, X } from 'lucide-react'
import {
  useAddMovement,
  useCashSummary,
  useCloseCash,
  useCurrentCash,
  useOpenCash,
} from '../../hooks/useCash'
import { PAYMENT_METHOD_LABELS, MOVEMENT_TYPE_LABELS } from '../../types/cash'
import type { CashMovement, CashMovementType, CashPaymentMethod, PaymentMethodSummary } from '../../types/cash'

// ─── Pure helpers (exported for direct unit testing) ──────────────────────

/** EXPENSE renders as an outgoing (red) movement; every other type (SALE, PAYMENT_RECEIVED, INCOME) is incoming (green). */
export function resolveMovementDirection(type: CashMovementType): 'income' | 'expense' {
  return type === 'EXPENSE' ? 'expense' : 'income'
}

/** Backend timestamps have no timezone suffix; treat them as UTC (same convention as desktop Cash.tsx's toUTC). */
function toUTC(iso: string): Date {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
}

export function formatMovementTime(iso: string): string {
  return toUTC(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Aggregates the real per-method summary into the two headline totals the design's Ingresos/Egresos cards need. */
export function computeIncomeExpenseTotals(byMethod: PaymentMethodSummary[]): { income: number; expense: number } {
  return byMethod.reduce(
    (acc, m) => ({
      income: acc.income + m.total_sales + m.total_payments_received + m.total_income,
      expense: acc.expense + m.total_expense,
    }),
    { income: 0, expense: 0 }
  )
}

/** Mirrors the backend rule: no difference when auto-closing (counted === null); otherwise compare to the expected cash. */
export function hasClosingDifference(counted: number | null, expected: number): boolean {
  if (counted === null) return false
  return Math.abs(counted - expected) > 0.005
}

export function sortMovementsByRecency(movements: CashMovement[]): CashMovement[] {
  return [...movements].sort((a, b) => toUTC(b.created_at).getTime() - toUTC(a.created_at).getTime())
}

// ─── Formatting ─────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatSignedCurrency = (value: number, direction: 'income' | 'expense') =>
  `${direction === 'expense' ? '-' : '+'}${formatCurrency(value)}`

// ─── Sub-components ─────────────────────────────────────────────────────────

function OpenCashState() {
  const [amount, setAmount] = useState('')
  const openCash = useOpenCash()

  const handleSubmit = () => {
    openCash.mutate({ opening_amount: Number(amount) || 0 })
  }

  return (
    <div className="flex flex-col items-center px-7 py-14 text-center">
      <h1 className="font-display mb-2 text-2xl font-extrabold" style={{ color: '#121325' }}>
        Abrir caja
      </h1>
      <p className="mb-5 max-w-[260px] text-sm leading-relaxed" style={{ color: '#7b6b95' }}>
        Todavía no abriste la caja de hoy. Ingresá el fondo inicial para empezar a registrar
        movimientos.
      </p>
      <div className="flex h-[46px] w-full max-w-[220px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Monto inicial"
          aria-label="Monto inicial"
          className="flex-1 border-none bg-transparent text-center text-sm text-[#121325] outline-none"
        />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={openCash.isPending}
        className="mt-4 rounded-xl px-5 py-3 text-[13.5px] font-bold text-white disabled:opacity-60"
        style={{ background: '#7c5ca8', boxShadow: '0 8px 18px rgba(92,58,140,.35)' }}
      >
        {openCash.isPending ? 'Abriendo...' : 'Abrir caja'}
      </button>
    </div>
  )
}

interface MovementSheetProps {
  cashRegisterId: string
  onClose: () => void
}

function MovementSheet({ cashRegisterId, onClose }: MovementSheetProps) {
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('INCOME')
  const [paymentMethod, setPaymentMethod] = useState<CashPaymentMethod>('CASH')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const addMovement = useAddMovement(cashRegisterId)

  const amountValue = Number(amount) || 0
  const canSubmit = amountValue > 0 && description.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    addMovement.mutate(
      { type, payment_method: paymentMethod, amount: amountValue, description: description.trim() },
      { onSuccess: onClose }
    )
  }

  return (
    <div
      role="dialog"
      aria-label="Registrar movimiento"
      className="fixed inset-x-0 bottom-0 z-[400] flex max-h-[85%] flex-col overflow-hidden rounded-t-[26px] bg-white"
    >
      <div className="flex items-center gap-[10px] px-[18px] pb-3 pt-4" style={{ background: '#f7f4fb' }}>
        <p className="flex-1 text-base font-extrabold text-[#121325]">Registrar movimiento</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar registrar movimiento"
          className="flex h-8 w-8 items-center justify-center rounded-[9px]"
          style={{ background: '#ece6f6' }}
        >
          <X size={16} color="#5b5570" />
        </button>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto px-[18px] py-4">
        <div className="flex gap-[7px]">
          {(['INCOME', 'EXPENSE'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              className="flex-1 rounded-[11px] px-[14px] py-2.5 text-[13px] font-bold"
              style={{
                background: type === option ? (option === 'INCOME' ? '#3d8c47' : '#c0392b') : '#fff',
                color: type === option ? '#fff' : '#5b5570',
                border: '1px solid #ece6f6',
              }}
            >
              {option === 'INCOME' ? 'Ingreso' : 'Egreso'}
            </button>
          ))}
        </div>

        <div className="flex h-[46px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monto"
            aria-label="Monto"
            className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
          />
        </div>

        <div className="flex h-[46px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Concepto"
            aria-label="Concepto"
            className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
          />
        </div>

        <div className="flex h-[46px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3">
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as CashPaymentMethod)}
            aria-label="Método de pago"
            className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
          >
            {(Object.keys(PAYMENT_METHOD_LABELS) as CashPaymentMethod[]).map((key) => (
              <option key={key} value={key}>
                {PAYMENT_METHOD_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || addMovement.isPending}
          className="mt-1 rounded-[13px] py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'linear-gradient(140deg,#7c5ca8,#5c3a8c)', boxShadow: '0 8px 18px rgba(92,58,140,.35)' }}
        >
          {addMovement.isPending ? 'Guardando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}

interface CloseCashSheetProps {
  expectedCash: number
  onClose: () => void
}

function CloseCashSheet({ expectedCash, onClose }: CloseCashSheetProps) {
  const [countedCash, setCountedCash] = useState('')
  const [reason, setReason] = useState('')
  const closeCash = useCloseCash()

  const countedValue = countedCash.trim() === '' ? null : Number(countedCash)
  const needsReason = hasClosingDifference(countedValue, expectedCash)
  // Mirrors desktop's CloseCashModal canSubmit exactly: countedCash !== '' is
  // always required (CloseCashRequest.counted_cash is a required `number` in
  // types/cash.ts on the frontend, even though the backend schema itself
  // accepts it as optional/auto — desktop's own UI never omits it, so this
  // screen doesn't invent a blank/auto-close path either).
  const canSubmit = countedValue !== null && (!needsReason || reason.trim().length > 0)

  const handleSubmit = () => {
    if (!canSubmit || countedValue === null) return
    closeCash.mutate(
      {
        counted_cash: countedValue,
        difference_reason: needsReason ? reason.trim() : undefined,
      },
      { onSuccess: onClose }
    )
  }

  return (
    <div
      role="dialog"
      aria-label="Cerrar caja"
      className="fixed inset-x-0 bottom-0 z-[400] flex max-h-[85%] flex-col overflow-hidden rounded-t-[26px] bg-white"
    >
      <div className="flex items-center gap-[10px] px-[18px] pb-3 pt-4" style={{ background: '#f7f4fb' }}>
        <p className="flex-1 text-base font-extrabold text-[#121325]">Cerrar caja</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar cierre de caja"
          className="flex h-8 w-8 items-center justify-center rounded-[9px]"
          style={{ background: '#ece6f6' }}
        >
          <X size={16} color="#5b5570" />
        </button>
      </div>

      <div className="flex flex-col gap-3 overflow-y-auto px-[18px] py-4">
        <p className="text-[12.5px] text-[#7b6b95]">
          Efectivo esperado: <span className="font-semibold text-[#121325]">{formatCurrency(expectedCash)}</span>
        </p>

        <div className="flex h-[46px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3">
          <input
            type="number"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder="Efectivo contado"
            aria-label="Efectivo contado"
            className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
          />
        </div>

        {needsReason && (
          <div className="flex min-h-[46px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3 py-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo de la diferencia"
              aria-label="Motivo de la diferencia"
              className="flex-1 resize-none border-none bg-transparent text-sm text-[#121325] outline-none"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || closeCash.isPending}
          className="mt-1 rounded-[13px] py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: '#c0392b', boxShadow: '0 8px 18px rgba(192,57,43,.35)' }}
        >
          {closeCash.isPending ? 'Cerrando...' : 'Confirmar cierre'}
        </button>
      </div>
    </div>
  )
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function MobileCaja() {
  const { data: currentCash, isLoading } = useCurrentCash()
  const { data: summary } = useCashSummary(currentCash?.id)
  const [movementSheetOpen, setMovementSheetOpen] = useState(false)
  const [closeSheetOpen, setCloseSheetOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!currentCash) {
    return <OpenCashState />
  }

  const expectedCash = summary?.expected_cash ?? 0
  const { income, expense } = computeIncomeExpenseTotals(summary?.by_method ?? [])
  const movements = sortMovementsByRecency(currentCash.movements)

  return (
    <div className="px-4 pb-[110px] pt-4">
      {/* Hero: Caja abierta */}
      <div
        className="relative overflow-hidden rounded-[20px] p-[18px] pb-4 text-white"
        style={{ background: 'linear-gradient(150deg,#1a3d1f,#3d8c47)', boxShadow: '0 14px 30px rgba(26,61,31,.30)' }}
      >
        <div
          className="absolute -right-[30px] -top-[30px] h-[130px] w-[130px] rounded-full"
          style={{ background: 'rgba(126,207,134,.25)', filter: 'blur(10px)' }}
        />
        <div className="relative">
          <div
            className="flex items-center gap-[7px] text-[11px] font-semibold uppercase tracking-[.14em]"
            style={{ color: 'rgba(224,245,226,.85)' }}
          >
            <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: '#7ecf86' }} />
            Caja abierta
          </div>
          <p className="font-display mt-1.5 text-[34px] font-extrabold leading-[1.05] tracking-tight">
            {formatCurrency(expectedCash)}
          </p>
          <div className="mt-3.5 flex gap-[9px] border-t pt-3.5" style={{ borderColor: 'rgba(255,255,255,.16)' }}>
            <button
              type="button"
              onClick={() => setMovementSheetOpen(true)}
              className="flex-1 rounded-[11px] py-2.5 text-[13px] font-bold text-white"
              style={{ background: 'rgba(255,255,255,.16)' }}
            >
              Movimiento
            </button>
            <button
              type="button"
              onClick={() => setCloseSheetOpen(true)}
              className="flex-1 rounded-[11px] py-2.5 text-[13px] font-bold"
              style={{ background: '#fff', color: '#1a3d1f' }}
            >
              Cerrar caja
            </button>
          </div>
        </div>
      </div>

      {/* Ingresos / Egresos cards */}
      <div className="mt-3 grid grid-cols-2 gap-[11px]">
        <div className="rounded-2xl border border-[#ece6f6] bg-white p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#3d8c47]">
            <TrendingUp size={14} color="#3d8c47" strokeWidth={2} />
            Ingresos
          </div>
          <p className="font-display mt-1.5 text-[20px] font-extrabold text-[#121325]">{formatCurrency(income)}</p>
        </div>
        <div className="rounded-2xl border border-[#ece6f6] bg-white p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#c0392b]">
            <TrendingDown size={14} color="#c0392b" strokeWidth={2} />
            Egresos
          </div>
          <p className="font-display mt-1.5 text-[20px] font-extrabold text-[#121325]">{formatCurrency(expense)}</p>
        </div>
      </div>

      {/* Movimientos de hoy */}
      <p className="mb-2.5 mt-5 text-xs font-semibold uppercase tracking-[.12em] text-[#7b6b95]">
        Movimientos de hoy
      </p>
      {movements.length === 0 ? (
        <div className="rounded-[15px] border border-dashed border-[#d9caeb] bg-white p-[24px_18px] text-center text-[#9089a0]">
          <p className="text-[13.5px]">Todavía no hay movimientos registrados hoy.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {movements.map((movement) => {
            const direction = resolveMovementDirection(movement.type)
            const Icon = direction === 'income' ? ArrowDown : ArrowUp
            const color = direction === 'income' ? '#3d8c47' : '#c0392b'
            return (
              <div
                key={movement.id}
                className="flex items-center gap-[11px] rounded-[15px] border border-[#ece6f6] bg-white p-[11px_13px]"
              >
                <div
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full"
                  style={{ background: direction === 'income' ? '#e3f3e5' : '#fbe4e1' }}
                >
                  <Icon size={17} color={color} strokeWidth={2.4} />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[#121325]">
                    {movement.description || MOVEMENT_TYPE_LABELS[movement.type]}
                  </p>
                  <p className="text-[11px] text-[#9089a0]">
                    {PAYMENT_METHOD_LABELS[movement.payment_method]} · {formatMovementTime(movement.created_at)}
                  </p>
                </div>
                <p className="text-sm font-extrabold" style={{ color }}>
                  {formatSignedCurrency(movement.amount, direction)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {movementSheetOpen && (
        <MovementSheet cashRegisterId={currentCash.id} onClose={() => setMovementSheetOpen(false)} />
      )}
      {closeSheetOpen && (
        <CloseCashSheet expectedCash={expectedCash} onClose={() => setCloseSheetOpen(false)} />
      )}
    </div>
  )
}
