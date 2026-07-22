/**
 * Native mobile "Comprobantes" screen (PR7). Self-fetching via
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
 * PR8 adds real per-card actions (view PDF, send via WhatsApp, delete),
 * mirroring desktop `Vouchers.tsx`'s business logic exactly — this screen
 * changes DESIGN only, not behavior:
 *  - "Ver PDF" reuses `PdfViewerSheet` as-is (already built for MobileSales'
 *    post-submit flow), fetching the blob on tap and revoking the object URL
 *    on close.
 *  - WhatsApp reuses `WhatsAppSendPdfButton` as-is (self-contained, own
 *    modal), gated behind the `whatsappEnabled` prop AND, like desktop
 *    (Vouchers.tsx ~1782, `isInvoiceVoucher`), only offered for Factura —
 *    quotations/receipts never show it on desktop either.
 *  - "Eliminar" ports desktop's `deleteMutation` (Vouchers.tsx ~459-483)
 *    byte-for-byte: a mandatory reason, and a REAL branch on
 *    `authorization_required` (four-eyes principle) — a queued-for-approval
 *    delete is a genuine success state with its own toast copy, not the
 *    generic "eliminado correctamente" one. Also mirrors desktop's exact
 *    eligibility rule (Vouchers.tsx ~1816-1830): NEVER offered for Factura
 *    (a real emitted invoice can't be deleted this way — that's what a Nota
 *    de Crédito is for) nor for a voucher already soft-deleted or linked to
 *    a current-account closure.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import vouchersService, { type Voucher } from '../../api/vouchersService'
import { formatErrorMessage } from '../../utils/errorHelpers'
import PdfViewerSheet from '../../components/layout/PdfViewerSheet'
import WhatsAppSendPdfButton from '../../components/messaging/WhatsAppSendPdfButton'

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

/** Defensively coerces to Number first — `Voucher.total` is backend `Decimal`, which serializes as a JSON string (Pydantic v2), not a number, despite the TS type saying `number`. Displayed directly with no arithmetic in between, so without this it would silently render unformatted (e.g. "$2.00" instead of "$2,00"). */
const formatCurrency = (value: number) =>
  `$${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ─── Main screen ────────────────────────────────────────────────────────────

export interface MobileComprobantesProps {
  /** Feature flag mirroring `MobileDrawer`'s prop of the same name — hides the WhatsApp send action when the business hasn't enabled that integration. */
  whatsappEnabled?: boolean
}

export default function MobileComprobantes({ whatsappEnabled = true }: MobileComprobantesProps = {}) {
  const [filter, setFilter] = useState<ComprobanteFilter>('todos')
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mobile-comprobantes'],
    queryFn: () => vouchersService.getAll({ per_page: 50 }),
    retry: false,
  })

  const vouchers = data?.items ?? []
  const filteredVouchers = useMemo(() => filterVouchersByType(vouchers, filter), [vouchers, filter])

  // In-app PDF viewer — same pattern as MobileSales' `showPdf`/`closePdfViewer`:
  // revoke any previously-shown blob URL before creating (or discarding) a
  // new one, so object URLs never leak across views.
  const [viewingPdfUrl, setViewingPdfUrl] = useState<string | null>(null)
  const [viewingPdfTitle, setViewingPdfTitle] = useState<string | undefined>(undefined)
  const [loadingPdfId, setLoadingPdfId] = useState<string | null>(null)

  const handleViewPdf = async (voucher: Voucher) => {
    setLoadingPdfId(voucher.id)
    try {
      const blob = await vouchersService.getPdf(voucher.id)
      setViewingPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
      setViewingPdfTitle(`${voucher.sale_point}-${voucher.number}`)
    } catch (pdfError) {
      toast.error(formatErrorMessage(pdfError))
    } finally {
      setLoadingPdfId(null)
    }
  }

  const closePdfViewer = () => {
    setViewingPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  // Delete flow — ported byte-for-byte from desktop Vouchers.tsx's
  // `deleteMutation` (~lines 459-483): a mandatory reason, and a real branch
  // on `authorization_required` (four-eyes principle) since a queued-for-
  // approval delete is a genuine success state with its own toast copy.
  const [deleteTarget, setDeleteTarget] = useState<Voucher | null>(null)
  const [deleteReason, setDeleteReason] = useState('')

  const closeDeleteModal = () => {
    setDeleteTarget(null)
    setDeleteReason('')
  }

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => vouchersService.delete(id, reason),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['mobile-comprobantes'] })
      if (response.authorization_required) {
        toast.success(response.message || 'Solicitud de autorización enviada', { icon: '🔒' })
      } else {
        toast.success('Comprobante eliminado correctamente', { icon: '✅' })
      }
      closeDeleteModal()
    },
    onError: (deleteError) => {
      toast.error(formatErrorMessage(deleteError))
    },
  })

  const handleConfirmDelete = () => {
    if (!deleteTarget || !deleteReason.trim()) return
    deleteMutation.mutate({ id: deleteTarget.id, reason: deleteReason.trim() })
  }

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
            const isFactura = typeKey === 'factura'
            // Mirrors desktop's exact delete eligibility (Vouchers.tsx ~1816-1830):
            // never for Factura (use a Nota de Crédito instead), never already
            // soft-deleted, never linked to a current-account closure.
            const canDelete =
              !isFactura &&
              !voucher.deleted_at &&
              !voucher.is_current_account_closure &&
              !voucher.is_receipt_linked_to_current_account_closure
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

                {/* Acciones */}
                <div className="mt-1 flex items-center gap-[7px] border-t border-[#ece6f6] pt-2">
                  <button
                    type="button"
                    onClick={() => handleViewPdf(voucher)}
                    disabled={loadingPdfId === voucher.id}
                    aria-label={`Ver PDF ${voucher.sale_point}-${voucher.number}`}
                    className="flex h-7 w-7 items-center justify-center rounded-[9px] disabled:opacity-50"
                    style={{ background: '#ece6f6' }}
                  >
                    <Eye size={14} color="#7c5ca8" />
                  </button>
                  {whatsappEnabled && isFactura && (
                    <WhatsAppSendPdfButton
                      getPdfBlob={() => vouchersService.getPdf(voucher.id)}
                      filename={`comprobante-${voucher.sale_point}-${voucher.number}.pdf`}
                      caption={`Comprobante ${voucher.sale_point}-${voucher.number}`}
                      defaultClientId={voucher.billing_client_id || voucher.client_id}
                    />
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(voucher)}
                      aria-label={`Eliminar comprobante ${voucher.sale_point}-${voucher.number}`}
                      className="flex h-7 w-7 items-center justify-center rounded-[9px]"
                      style={{ background: '#fdecea' }}
                    >
                      <Trash2 size={14} color="#c0392b" />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <PdfViewerSheet
        open={viewingPdfUrl !== null}
        onClose={closePdfViewer}
        pdfUrl={viewingPdfUrl}
        title={viewingPdfTitle}
      />

      {/* Modal de confirmación de eliminación — mandatory reason + real
          authorization_required branch, mirroring desktop's delete modal
          (Vouchers.tsx ~2001-2067). */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-label="Eliminar comprobante"
          className="fixed inset-0 z-[410] flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div className="w-full max-w-[380px] rounded-t-[20px] bg-white p-5 sm:rounded-[20px]">
            <p className="text-base font-extrabold text-[#121325]">¿Estás seguro?</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#7b6b95]">
              Vas a eliminar el comprobante <strong>{`${deleteTarget.sale_point}-${deleteTarget.number}`}</strong>. El
              registro quedará marcado como eliminado pero visible en el historial.
            </p>

            <label htmlFor="mobile-comprobante-delete-reason" className="mt-4 block text-[11px] font-semibold text-[#5b5570]">
              Motivo de eliminación *
            </label>
            <input
              id="mobile-comprobante-delete-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Ej: Error en los datos, duplicado, etc."
              required
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="flex-1 rounded-[11px] border border-[#ece6f6] py-[11px] text-[12.5px] font-bold text-[#5b5570]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending || !deleteReason.trim()}
                className="flex-1 rounded-[11px] bg-[#c0392b] py-[11px] text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
