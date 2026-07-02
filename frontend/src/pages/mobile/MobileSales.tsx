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
 * invoice_a-c/x) — it has no direct equivalent for "Cta Cte" or "Acopio"
 * (those are desktop-only flows: current-account flagging and a dedicated
 * stockpile-creation endpoint, see `Sales.tsx`'s `resolveBackendVoucherType`
 * + `createAcopioMutation`). Neither spec nor design defines mobile V1
 * business rules for those two chips, so this is a documented simplification:
 * Cta Cte/Acopio submit through the same generic `vouchersService.create()`
 * call as the other types, with a best-effort fallback type. This should be
 * revisited before Cta Cte/Acopio see real production traffic.
 */
const VOUCHER_TYPE_BY_DOC_TYPE: Record<DocType, VoucherCreate['voucher_type']> = {
  'Cotización': 'quotation',
  'Remito': 'receipt',
  'Factura': 'invoice_b',
  'Cta Cte': 'invoice_b',
  'Acopio': 'quotation',
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

  const handleSubmit = () => {
    if (cartEmpty) return
    const payload = {
      client_id: selectedClient?.id,
      voucher_type: VOUCHER_TYPE_BY_DOC_TYPE[docType],
      date: new Date().toISOString().slice(0, 10),
      show_prices: true,
      general_discount: 0,
      items: cart.map((line) => ({
        product_id: line.product_id,
        quantity: line.qty,
        unit_price: line.price,
        discount_percent: 0,
      })),
      // `client_id` is intentionally omitted (not a fake/placeholder id) when
      // no client is selected — see the file-level VOUCHER_TYPE note; this
      // technically violates VoucherCreate's `client_id: string` (required)
      // contract at compile time, cast below. No canonical "Consumidor
      // final" client id exists anywhere in this codebase's seed data, so
      // inventing one would silently misattribute the sale — flagged as a
      // real product/backend gap in the apply-progress risk log instead.
    } as unknown as VoucherCreate
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
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-[7px] rounded-[13px] px-5 py-[13px] text-[14.5px] font-bold text-white"
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
