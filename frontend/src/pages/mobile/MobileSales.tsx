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
 * Submit guard: with no client picked yet, the client card shows "Buscar
 * cliente" (an empty/prompt state, NOT a fake default customer) — earlier
 * revisions showed "Consumidor final" here, which a real user flagged as
 * misleading: it looked like a real, submittable default client when it
 * isn't one. `VoucherCreate.client_id` is a required real client id —
 * desktop `Sales.tsx`'s `handleConfirmGenerate` has a hard
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
 * "Factura" resolves `voucher_type` to `invoice_a`/`invoice_b` by the
 * selected client's `tax_condition` — ported byte-for-byte from desktop
 * `Sales.tsx`'s `resolveBackendVoucherType` (lines 293-301: `taxCondition
 * === 'RI' ? 'invoice_a' : 'invoice_b'`), per the project-wide rule that
 * mobile only changes DESIGN, never business logic — every voucher type
 * must produce the same backend payload/behavior as desktop. This branch is
 * now UNREACHABLE via a real submit — see the `KNOWN GAP` comment above
 * `createVoucherMutation`: Factura is hard-blocked at the UI level (`canSubmit`/
 * `submitBlockedReason`/an early return in `handleSubmit`) until the ARCA/CAE
 * electronic-emission gap is closed. The resolution logic itself is kept
 * intact (not deleted) for when that block is lifted, and is exercised
 * directly as a pure function in tests instead of through the CTA.
 *
 * "Acopio" has its own small mobile-designed mini-form (name/amount/
 * discount — replacing the cart-lines section while active) that submits
 * via the REAL backend endpoint desktop uses for this flow,
 * `stockpileService.createByAmount()` — NOT `vouchersService.create()`,
 * matching desktop's `createAcopioMutation`. `billing_client_id` reuses the
 * single selected client (mobile has no separate billing-client UI, same
 * simplification already used for Cta Cte). Desktop's `generate_invoice`
 * checkbox/Phase-2-pending flow is intentionally NOT implemented — that
 * field is optional in `createByAmount`'s type and is simply omitted here.
 */
import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Minus, Plus, Trash2, User, ArrowRight } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import vouchersService, { type VoucherCreate, type VoucherPayment } from '../../api/vouchersService'
import stockpileService from '../../api/stockpileService'
import paymentMethodsService, { type PaymentMethod } from '../../api/paymentMethodsService'
import type { Client } from '../../api/clientsService'
import ClientPickerSheet from '../../components/layout/ClientPickerSheet'
import type { CartLine } from '../../components/layout/MobileShell'
import { formatErrorMessage } from '../../utils/errorHelpers'

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
 * Backend voucher_type resolution — ported byte-for-byte from desktop
 * `Sales.tsx`'s `resolveBackendVoucherType` (lines 293-301). "Cta Cte" and
 * "Remito" both resolve to `'receipt'` (matches desktop: `if (type ===
 * 'receipt' || type === 'current_account') return 'receipt'` —
 * `is_current_account: true` is what actually distinguishes a
 * current-account receipt from a plain one, not a separate enum value).
 * "Factura" resolves by `taxCondition` exactly like desktop's fallthrough
 * case. "Acopio" is never passed to this function — it submits via
 * `stockpileService.createByAmount()` instead, see `handleSubmit`.
 */
export function resolveVoucherType(docType: DocType, taxCondition: string | undefined): VoucherCreate['voucher_type'] {
  if (docType === 'Cotización') return 'quotation'
  if (docType === 'Remito' || docType === 'Cta Cte') return 'receipt'
  // 'Factura' (the only remaining reachable case — 'Acopio' never calls this function):
  return taxCondition === 'RI' ? 'invoice_a' : 'invoice_b'
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

/**
 * Ported byte-for-byte from desktop Sales.tsx's `calculateBackendCompatibleTotalFromCart`
 * (lines 270-291): each line's subtotal/iva/total are rounded to cents
 * INDEPENDENTLY before being summed, to exactly match how the backend avoids
 * compounding rounding drift (summing already-rounded per-line values, not
 * recomputing `subtotal + iva` from the rounded aggregates). `generalDiscountPercent`
 * mirrors desktop's order-level `generalDiscountFactor` — it multiplies
 * together with each line's own `itemDiscountFactor` (not additive: a 10%
 * per-line discount plus a 10% general discount yields a combined 0.9*0.9=0.81
 * factor, i.e. 19% off, not 20%). Defaults to 0 so every existing single-arg
 * call site keeps working unchanged.
 */
const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export function calculateTotals(
  cart: CartLine[],
  generalDiscountPercent = 0
): { subtotal: number; iva: number; total: number } {
  const generalDiscountFactor = 1 - generalDiscountPercent / 100
  return cart.reduce(
    (acc, line) => {
      const itemDiscountFactor = 1 - line.discount / 100
      const subtotalLine = roundMoney(line.price * line.qty * itemDiscountFactor * generalDiscountFactor)
      const ivaLine = roundMoney(subtotalLine * IVA_RATE)
      const totalLine = roundMoney(subtotalLine + ivaLine)
      return {
        subtotal: roundMoney(acc.subtotal + subtotalLine),
        iva: roundMoney(acc.iva + ivaLine),
        total: roundMoney(acc.total + totalLine),
      }
    },
    { subtotal: 0, iva: 0, total: 0 }
  )
}

/**
 * Ported (with one deliberate mobile-V1 simplification) from desktop
 * `Sales.tsx`'s `buildPaymentsPayload`/`validatePayments` (lines 2898-2988).
 * Payments are entirely OPTIONAL here: desktop's invoice-only branches
 * (`voucherType === 'invoice'`/`'invoice_x'` requiring at least one payment)
 * are omitted — they're unreachable on mobile since Factura is hard-blocked
 * from submission (see the `KNOWN GAP` comment above `createVoucherMutation`).
 * Also simplified: desktop's "Cheque" due-date heuristic (`isCheckPaymentMethod`,
 * a fragile name/code match, plus an `extra_date` field formatted into the
 * reference string) is NOT ported — every `requires_reference` method just
 * gets a plain free-text reference input here. This is a lower-fidelity V1
 * UX, not a data-correctness issue: the backend receives whatever reference
 * string is sent either way.
 */
interface PaymentSelectionState {
  selected: boolean
  amount: string
  reference: string
}
type PaymentSelections = Record<string, PaymentSelectionState>

function buildPaymentsPayload(
  paymentMethods: PaymentMethod[],
  selections: PaymentSelections
): VoucherPayment[] | undefined {
  const payload = paymentMethods
    .map((method) => {
      const selection = selections[method.id]
      if (!selection?.selected) return null
      const amountValue = Number(selection.amount)
      if (!Number.isFinite(amountValue) || amountValue <= 0) return null
      const referenceValue = selection.reference.trim()
      return {
        payment_method_id: method.id,
        amount: amountValue,
        reference: referenceValue ? referenceValue : undefined,
      }
    })
    .filter((payment) => payment !== null) as VoucherPayment[]
  return payload.length > 0 ? payload : undefined
}

function validatePayments(
  paymentMethods: PaymentMethod[],
  selections: PaymentSelections,
  expectedTotal: number
): { valid: boolean; message?: string } {
  const selectedMethods = paymentMethods.filter((method) => selections[method.id]?.selected)
  if (selectedMethods.length === 0) return { valid: true }

  for (const method of selectedMethods) {
    const selection = selections[method.id]
    const amountValue = Number(selection.amount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return { valid: false, message: `Ingresá un monto válido para ${method.name}` }
    }
    if (method.requires_reference && !selection.reference.trim()) {
      return { valid: false, message: `Ingresá una referencia para ${method.name}` }
    }
  }

  const assignedTotal = selectedMethods.reduce((acc, method) => acc + (Number(selections[method.id].amount) || 0), 0)
  if (Math.abs(Number(assignedTotal.toFixed(2)) - expectedTotal) > 0.01) {
    return {
      valid: false,
      message: `La suma de pagos ($${assignedTotal.toFixed(2)}) no coincide con el total ($${expectedTotal.toFixed(2)})`,
    }
  }

  return { valid: true }
}

export default function MobileSales({ cart, setCart, onNavigateToProductos }: MobileSalesProps) {
  const [docType, setDocType] = useState<DocType>('Cotización')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  // Acopio mini-form local state — string-backed (matches desktop's own
  // `acopioAmount` string state) so controlled numeric inputs don't fight
  // userEvent.type's keystroke-by-keystroke input over a leading "0".
  const [acopioName, setAcopioName] = useState('')
  const [acopioAmount, setAcopioAmount] = useState('')
  const [acopioDiscount, setAcopioDiscount] = useState('')

  // General (order-level) discount — string-backed for the same
  // controlled-input reason as the Acopio fields above. Hidden for Acopio
  // (that mini-form has its own separate `acopioDiscount`).
  const [generalDiscount, setGeneralDiscount] = useState('')

  // Optional payment-method selection (Cotización/Remito/Cta Cte only — see
  // `buildPaymentsPayload`/`validatePayments` above). Self-fetching, same raw
  // `useQuery` pattern as `MobileCuenta`/`MobileCaja` (no dedicated hook file).
  const { data: paymentMethodsData } = useQuery({
    queryKey: ['mobile-sales-payment-methods'],
    queryFn: () => paymentMethodsService.getAll({ active_only: true }),
    retry: false,
  })
  const paymentMethods = paymentMethodsData ?? []
  const [paymentSelections, setPaymentSelections] = useState<PaymentSelections>({})

  const togglePaymentMethod = (methodId: string) => {
    setPaymentSelections((prev) => {
      const existing = prev[methodId] ?? { selected: false, amount: '', reference: '' }
      return { ...prev, [methodId]: { ...existing, selected: !existing.selected } }
    })
  }

  const updatePaymentAmount = (methodId: string, amount: string) => {
    setPaymentSelections((prev) => ({
      ...prev,
      [methodId]: { ...(prev[methodId] ?? { selected: true, amount: '', reference: '' }), amount },
    }))
  }

  const updatePaymentReference = (methodId: string, reference: string) => {
    setPaymentSelections((prev) => ({
      ...prev,
      [methodId]: { ...(prev[methodId] ?? { selected: true, amount: '', reference: '' }), reference },
    }))
  }

  /**
   * Handle to the blank tab opened synchronously inside `handleSubmit` (the
   * real click handler), BEFORE `.mutate(...)` is called. Most mobile
   * browsers only allow `window.open()` when it runs in the same synchronous
   * call stack as the user gesture that triggered it — opening it here and
   * only navigating it later (once the PDF blob resolves, inside a `.then`/
   * `useMutation` `onSuccess`) is the standard popup-blocker-safe pattern.
   * `null` means the browser blocked it outright (or `handleSubmit` didn't
   * open one for this submission) — every consumer of this ref must treat
   * that as a silent no-op, never an error.
   */
  const pdfWindowRef = useRef<Window | null>(null)

  const openPdfInPreopenedWindow = (blob: Blob) => {
    const win = pdfWindowRef.current
    if (!win) return
    win.location.href = URL.createObjectURL(blob)
  }

  /**
   * KNOWN GAP vs desktop (not fixed here, flagged for a dedicated follow-up):
   * desktop's `createVoucherMutation.onSuccess` (Sales.tsx ~888-935) additionally
   * calls `arcaService.emitInvoice()` for real invoice types (invoice_a/b/c,
   * not invoice_x) to get a CAE from AFIP/ARCA, and DELETES the voucher if that
   * emission fails/mismatches — a voucher without CAE is not fiscally valid.
   * This mobile screen does not replicate that step: a "Factura" submitted from
   * here would be created in the DB but never emitted, unlike desktop.
   *
   * Because of that gap, "Factura" is now explicitly HARD-BLOCKED at the UI
   * level (not just an unmentioned gap) — see `canSubmit`/`submitBlockedReason`
   * below and the defensive early return at the top of `handleSubmit` — until
   * the ARCA/CAE decision for mobile is made. `resolveVoucherType`'s Factura
   * branch and `createVoucherMutation` itself are intentionally left intact
   * (not deleted) for when that block is lifted.
   */
  const createVoucherMutation = useMutation({
    mutationFn: (payload: VoucherCreate) => vouchersService.create(payload),
    onSuccess: async (data) => {
      const fullNumber = data.sale_point ? `${data.sale_point}-${data.number}` : data.number
      toast.success(`Comprobante ${fullNumber} generado correctamente`)
      setCart([])
      setSelectedClient(null)

      // Mirrors desktop Sales.tsx's post-success PDF flow (~lines 888-935):
      // fetch the just-created voucher's PDF and show it. A failure here is
      // just the PDF step failing, NOT the voucher creation itself — the
      // voucher already exists, so the success toast/cart-clear above stand.
      try {
        const blob = await vouchersService.getPdf(data.id)
        openPdfInPreopenedWindow(blob)
      } catch (error) {
        console.error('Error al descargar el PDF del comprobante:', error)
      }
    },
    onError: (error) => {
      toast.error('Error al generar el comprobante: ' + formatErrorMessage(error))
    },
  })

  const createAcopioMutation = useMutation({
    mutationFn: (payload: Parameters<typeof stockpileService.createByAmount>[0]) =>
      stockpileService.createByAmount(payload),
    onSuccess: async (data) => {
      toast.success(`Acopio "${data.name}" creado correctamente`)
      setAcopioName('')
      setAcopioAmount('')
      setAcopioDiscount('')
      setSelectedClient(null)

      // Only the acopio's initial deposit auto-generates a child "remito"
      // receipt (`principal_voucher_id`) — a pure by-amount acopio with no
      // upfront deposit has none, so there's simply no PDF to show.
      if (data.principal_voucher_id) {
        try {
          const blob = await stockpileService.getVoucherById(data.principal_voucher_id)
          openPdfInPreopenedWindow(blob)
        } catch (error) {
          console.error('Error al descargar el PDF del remito de acopio:', error)
        }
      }
    },
    onError: (error) => {
      toast.error('Error al crear acopio: ' + formatErrorMessage(error))
    },
  })

  const isSubmitting = createVoucherMutation.isPending || createAcopioMutation.isPending

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

  const updateDiscount = (code: string, discount: number) => {
    setCart((prev) => prev.map((line) => (line.code === code ? { ...line, discount } : line)))
  }

  const generalDiscountValue = Number(generalDiscount) || 0
  const totals = calculateTotals(cart, generalDiscountValue)
  const cartEmpty = cart.length === 0
  const noClientSelected = selectedClient === null
  const isCurrentAccount = docType === 'Cta Cte'
  const isAcopio = docType === 'Acopio'
  const isFactura = docType === 'Factura'
  const acopioAmountValue = Number(acopioAmount) || 0
  const acopioFormValid = acopioName.trim().length > 0 && acopioAmountValue > 0
  const paymentsValidation = isAcopio ? { valid: true } : validatePayments(paymentMethods, paymentSelections, totals.total)
  /** Mirrors desktop Sales.tsx's `!selectedClient` guard for every doc type; Acopio additionally requires its own mini-form (name + amount) to be filled, mirroring desktop's `handleGenerateClick` Acopio validation. The empty "Buscar cliente" state is a prompt, never a submittable client. Factura is hard-blocked pending the ARCA/CAE gap (see the `KNOWN GAP` comment above `createVoucherMutation`) — never submittable regardless of client/cart. */
  const canSubmit = !noClientSelected && !isFactura && (!isAcopio || acopioFormValid) && paymentsValidation.valid && !isSubmitting
  const submitBlockedReason = noClientSelected
    ? 'Elegí un cliente para continuar'
    : isFactura
      ? 'Facturar no está disponible desde mobile todavía — generala desde el escritorio'
      : isAcopio && !acopioFormValid
        ? 'Completá nombre y monto del acopio'
        : !paymentsValidation.valid
          ? (paymentsValidation.message ?? null)
          : null
  const showTotalsBar = isAcopio || !cartEmpty

  const handleSubmit = () => {
    // Belt-and-suspenders alongside the `canSubmit` gate — Factura must never
    // reach `vouchersService.create()`, see the `KNOWN GAP` comment above.
    if (isFactura) return
    if (!canSubmit || !selectedClient) return

    if (isAcopio) {
      // Popup-blocker-safe: open the blank tab HERE, synchronously inside the
      // click handler, before the async mutation kicks off — see
      // `pdfWindowRef`'s doc comment above.
      pdfWindowRef.current = window.open('', '_blank')
      createAcopioMutation.mutate({
        client_id: selectedClient.id,
        billing_client_id: selectedClient.id,
        name: acopioName.trim(),
        currency: 'ARS',
        amount: acopioAmountValue,
        discount_percent: Number(acopioDiscount) || 0,
      })
      return
    }

    if (cartEmpty) return
    pdfWindowRef.current = window.open('', '_blank')
    const payload: VoucherCreate = {
      client_id: selectedClient.id,
      voucher_type: resolveVoucherType(docType, selectedClient.tax_condition),
      date: new Date().toISOString().slice(0, 10),
      show_prices: true,
      general_discount: generalDiscountValue,
      is_current_account: isCurrentAccount,
      ...(isCurrentAccount
        ? { billing_client_id: selectedClient.id, operating_client_id: selectedClient.id }
        : {}),
      items: cart.map((line) => ({
        product_id: line.product_id,
        quantity: line.qty,
        unit_price: line.price,
        discount_percent: line.discount,
      })),
      payments: buildPaymentsPayload(paymentMethods, paymentSelections),
    }
    createVoucherMutation.mutate(payload)
  }

  return (
    <div className="relative px-4 pb-[200px] pt-4">
      {/* Client + doc type */}
      <button
        type="button"
        onClick={() => setClientPickerOpen(true)}
        aria-label={`Cliente: ${selectedClient?.name ?? 'Buscar cliente'}`}
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
          <p className="text-sm font-bold text-[#121325]">{selectedClient?.name ?? 'Buscar cliente'}</p>
        </div>
      </button>

      <div className="mt-[11px] flex gap-[7px] overflow-x-auto pb-1">
        {DOC_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setDocType(type)}
            className="flex-none rounded-[11px] px-[14px] py-2 text-[10.5px] font-semibold"
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

      {isAcopio ? (
        /* Acopio mini-form — own mobile design, replaces cart lines while active.
           Cart state is untouched/preserved underneath (not cleared), so switching
           back to another doc type restores it exactly as it was. */
        <div className="mt-[18px] flex flex-col gap-[11px]">
          <p className="text-xs font-semibold uppercase tracking-[.1em] text-[#7b6b95]">Datos del acopio</p>
          <div className="flex h-[46px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3">
            <input
              value={acopioName}
              onChange={(e) => setAcopioName(e.target.value)}
              placeholder="Nombre / obra"
              aria-label="Nombre del acopio"
              className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
            />
          </div>
          <div className="flex h-[46px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3">
            <input
              type="number"
              value={acopioAmount}
              onChange={(e) => setAcopioAmount(e.target.value)}
              placeholder="Monto"
              aria-label="Monto del acopio"
              className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
            />
          </div>
          <div className="flex h-[46px] items-center rounded-[13px] border border-[#ece6f6] bg-white px-3">
            <input
              type="number"
              value={acopioDiscount}
              onChange={(e) => setAcopioDiscount(e.target.value)}
              placeholder="Descuento % (opcional)"
              aria-label="Descuento del acopio"
              className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
            />
          </div>
        </div>
      ) : (
        <>
          {/* Cart header */}
          <div className="mb-[9px] mt-[18px] flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[.1em] text-[#7b6b95]">
              Productos ({cart.length})
            </p>
            <button
              type="button"
              onClick={onNavigateToProductos}
              className="flex items-center gap-1 text-[10.5px] font-bold text-[#7c5ca8]"
            >
              Agregar
              <Plus size={15} strokeWidth={2.4} />
            </button>
          </div>

          {cartEmpty && (
            <div className="rounded-[15px] border border-dashed border-[#d9caeb] bg-white p-[34px_18px] text-center text-[#9089a0]">
              <p className="text-[11.5px]">Todavía no agregaste productos.</p>
              <button
                type="button"
                onClick={onNavigateToProductos}
                className="mt-3 rounded-[11px] bg-[#7c5ca8] px-[18px] py-2.5 text-[11px] font-bold text-white"
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
                  <p className="flex-1 text-[11px] font-semibold leading-tight text-[#121325]">{line.desc}</p>
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
                      {formatCurrency(
                        roundMoney(line.qty * line.price * (1 - line.discount / 100) * (1 - generalDiscountValue / 100))
                      )}
                    </p>
                  </div>
                </div>
                {/* Per-line discount — mobile-native addition (not in the
                    static design handoff mockup), mirrors desktop Sales.tsx's
                    per-item discount input; feeds calculateTotals/discount_percent. */}
                <div className="mt-[9px] flex items-center justify-end gap-[6px]">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={line.discount === 0 ? '' : line.discount}
                    onChange={(e) => updateDiscount(line.code, Number(e.target.value) || 0)}
                    placeholder="Desc. %"
                    aria-label={`Descuento de ${line.desc}`}
                    className="w-[64px] rounded-[9px] border border-[#ece6f6] bg-[#f7f4fb] px-2 py-1 text-right text-[10px] font-semibold text-[#121325] outline-none"
                  />
                  <span className="text-[11px] text-[#9089a0]">% desc.</span>
                </div>
              </div>
            ))}
          </div>

          {/* General (order-level) discount — mobile-native addition, mirrors
              desktop Sales.tsx's order-level discount; multiplies together
              with each line's own discount in calculateTotals/general_discount. */}
          <div className="mt-[11px] flex items-center justify-end gap-[6px]">
            <input
              type="number"
              min={0}
              max={100}
              value={generalDiscount}
              onChange={(e) => setGeneralDiscount(e.target.value)}
              placeholder="Desc. general %"
              aria-label="Descuento general"
              className="w-[64px] rounded-[9px] border border-[#ece6f6] bg-[#f7f4fb] px-2 py-1 text-right text-[10px] font-semibold text-[#121325] outline-none"
            />
            <span className="text-[11px] text-[#9089a0]">% desc. general</span>
          </div>

          {/* Optional payment-method selection — ported (simplified, see
              buildPaymentsPayload/validatePayments doc comment above) from
              desktop's payment section. Not shown for Acopio (no payments
              concept there). */}
          <div className="mt-[18px] flex flex-col gap-[9px]">
            <p className="text-xs font-semibold uppercase tracking-[.1em] text-[#7b6b95]">
              Métodos de pago (opcional)
            </p>
            {paymentMethods.map((method) => {
              const selection = paymentSelections[method.id] ?? { selected: false, amount: '', reference: '' }
              return (
                <div key={method.id} className="rounded-[13px] border border-[#ece6f6] bg-white p-[11px_13px]">
                  <button
                    type="button"
                    onClick={() => togglePaymentMethod(method.id)}
                    aria-pressed={selection.selected}
                    className="flex w-full items-center justify-between text-left text-sm font-semibold text-[#121325]"
                  >
                    {method.name}
                    <span aria-hidden="true" style={{ color: selection.selected ? '#7c5ca8' : '#cdb9e0' }}>
                      {selection.selected ? '✓' : '○'}
                    </span>
                  </button>
                  {selection.selected && (
                    <div className="mt-[9px] flex flex-col gap-[7px]">
                      <input
                        type="number"
                        value={selection.amount}
                        onChange={(e) => updatePaymentAmount(method.id, e.target.value)}
                        placeholder="Monto"
                        aria-label={`Monto de ${method.name}`}
                        className="h-[40px] rounded-[10px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
                      />
                      {method.requires_reference && (
                        <input
                          value={selection.reference}
                          onChange={(e) => updatePaymentReference(method.id, e.target.value)}
                          placeholder="Referencia"
                          aria-label={`Referencia de ${method.name}`}
                          className="h-[40px] rounded-[10px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Sticky totals bar */}
      {showTotalsBar && (
        <div
          data-testid="sales-totals-bar"
          className="fixed inset-x-0 z-30 bg-white p-[13px_16px_14px]"
          style={{ bottom: '84px', borderTop: '1px solid #ece6f6', boxShadow: '0 -8px 24px rgba(58,36,89,.10)' }}
        >
          {!isAcopio && (
            <>
              <div className="mb-[3px] flex justify-between text-[10.5px] text-[#7b6b95]">
                <span>Subtotal (sin IVA)</span>
                <span className="font-semibold text-[#121325]">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="mb-2 flex justify-between text-[10.5px] text-[#7b6b95]">
                <span>IVA (21%)</span>
                <span className="font-semibold text-[#121325]">{formatCurrency(totals.iva)}</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-[.1em] text-[#9089a0]">Total</p>
              <p className="font-display text-2xl font-extrabold text-[#121325]">
                {formatCurrency(isAcopio ? acopioAmountValue : totals.total)}
              </p>
              {submitBlockedReason && (
                <p className="mt-1 text-[11px] font-semibold text-[#c0392b]">{submitBlockedReason}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-[7px] rounded-[13px] px-5 py-[13px] text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'linear-gradient(140deg,#7c5ca8,#5c3a8c)', boxShadow: '0 8px 18px rgba(92,58,140,.35)' }}
            >
              {isSubmitting ? 'Procesando...' : CTA_LABELS[docType]}
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
