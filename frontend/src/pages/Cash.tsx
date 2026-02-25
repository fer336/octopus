/**
 * Página de Caja (/caja)
 * Maneja los 4 estados: sin caja, abierta, vencida y ya cerrada hoy.
 */
import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Eye,
  History,
  Lock,
  PlusCircle,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAddMovement, useCloseCash, useCurrentCash, useOpenCash, useCashSummary, useCashHistory } from '../hooks/useCash'
import { openClosurePdf } from '../api/cashService'
import type {
  CashMovement,
  CashPaymentMethod,
  AddMovementRequest,
  CloseCashRequest,
} from '../types/cash'
import { MOVEMENT_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../types/cash'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

/** Normaliza el ISO string del backend (sin timezone) agregando Z para que se trate como UTC. */
function toUTC(iso: string): Date {
  // Si ya tiene timezone info (+00:00, Z) lo usa tal cual; si no, agrega Z
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
}

function formatDateTime(iso: string): string {
  return toUTC(iso).toLocaleString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return toUTC(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function elapsedTime(iso: string): string {
  const ms = Date.now() - toUTC(iso).getTime()
  if (ms < 0) return '0m'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Modal de Apertura ───────────────────────────────────────────────────────

function OpenCashModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const openCash = useOpenCash()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await openCash.mutateAsync({ opening_amount: parseFloat(amount) || 0 })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Abrir Caja</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Monto inicial (efectivo en caja)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="$ 0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={openCash.isPending}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {openCash.isPending ? 'Abriendo...' : 'Abrir Caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal de Movimiento Manual ──────────────────────────────────────────────

function MovementModal({
  cashRegisterId,
  type,
  onClose,
}: {
  cashRegisterId: string
  type: 'INCOME' | 'EXPENSE'
  onClose: () => void
}) {
  const addMovement = useAddMovement(cashRegisterId)
  const [form, setForm] = useState<AddMovementRequest>({
    type,
    payment_method: 'CASH',
    amount: 0,
    description: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await addMovement.mutateAsync(form)
    onClose()
  }

  const title = type === 'INCOME' ? 'Registrar Ingreso' : 'Registrar Egreso'
  const color = type === 'INCOME' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Descripción *
            </label>
            <input
              required
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Monto *
              </label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount || ''}
                onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Método
              </label>
              <select
                value={form.payment_method}
                onChange={(e) =>
                  setForm({ ...form, payment_method: e.target.value as CashPaymentMethod })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                {(Object.keys(PAYMENT_METHOD_LABELS) as CashPaymentMethod[]).map((key) => (
                  <option key={key} value={key}>
                    {PAYMENT_METHOD_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={addMovement.isPending}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${color}`}
            >
              {addMovement.isPending ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal de Cierre ─────────────────────────────────────────────────────────

function CloseCashModal({
  cashRegisterId,
  onClose,
}: {
  cashRegisterId: string
  onClose: () => void
}) {
  const closeCash = useCloseCash()
  const { data: summary } = useCashSummary(cashRegisterId)
  const [countedCash, setCountedCash] = useState('')
  const [reason, setReason] = useState('')

  const expectedCash = summary?.expected_cash ?? 0
  const counted = parseFloat(countedCash) || 0
  const difference = counted - expectedCash
  const hasDifference = Math.abs(difference) > 0.01

  const canSubmit = countedCash !== '' && (!hasDifference || reason.trim().length > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const payload: CloseCashRequest = {
      counted_cash: counted,
      difference_reason: hasDifference ? reason : undefined,
    }
    await closeCash.mutateAsync(payload)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-gray-800">
        <div className="border-b p-5 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cerrar Caja del Día</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            {/* Resumen por método */}
            {summary && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Resumen por método de pago
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                      <th className="pb-1">Método</th>
                      <th className="pb-1 text-right">Ventas</th>
                      <th className="pb-1 text-right">Cobros</th>
                      <th className="pb-1 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_method
                      .filter((m) => m.net !== 0 || m.total_sales !== 0 || m.total_payments_received !== 0)
                      .map((m) => (
                        <tr key={m.payment_method} className="border-t dark:border-gray-700">
                          <td className="py-1.5">{PAYMENT_METHOD_LABELS[m.payment_method]}</td>
                          <td className="py-1.5 text-right font-mono">{formatCurrency(m.total_sales)}</td>
                          <td className="py-1.5 text-right font-mono">{formatCurrency(m.total_payments_received)}</td>
                          <td className="py-1.5 text-right font-mono font-semibold">{formatCurrency(m.net)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold dark:border-gray-600">
                  <span>Efectivo esperado al cierre</span>
                  <span className="font-mono">{formatCurrency(expectedCash)}</span>
                </div>
              </div>
            )}

            {/* Input efectivo contado */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Efectivo físico contado *
              </label>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="$ 0,00"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Diferencia */}
            {countedCash !== '' && (
              <div
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold ${
                  hasDifference
                    ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                }`}
              >
                <span>Diferencia</span>
                <span className="font-mono text-base">
                  {difference >= 0 ? '+' : ''}
                  {formatCurrency(difference)}
                </span>
              </div>
            )}

            {/* Motivo (solo si hay diferencia) */}
            {hasDifference && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Motivo de la diferencia *
                </label>
                <textarea
                  required
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t p-5 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit || closeCash.isPending}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {closeCash.isPending ? 'Cerrando...' : 'Confirmar Cierre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Fila de movimiento ───────────────────────────────────────────────────────

function MovementRow({ mv }: { mv: CashMovement }) {
  const isExpense = mv.type === 'EXPENSE'
  const isIncome = mv.type === 'INCOME' || mv.type === 'SALE' || mv.type === 'PAYMENT_RECEIVED'

  return (
    <tr className="border-b hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="py-2.5 pl-4 text-sm text-gray-500 dark:text-gray-400">
        {formatTime(mv.created_at)}
      </td>
      <td className="py-2.5 text-sm text-gray-900 dark:text-white">{mv.description}</td>
      <td className="py-2.5 text-sm text-gray-500 dark:text-gray-400">
        {MOVEMENT_TYPE_LABELS[mv.type]}
      </td>
      <td className="py-2.5 text-sm text-gray-500 dark:text-gray-400">
        {PAYMENT_METHOD_LABELS[mv.payment_method]}
      </td>
      <td
        className={`py-2.5 pr-4 text-right font-mono text-sm font-semibold ${
          isExpense
            ? 'text-red-600 dark:text-red-400'
            : 'text-green-600 dark:text-green-400'
        }`}
      >
        {isExpense ? '-' : '+'}
        {formatCurrency(mv.amount)}
      </td>
    </tr>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

// ─── Card caja cerrada hoy ───────────────────────────────────────────────────

function ClosedCashCard({ cashRegisterId, closedAt }: { cashRegisterId: string; closedAt: string | null }) {
  const [loading, setLoading] = useState(false)

  const handleOpen = async () => {
    setLoading(true)
    try {
      await openClosurePdf(cashRegisterId)
    } catch {
      toast.error('Error al generar el PDF')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-700">
            <Lock className="h-8 w-8 text-gray-500 dark:text-gray-400" />
          </div>
        </div>
        <h2 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-white">
          Caja cerrada
        </h2>
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          La caja del día fue cerrada a las{' '}
          {closedAt ? formatTime(closedAt) : '—'}.
          Mañana podrás abrir una nueva.
        </p>
        <button
          onClick={handleOpen}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
        >
          <Eye className="h-4 w-4" />
          {loading ? 'Generando...' : 'Ver resumen PDF'}
        </button>
      </div>
    </div>
  )
}

// ─── Historial de cierres ────────────────────────────────────────────────────

function CashHistory() {
  const { data: history, isLoading } = useCashHistory()
  const [loading, setLoading] = useState<string | null>(null)

  const handleOpen = async (id: string) => {
    setLoading(id)
    try {
      await openClosurePdf(id)
    } catch {
      toast.error('Error al generar el PDF')
    } finally {
      setLoading(null)
    }
  }

  if (isLoading) return null
  if (!history || history.length === 0) return null

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-400">
        <History className="h-4 w-4" />
        Historial de cierres
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="py-2.5 pl-4">Fecha apertura</th>
              <th className="py-2.5">Fecha cierre</th>
              <th className="py-2.5 text-right">Fondo inicial</th>
              <th className="py-2.5 text-right">Diferencia</th>
              <th className="py-2.5 pr-4 text-right">PDF</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r) => {
              const diff = r.difference ?? 0
              const hasDiff = Math.abs(diff) > 0.01
              return (
                <tr key={r.id} className="border-b hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
                  <td className="py-2.5 pl-4 text-gray-700 dark:text-gray-300">
                    {formatDateTime(r.opened_at)}
                  </td>
                  <td className="py-2.5 text-gray-700 dark:text-gray-300">
                    {r.closed_at ? formatDateTime(r.closed_at) : '—'}
                  </td>
                  <td className="py-2.5 text-right font-mono text-gray-700 dark:text-gray-300">
                    {formatCurrency(r.opening_amount)}
                  </td>
                  <td className={`py-2.5 text-right font-mono font-semibold ${hasDiff ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {hasDiff ? (diff > 0 ? '+' : '') + formatCurrency(diff) : '✓ Cuadra'}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <button
                      onClick={() => handleOpen(r.id)}
                      disabled={loading === r.id}
                      title="Ver PDF"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {loading === r.id ? 'Generando...' : 'Ver PDF'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function Cash() {
  const { data: cashRegister, isLoading } = useCurrentCash()
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE' | null>(null)

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Cargando estado de caja...</p>
      </div>
    )
  }

  const isExpired = cashRegister?.is_expired ?? false
  const isOpen = cashRegister?.status === 'OPEN' && !isExpired
  const isClosed = cashRegister?.status === 'CLOSED'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Caja</h1>

      {/* ── Estado: Sin caja abierta ─────────────────────────────────── */}
      {!cashRegister && (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-blue-100 p-4 dark:bg-blue-900/30">
                <PlusCircle className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h2 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-white">
              No hay caja abierta
            </h2>
            <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Abrí la caja del día para comenzar a registrar ventas.
            </p>
            <button
              onClick={() => setShowOpen(true)}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Abrir Caja
            </button>
          </div>
        </div>
      )}

      {/* ── Estado: Caja cerrada hoy ──────────────────────────────────── */}
      {isClosed && cashRegister && (
        <ClosedCashCard cashRegisterId={cashRegister.id} closedAt={cashRegister.closed_at} />
      )}

      {/* ── Estado: Caja vencida (>24hs) ─────────────────────────────── */}
      {isExpired && (
        <>
          <div className="flex items-start gap-3 rounded-xl border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="font-semibold text-yellow-800 dark:text-yellow-300">
                Caja vencida — lleva más de 24hs abierta
              </p>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
                Debés cerrar esta caja antes de poder registrar nuevos movimientos o abrir una nueva.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setShowClose(true)}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              Cerrar Caja Vencida
            </button>
          </div>
        </>
      )}

      {/* ── Estado: Caja abierta ─────────────────────────────────────── */}
      {isOpen && cashRegister && (
        <>
          {/* Header de caja */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <span className="text-lg">🟢</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Caja Abierta</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Desde las {formatTime(cashRegister.opened_at)} · {elapsedTime(cashRegister.opened_at)} transcurridos
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Fondo inicial</p>
                <p className="font-mono font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(cashRegister.opening_amount)}
                </p>
              </div>
              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-xs">{elapsedTime(cashRegister.opened_at)}</span>
              </div>
            </div>
          </div>

          {/* Tabla de movimientos */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b px-5 py-3 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">Movimientos del día</h2>
            </div>
            {cashRegister.movements.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                Sin movimientos aún. Registrá una venta o un ingreso/egreso.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <th className="py-2.5 pl-4">Hora</th>
                    <th className="py-2.5">Descripción</th>
                    <th className="py-2.5">Tipo</th>
                    <th className="py-2.5">Método</th>
                    <th className="py-2.5 pr-4 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cashRegister.movements].reverse().map((mv) => (
                    <MovementRow key={mv.id} mv={mv} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3">
              <button
                onClick={() => setMovementType('INCOME')}
                className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
              >
                <ArrowUpCircle className="h-4 w-4" />
                + Ingreso
              </button>
              <button
                onClick={() => setMovementType('EXPENSE')}
                className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
              >
                <ArrowDownCircle className="h-4 w-4" />
                - Egreso
              </button>
            </div>
            <button
              onClick={() => setShowClose(true)}
              className="flex items-center gap-2 rounded-lg bg-gray-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              <XCircle className="h-4 w-4" />
              Cerrar Caja
            </button>
          </div>
        </>
      )}

      {/* ── Historial ─────────────────────────────────────────────────── */}
      <CashHistory />

      {/* ── Modales ───────────────────────────────────────────────────── */}
      {showOpen && <OpenCashModal onClose={() => setShowOpen(false)} />}

      {showClose && cashRegister && (
        <CloseCashModal
          cashRegisterId={cashRegister.id}
          onClose={() => setShowClose(false)}
        />
      )}

      {movementType && cashRegister && (
        <MovementModal
          cashRegisterId={cashRegister.id}
          type={movementType}
          onClose={() => setMovementType(null)}
        />
      )}
    </div>
  )
}
