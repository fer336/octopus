/**
 * Native mobile "Nueva venta" screen: client picker, doc-type chips, cart
 * lines (stepper +/-, trash removal) and a sticky totals bar with the CTA
 * that submits the sale via `vouchersService.create()`.
 *
 * `cart`/`setCart` are lifted at `MobileShell` (same array Productos adds
 * to). This screen owns `selectedClient`/`clientPickerOpen`/`docType`
 * locally — no other screen needs them (per design's Component Tree).
 *
 * `mergeCartLine` is the same merge-by-code reducer `MobileShell` uses for
 * Productos' add-to-cart path (PR3) — exported here so it can be exercised
 * directly as a pure function from this screen's test suite too, per the
 * mobile-sales spec's "Cart item lifecycle" requirement. MobileSales itself
 * has no "add new product" UI (that only exists on Productos, already
 * covered by PR3's tests); the "Agregar +" affordance below just navigates
 * back to Productos.
 *
 * Submit guard: "Consumidor final" is a placeholder DISPLAY state only, not
 * a submittable value. `VoucherCreate.client_id` is a required real client
 * id — desktop `Sales.tsx`'s `handleConfirmGenerate` has a hard
 * `if (!selectedClient) { toast.error('Debe seleccionar un cliente'); return }`
 * guard before ever building the voucher payload; there is no generic/
 * anonymous backend client to fall back to ("Consumidor Final" in the
 * backend is an AFIP `tax_condition` assigned to a real client record, not
 * a walk-in-customer concept). This screen mirrors that guard: the CTA
 * submit button is disabled (with an inline hint) until a real client has
 * been explicitly picked via `ClientPickerSheet`.
 *
 * "Cta Cte" submits through the exact same `vouchersService.create()` path
 * as every other doc type (same cart/totals), just with the correct
 * current-account fields — mirrors desktop `Sales.tsx`'s reference logic
 * (~lines 2188-2226): `voucher_type: 'receipt'`, `is_current_account: true`,
 * `billing_client_id`/`operating_client_id` set to the selected client (V1
 * mobile has no operating-client-selection UI, so both use the same id,
 * unlike desktop's `selectedOperatingClientId || selectedClient.id`).
 *
 * "Acopio" is NOT wired to `vouchersService.create()` at all — desktop uses
 * an entirely separate mutation (`createAcopioMutation` →
 * `stockpileService.createByAmount()`) with different form fields (amount,
 * description, currency…), not cart line items. Building that form is out
 * of scope for this screen (no handoff design for it, structurally
 * different from the cart-based Nueva venta flow) — the chip stays visible/
 * selectable so users know it exists, but the CTA is disabled with an
 * inline hint while it's active. A dedicated Acopio screen is a fast-follow
 * item for a future change, not a silent landmine.
 */
import { useState, type Dispatch, type SetStateAction } from 'react'
import { Minus, Plus, Trash2, User, ArrowRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import vouchersService, { type VoucherCreate } from '../../api/vouchersService'
import type { Client } from '../../api/clientsService'
import ClientPickerSheet from '../../components/layout/ClientPickerSheet'
import type { CartLine } from '../../components/layout/MobileShell'

interface MobileSalesProps {
  cart: CartLine[]
  setCart: Dispatch<SetStateAction<CartLine[]>>
  /** Extra callback beyond design's literal 2-prop list — routes "Agregar +" back to Productos (same pattern as MobileDashboard's onNavigate / MobileProducts' scannedCode: closes a real data-flow gap the literal snippet didn't cover). */
  onNavigateToProductos?: () => void
}

type DocType = 'Cotización' | 'Remito' | 'Factura' | 'Cta Cte' | 'Acopio'

const DOC_TYPES: DocType[] = ['Cotización', 'Remito', 'Factura', 'Cta Cte', 'Acopio']

const CTA_LABELS: Record<DocType, string> = {
  'Cotización': 'Generar',
  'Remito': 'Emitir remito',
  'Factura': 'Facturar',
  'Cta Cte': 'Cargar a cuenta',
  'Acopio': 'Registrar acopio',
}

/**
 * Backend `VoucherCreate.voucher_type` only has 6 values (quotation/receipt/
 * invoice_a-c/x). "Cta Cte" correctly maps to `'receipt'` (matches desktop
 * `Sales.tsx`'s reference logic: `if (voucherType === 'current_account')
 * backendType = 'receipt'` — `is_current_account: true` is what actually
 * distinguishes a current-account receipt from a plain one, not a separate
 * enum value). "Acopio" has no backend equivalent at all (desktop never
 * calls `vouchersService.create()` for it) — its entry here is unreachable
 * dead code, kept only to satisfy `Record<DocType, ...>`'s exhaustiveness;
 * `canSubmit` blocks the CTA before this is ever read for Acopio.
 */
const VOUCHER_TYPE_BY_DOC_TYPE: Record<DocType, VoucherCreate['voucher_type']> = {
  'Cotización': 'quotation',
  'Remito': 'receipt',
  'Factura': 'invoice_b',
  'Cta Cte': 'receipt',
  'Acopio': 'quotation', // unreachable — Acopio submission is blocked by canSubmit
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const IVA_RATE = 0.21

/** Adds a new line at qty 1, or increments qty by 1 for an existing line with the same code. Same reducer `MobileShell.handleAddToCart` uses. */
export function mergeCartLine(cart: CartLine[], line: CartLine): CartLine[] {
  const index = cart.findIndex((existing) => existing.code === line.code)
  if (index === -1) return [...cart, line]
  const next = [...cart]
  next[index] = { ...next[index], qty: next[index].qty + line.qty }
  return next
}

export function calculateTotals(cart: CartLine[]): { subtotal: number; iva: number; total: number } {
  const subtotal = cart.reduce((sum, line) => sum + line.qty * line.price, 0)
  const iva = subtotal * IVA_RATE
  return { subtotal, iva, total: subtotal + iva }
}

export default function MobileSales({ cart, setCart, onNavigateToProductos }: MobileSalesProps) {
  const [docType, setDocType] = useState<DocType>('Cotización')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientPickerOpen, setClientPickerOpen] = useState(false)

  const createVoucherMutation = useMutation({
    mutationFn: (payload: VoucherCreate) => vouchersService.create(payload),
  })

  const decrement = (code: string) => {
    setCart((prev) =>
      prev.map((line) => (line.code === code ? { ...line, qty: Math.max(1, line.qty - 1) } : line))
    )
  }

  const increment = (code: string) => {
    setCart((prev) => prev.map((line) => (line.code === code ? { ...line, qty: line.qty + 1 } : line)))
  }

  const remove = (code: string) => {
    setCart((prev) => prev.filter((line) => line.code !== code))
  }

  const totals = calculateTotals(cart)
  const cartEmpty = cart.length === 0
  const noClientSelected = selectedClient === null
  const isCurrentAccount = docType === 'Cta Cte'
  const isAcopio = docType === 'Acopio'
  /** Mirrors desktop Sales.tsx's `!selectedClient` guard, plus blocks Acopio (no cart-based submit flow exists for it — see file-level doc comment). "Consumidor final" is a display placeholder, never a submittable client. */
  const canSubmit = !noClientSelected && !isAcopio
  const submitBlockedReason = isAcopio
    ? 'Acopio disponible próximamente en mobile'
    : noClientSelected
      ? 'Elegí un cliente para continuar'
      : null

  const handleSubmit = () => {
    if (cartEmpty || !canSubmit || !selectedClient) return
    const payload: VoucherCreate = {
      client_id: selectedClient.id,
      voucher_type: VOUCHER_TYPE_BY_DOC_TYPE[docType],
      date: new Date().toISOString().slice(0, 10),
      show_prices: true,
      general_discount: 0,
      is_current_account: isCurrentAccount,
      ...(isCurrentAccount
        ? { billing_client_id: selectedClient.id, operating_client_id: selectedClient.id }
        : {}),
      items: cart.map((line) => ({
        product_id: line.product_id,
        quantity: line.qty,
        unit_price: line.price,
        discount_percent: 0,
      })),
    }
    createVoucherMutation.mutate(payload)
  }

  return (
    <div className="relative px-4 pb-[200px] pt-4">
      {/* Client + doc type */}
      <button
        type="button"
        onClick={() => setClientPickerOpen(true)}
        aria-label={`Cliente: ${selectedClient?.name ?? 'Consumidor final'}`}
        className="flex w-full items-center gap-[11px] rounded-[15px] border border-[#ece6f6] bg-white p-[13px_14px] text-left"
      >
        <div
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px]"
          style={{ background: '#ece6f6' }}
        >
          <User size={19} color="#7c5ca8" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <p className="text-[11px] text-[#9089a0]">Cliente</p>
          <p className="text-sm font-bold text-[#121325]">{selectedClient?.name ?? 'Consumidor final'}</p>
        </div>
      </button>

      <div className="mt-[11px] flex gap-[7px] overflow-x-auto pb-1">
        {DOC_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setDocType(type)}
            className="flex-none rounded-[11px] px-[14px] py-2 text-[12.5px] font-semibold"
            style={{
              background: docType === type ? '#7c5ca8' : '#fff',
              color: docType === type ? '#fff' : '#5b5570',
              border: '1px solid #ece6f6',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Cart header */}
      <div className="mb-[9px] mt-[18px] flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[.1em] text-[#7b6b95]">
          Productos ({cart.length})
        </p>
        <button
          type="button"
          onClick={onNavigateToProductos}
          className="flex items-center gap-1 text-[12.5px] font-bold text-[#7c5ca8]"
        >
          Agregar
          <Plus size={15} strokeWidth={2.4} />
        </button>
      </div>

      {cartEmpty && (
        <div className="rounded-[15px] border border-dashed border-[#d9caeb] bg-white p-[34px_18px] text-center text-[#9089a0]">
          <p className="text-[13.5px]">Todavía no agregaste productos.</p>
          <button
            type="button"
            onClick={onNavigateToProductos}
            className="mt-3 rounded-[11px] bg-[#7c5ca8] px-[18px] py-2.5 text-[13px] font-bold text-white"
          >
            Buscar productos
          </button>
        </div>
      )}

      <div className="flex flex-col gap-[9px]">
        {cart.map((line) => (
          <div key={line.code} className="rounded-[15px] border border-[#ece6f6] bg-white p-[12px_13px]">
            <div className="flex items-start gap-[10px]">
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
                style={{ color: '#7c5ca8', background: '#ece6f6' }}
              >
                {line.code}
              </span>
              <p className="flex-1 text-[13px] font-semibold leading-tight text-[#121325]">{line.desc}</p>
              <button
                type="button"
                onClick={() => remove(line.code)}
                aria-label={`Eliminar ${line.desc} del carrito`}
                className="text-[#cdb9e0]"
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="mt-[11px] flex items-center justify-between">
              <div className="flex items-center overflow-hidden rounded-[10px] border border-[#ece6f6]">
                <button
                  type="button"
                  onClick={() => decrement(line.code)}
                  aria-label={`Restar cantidad de ${line.desc}`}
                  className="flex h-8 w-8 items-center justify-center bg-[#f7f4fb] text-[#7c5ca8]"
                >
                  <Minus size={15} strokeWidth={2.6} />
                </button>
                <div className="w-[38px] text-center text-sm font-bold text-[#121325]">{line.qty}</div>
                <button
                  type="button"
                  onClick={() => increment(line.code)}
                  aria-label={`Sumar cantidad de ${line.desc}`}
                  className="flex h-8 w-8 items-center justify-center bg-[#f7f4fb] text-[#7c5ca8]"
                >
                  <Plus size={15} strokeWidth={2.6} />
                </button>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[#9089a0]">{formatCurrency(line.price)} c/u</p>
                <p className="font-display text-base font-extrabold text-[#121325]">
                  {formatCurrency(line.qty * line.price)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sticky totals bar */}
      {!cartEmpty && (
        <div
          data-testid="sales-totals-bar"
          className="fixed inset-x-0 z-30 bg-white p-[13px_16px_14px]"
          style={{ bottom: '84px', borderTop: '1px solid #ece6f6', boxShadow: '0 -8px 24px rgba(58,36,89,.10)' }}
        >
          <div className="mb-[3px] flex justify-between text-[12.5px] text-[#7b6b95]">
            <span>Subtotal (sin IVA)</span>
            <span className="font-semibold text-[#121325]">{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className="mb-2 flex justify-between text-[12.5px] text-[#7b6b95]">
            <span>IVA (21%)</span>
            <span className="font-semibold text-[#121325]">{formatCurrency(totals.iva)}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[.1em] text-[#9089a0]">Total</p>
              <p className="font-display text-2xl font-extrabold text-[#121325]">{formatCurrency(totals.total)}</p>
              {submitBlockedReason && (
                <p className="mt-1 text-[11px] font-semibold text-[#c0392b]">{submitBlockedReason}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-[7px] rounded-[13px] px-5 py-[13px] text-[14.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'linear-gradient(140deg,#7c5ca8,#5c3a8c)', boxShadow: '0 8px 18px rgba(92,58,140,.35)' }}
            >
              {CTA_LABELS[docType]}
              <ArrowRight size={17} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}

      <ClientPickerSheet
        open={clientPickerOpen}
        onClose={() => setClientPickerOpen(false)}
        onSelect={(client) => setSelectedClient(client)}
      />
    </div>
  )
}
