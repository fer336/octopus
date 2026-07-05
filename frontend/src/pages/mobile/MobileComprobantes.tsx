/**
 * Native mobile "Comprobantes" screen (PR7) — read-only. Self-fetching via
 * `vouchersService.getAll` directly (same raw useQuery shortcut as
 * `MobileCuenta`/`MobileCaja`, no dedicated hook file).
 *
 * Fetches ONCE with `per_page: 50` and no server-side `voucher_type` filter,
 * then filters the chips (Todos, Cotización, Remito, Factura) entirely
 * client-side. `vouchersService.getAll` only accepts a single exact
 * `voucher_type` value, but "Factura" must match all four invoice variants
 * (`invoice_a`/`invoice_b`/`invoice_c`/`invoice_x`) — fetching once and
 * filtering in-memory avoids firing 4 separate requests for that chip.
 *
 * Status pill is a business rule derived from the data model: only invoices
 * have a real paid/pending concept (`is_paid`). Quotations and receipts
 * don't, so they always show "Vigente" regardless of `is_paid`.
 *
 * Read-only by design (design_handoff_mobile/README.md section "Comprobantes"):
 * the mockup shows plain display cards with no detail view, PDF button, or
 * payment action. Do not add any mutation or navigation on tap.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import vouchersService, { type Voucher } from '../../api/vouchersService'
import { formatErrorMessage } from '../../utils/errorHelpers'

// ─── Pure helpers (exported for direct unit testing) ──────────────────────

export type ComprobanteStatus = 'cobrado' | 'pendiente' | 'vigente'

export const COMPROBANTE_STATUS_LABELS: Record<ComprobanteStatus, string> = {
  cobrado: 'Cobrado',
  pendiente: 'Pendiente',
  vigente: 'Vigente',
}

export const COMPROBANTE_STATUS_COLORS: Record<ComprobanteStatus, string> = {
  cobrado: '#3d8c47',
  pendiente: '#f97316',
  vigente: '#7c5ca8',
}

/**
 * Invoices (`invoice_*`) are the only voucher type with a real paid/pending
 * concept: `is_paid` true -> Cobrado, false/undefined -> Pendiente.
 * Quotations and receipts always show Vigente, regardless of `is_paid`.
 */
export function resolveComprobanteStatus(voucher: Voucher): ComprobanteStatus {
  if (voucher.voucher_type.startsWith('invoice')) {
    return voucher.is_paid ? 'cobrado' : 'pendiente'
  }
  return 'vigente'
}

export type ComprobanteTypeBadgeKey = 'cotizacion' | 'remito' | 'factura'

export const COMPROBANTE_TYPE_LABELS: Record<ComprobanteTypeBadgeKey, string> = {
  cotizacion: 'Cotización',
  remito: 'Remito',
  factura: 'Factura',
}

export const COMPROBANTE_TYPE_COLORS: Record<ComprobanteTypeBadgeKey, { color: string; background: string }> = {
  factura: { color: '#7c5ca8', background: '#ece6f6' },
  remito: { color: '#1d4ed8', background: '#dbeafe' },
  cotizacion: { color: '#b45309', background: '#fef3c7' },
}

/** quotation -> Cotización, receipt -> Remito, any invoice_* -> Factura. */
export function resolveComprobanteTypeBadge(voucherType: string): ComprobanteTypeBadgeKey {
  if (voucherType === 'quotation') return 'cotizacion'
  if (voucherType === 'receipt') return 'remito'
  return 'factura'
}

export type ComprobanteFilter = 'todos' | 'cotizacion' | 'remito' | 'factura'

const FILTER_CHIPS: { key: ComprobanteFilter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'cotizacion', label: 'Cotización' },
  { key: 'remito', label: 'Remito' },
  { key: 'factura', label: 'Factura' },
]

/**
 * Entirely client-side over the already-fetched batch. "Factura" matches all
 * four invoice_* variants via `resolveComprobanteTypeBadge`.
 */
export function filterVouchersByType(vouchers: Voucher[], filter: ComprobanteFilter): Voucher[] {
  if (filter === 'todos') return vouchers
  return vouchers.filter((v) => resolveComprobanteTypeBadge(v.voucher_type) === filter)
}

/** Parses a "YYYY-MM-DD" date as a local date (no UTC shift) and formats it es-AR, mirroring desktop's Vouchers.tsx `parseLocalDate`/`formatLocalDate`. */
export function formatComprobanteDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString('es-AR')
}

// ─── Formatting ─────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ─── Main screen ────────────────────────────────────────────────────────────

export default function MobileComprobantes() {
  const [filter, setFilter] = useState<ComprobanteFilter>('todos')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mobile-comprobantes'],
    queryFn: () => vouchersService.getAll({ per_page: 50 }),
    retry: false,
  })

  const vouchers = data?.items ?? []
  const filteredVouchers = useMemo(() => filterVouchersByType(vouchers, filter), [vouchers, filter])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center px-7 py-14 text-center">
        <p className="max-w-[260px] text-sm leading-relaxed text-[#7b6b95]">
          No pudimos cargar los comprobantes.
        </p>
        <p role="alert" className="mt-2 text-[10.5px] font-semibold text-[#c0392b]">
          {formatErrorMessage(error)}
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-[110px] pt-4">
      {/* Chips de filtro */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className="flex-none rounded-full px-[13px] py-[7px] text-[10.5px] font-semibold"
            style={{
              background: filter === chip.key ? '#7c5ca8' : '#fff',
              color: filter === chip.key ? '#fff' : '#5b5570',
              border: '1px solid #ece6f6',
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Lista de comprobantes */}
      <div className="mt-3 flex flex-col gap-[9px]">
        {filteredVouchers.length === 0 ? (
          <div className="rounded-[15px] border border-dashed border-[#d9caeb] bg-white p-[24px_18px] text-center text-[#9089a0]">
            <p className="text-[11.5px]">No hay comprobantes para mostrar.</p>
          </div>
        ) : (
          filteredVouchers.map((voucher) => {
            const typeKey = resolveComprobanteTypeBadge(voucher.voucher_type)
            const typeColors = COMPROBANTE_TYPE_COLORS[typeKey]
            const status = resolveComprobanteStatus(voucher)
            const clientName = voucher.client?.name ?? 'Consumidor final'
            return (
              <div
                key={voucher.id}
                data-testid="comprobante-card"
                className="flex flex-col gap-1.5 rounded-[15px] border border-[#ece6f6] bg-white p-[13px_14px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      data-testid="comprobante-type-badge"
                      className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-bold"
                      style={{ color: typeColors.color, background: typeColors.background }}
                    >
                      {COMPROBANTE_TYPE_LABELS[typeKey]}
                    </span>
                    <span className="truncate font-mono text-[10.5px] font-semibold text-[#121325]">
                      {`${voucher.sale_point}-${voucher.number}`}
                    </span>
                  </div>
                  <span
                    className="flex-none rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white"
                    style={{ background: COMPROBANTE_STATUS_COLORS[status] }}
                  >
                    {COMPROBANTE_STATUS_LABELS[status]}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#121325]">{clientName}</p>
                    <p className="text-[11.5px] text-[#9089a0]">{formatComprobanteDate(voucher.date)}</p>
                  </div>
                  <p className="font-display flex-none text-[13px] font-extrabold text-[#121325]">
                    {formatCurrency(voucher.total)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
