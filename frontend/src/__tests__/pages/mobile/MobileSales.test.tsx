import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { CartLine } from '../../../components/layout/MobileShell'
import type { Client } from '../../../api/clientsService'
import type { VoucherCreate } from '../../../api/vouchersService'

const { searchMock, createMock, createByAmountMock, getPdfMock, getVoucherByIdMock, toastSuccessMock, toastErrorMock } =
  vi.hoisted(() => ({
    searchMock: vi.fn(),
    createMock: vi.fn(),
    createByAmountMock: vi.fn(),
    getPdfMock: vi.fn(),
    getVoucherByIdMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }))

vi.mock('../../../api/clientsService', () => ({
  default: { search: searchMock },
}))

vi.mock('../../../api/vouchersService', () => ({
  default: { create: createMock, getPdf: getPdfMock },
}))

vi.mock('../../../api/stockpileService', () => ({
  default: { createByAmount: createByAmountMock, getVoucherById: getVoucherByIdMock },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccessMock, error: toastErrorMock },
}))

import MobileSales, { mergeCartLine, calculateTotals } from '../../../pages/mobile/MobileSales'

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return { code: 'P1', desc: 'Producto A', qty: 1, price: 1000, product_id: 'p1', discount: 0, ...overrides }
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    business_id: 'b1',
    name: 'Juan Pérez',
    document_type: 'DNI',
    document_number: '30111222',
    tax_condition: 'consumidor_final',
    client_type_id: 'ct1',
    current_balance: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function renderSales(initialCart: CartLine[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const setCartSpy = vi.fn()

  function Harness() {
    const [cart, setCart] = useState<CartLine[]>(initialCart)
    return (
      <MobileSales
        cart={cart}
        setCart={(update) => {
          setCartSpy(update)
          setCart(update)
        }}
      />
    )
  }

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  )
  return { ...utils, setCartSpy }
}

let windowOpenMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  searchMock.mockResolvedValue([])
  createMock.mockResolvedValue({ id: 'v1' })
  createByAmountMock.mockResolvedValue({ id: 's1', name: 'Obra Rivadavia', stockpile_number: 1 })
  getPdfMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  getVoucherByIdMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  // jsdom doesn't implement URL.createObjectURL — stub it so the PDF auto-open
  // flow (window.location.href = URL.createObjectURL(blob)) is exercisable.
  ;(URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = vi.fn(() => 'blob:mock-url')
  // window.open must be mocked to return a fake window handle — mirrors the
  // popup-blocker-safe pattern under test (handleSubmit opens a blank tab
  // synchronously, then the mutation's onSuccess routes the PDF into it).
  windowOpenMock = vi.fn(() => ({ location: {} }) as unknown as Window)
  vi.stubGlobal('open', windowOpenMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MobileSales — mergeCartLine (pure reducer, reused from MobileShell.handleAddToCart)', () => {
  it('adds a new line at qty 1 when the product code is not yet in the cart', () => {
    const result = mergeCartLine([], makeLine({ code: 'P1', qty: 1 }))
    expect(result).toEqual([makeLine({ code: 'P1', qty: 1 })])
  })

  it('increments the existing line by the incoming qty instead of duplicating it', () => {
    const existing = [makeLine({ code: 'P1', qty: 1 })]
    const result = mergeCartLine(existing, makeLine({ code: 'P1', qty: 1 }))
    expect(result).toHaveLength(1)
    expect(result[0].qty).toBe(2)
  })
})

describe('MobileSales — totals calculation', () => {
  it('computes subtotal, iva (21%) and total from cart lines', () => {
    const totals = calculateTotals([
      makeLine({ qty: 2, price: 1000 }),
      makeLine({ code: 'P2', qty: 1, price: 500 }),
    ])
    expect(totals).toEqual({ subtotal: 2500, iva: 525, total: 3025 })
  })

  it('renders AR-formatted totals in the sticky totals bar', () => {
    renderSales([makeLine({ qty: 2, price: 1000 }), makeLine({ code: 'P2', qty: 1, price: 500 })])
    expect(screen.getByText('$2.500,00')).toBeInTheDocument()
    expect(screen.getByText('$525,00')).toBeInTheDocument()
    expect(screen.getByText('$3.025,00')).toBeInTheDocument()
  })

  it('applies a line\'s individual discount percentage to its subtotal/iva/total (ported from desktop calculateBackendCompatibleTotalFromCart)', () => {
    const totals = calculateTotals([makeLine({ qty: 2, price: 1000, discount: 10 })])
    // subtotalLine = round(1000*2*0.9) = 1800, ivaLine = round(1800*0.21) = 378, totalLine = 2178
    expect(totals).toEqual({ subtotal: 1800, iva: 378, total: 2178 })
  })

  it('applies discounts independently per line, not as a single shared/global discount', () => {
    const totals = calculateTotals([
      makeLine({ code: 'P1', qty: 1, price: 1000, discount: 10 }),
      makeLine({ code: 'P2', qty: 1, price: 1000, discount: 0 }),
    ])
    // line1: subtotal 900, iva 189, total 1089 — line2: subtotal 1000, iva 210, total 1210
    expect(totals).toEqual({ subtotal: 1900, iva: 399, total: 2299 })
  })
})

describe('MobileSales — cart item lifecycle (UI)', () => {
  it('decrements qty by 1 when qty > 1', async () => {
    renderSales([makeLine({ qty: 2 })])
    await userEvent.click(screen.getByLabelText(/restar cantidad de producto a/i))
    expect(await screen.findByText('1')).toBeInTheDocument()
  })

  it('does not go below qty 1 on decrement (floor, no removal)', async () => {
    renderSales([makeLine({ qty: 1 })])
    await userEvent.click(screen.getByLabelText(/restar cantidad de producto a/i))
    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('increments qty by 1 via the + stepper', async () => {
    renderSales([makeLine({ qty: 1 })])
    await userEvent.click(screen.getByLabelText(/sumar cantidad de producto a/i))
    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('removes the line entirely via the trash icon, regardless of qty', async () => {
    renderSales([makeLine({ qty: 3 })])
    await userEvent.click(screen.getByLabelText(/eliminar producto a del carrito/i))
    await waitFor(() => {
      expect(screen.queryByText('Producto A')).not.toBeInTheDocument()
    })
  })

  it('editing a line\'s discount input updates the rendered totals bar', async () => {
    renderSales([makeLine({ qty: 1, price: 1000 })])
    await userEvent.type(screen.getByLabelText(/descuento de producto a/i), '10')

    const totalsBar = within(await screen.findByTestId('sales-totals-bar'))
    expect(totalsBar.getByText('$900,00')).toBeInTheDocument()
    expect(totalsBar.getByText('$189,00')).toBeInTheDocument()
    expect(totalsBar.getByText('$1.089,00')).toBeInTheDocument()
  })

  it('also updates the line\'s own displayed subtotal to reflect its discount (not just the totals bar)', async () => {
    renderSales([makeLine({ qty: 1, price: 1000 })])
    await userEvent.type(screen.getByLabelText(/descuento de producto a/i), '10')

    // Line-card subtotal (qty × price × (1 - discount%)) must match the
    // discounted amount, not the pre-discount qty×price — otherwise the card
    // itself would misleadingly still show the undiscounted line subtotal
    // while only the totals bar below reflected the discount.
    await waitFor(() => {
      const totalsBar = screen.getByTestId('sales-totals-bar')
      expect(screen.getAllByText('$900,00').filter((el) => !totalsBar.contains(el))).toHaveLength(1)
    })
  })
})

describe('MobileSales — empty cart state', () => {
  it('shows the empty state and hides the sticky totals bar when cart is empty', () => {
    renderSales([])
    expect(screen.getByText(/todavía no agregaste productos/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /buscar productos/i })).toBeInTheDocument()
    expect(screen.queryByTestId('sales-totals-bar')).not.toBeInTheDocument()
  })
})

describe('MobileSales — doc-type switching', () => {
  it('selects a doc-type chip and changes the CTA label, differing between Cotización and Factura', async () => {
    renderSales([makeLine()])
    expect(screen.getByRole('button', { name: /generar/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Factura' }))
    expect(screen.getByRole('button', { name: /facturar/i })).toBeInTheDocument()
  })

  it('preserves cart lines and totals when switching doc type', async () => {
    renderSales([
      makeLine({ qty: 2, price: 1000 }),
      makeLine({ code: 'P2', desc: 'Producto B', qty: 1, price: 500 }),
    ])
    expect(screen.getByText('$3.025,00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Factura' }))

    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.getByText('Producto B')).toBeInTheDocument()
    expect(screen.getByText('$3.025,00')).toBeInTheDocument()
  })
})

describe('MobileSales — client picker', () => {
  it('shows "Consumidor final" by default and opens the picker sheet on tap', async () => {
    renderSales([makeLine()])
    expect(screen.getByText('Consumidor final')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /cliente/i }))
    expect(await screen.findByRole('dialog', { name: /buscar cliente/i })).toBeInTheDocument()
  })

  it('calls clientsService.search with the typed query (debounced)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    searchMock.mockResolvedValue([makeClient()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    renderSales([makeLine()])
    await user.click(screen.getByRole('button', { name: /cliente/i }))
    await user.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'juan')

    vi.advanceTimersByTime(350)

    await waitFor(() => {
      expect(searchMock).toHaveBeenCalledWith('juan')
    })

    vi.useRealTimers()
  })

  it('selecting a client closes the sheet, updates the card, and attaches client_id to the voucher payload on CTA submit', async () => {
    searchMock.mockResolvedValue([makeClient({ id: 'c1', name: 'Juan Pérez' })])

    renderSales([makeLine()])
    await userEvent.click(screen.getByRole('button', { name: /cliente/i }))
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'juan')

    await userEvent.click(await screen.findByRole('button', { name: /juan pérez/i }, { timeout: 2000 }))

    expect(screen.queryByRole('dialog', { name: /buscar cliente/i })).not.toBeInTheDocument()
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ client_id: 'c1' } satisfies Partial<VoucherCreate>)
      )
    })
  })

  it('clearing the selection reverts to Consumidor final and disables the CTA again (no submit possible without a real client)', async () => {
    searchMock.mockResolvedValue([makeClient({ id: 'c1', name: 'Juan Pérez' })])

    renderSales([makeLine()])
    await userEvent.click(screen.getByRole('button', { name: /cliente/i }))
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'juan')
    await userEvent.click(await screen.findByRole('button', { name: /juan pérez/i }, { timeout: 2000 }))
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generar/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /cliente/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Consumidor final' }))

    expect(screen.getByText('Consumidor final')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generar/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /generar/i }))
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('MobileSales — submit requires a real client (matches desktop\'s !selectedClient guard)', () => {
  it('disables the CTA submit button while the client is still the default "Consumidor final" placeholder', () => {
    renderSales([makeLine()])
    expect(screen.getByText('Consumidor final')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generar/i })).toBeDisabled()
  })

  it('shows an inline validation hint explaining why submit is blocked when no client is selected', () => {
    renderSales([makeLine()])
    expect(screen.getByText(/eleg[ií].*cliente/i)).toBeInTheDocument()
  })

  it('enables the CTA submit button once a real client is picked via ClientPickerSheet', async () => {
    searchMock.mockResolvedValue([makeClient({ id: 'c1', name: 'Juan Pérez' })])

    renderSales([makeLine()])
    expect(screen.getByRole('button', { name: /generar/i })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /cliente/i }))
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'juan')
    await userEvent.click(await screen.findByRole('button', { name: /juan pérez/i }, { timeout: 2000 }))

    expect(screen.getByRole('button', { name: /generar/i })).toBeEnabled()
    expect(screen.queryByText(/eleg[ií].*cliente/i)).not.toBeInTheDocument()
  })

  it('never calls vouchersService.create() while the CTA is disabled, even if clicked', async () => {
    renderSales([makeLine()])
    await userEvent.click(screen.getByRole('button', { name: /generar/i }))
    expect(createMock).not.toHaveBeenCalled()
  })
})

async function pickClient(client: Client = makeClient({ id: 'c1', name: 'Juan Pérez' })) {
  searchMock.mockResolvedValue([client])
  await userEvent.click(screen.getByRole('button', { name: /cliente/i }))
  await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'juan')
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(client.name, 'i') }, { timeout: 2000 }))
}

describe('MobileSales — Cta Cte payload (matches desktop\'s current-account flow, Sales.tsx ~2188-2226)', () => {
  it('submits with voucher_type "receipt", is_current_account true, and billing/operating client ids set to the selected client', async () => {
    renderSales([makeLine({ qty: 2, price: 1000, product_id: 'p1' })])
    await pickClient(makeClient({ id: 'c1', name: 'Juan Pérez' }))

    await userEvent.click(screen.getByRole('button', { name: 'Cta Cte' }))
    expect(screen.getByRole('button', { name: /cargar a cuenta/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /cargar a cuenta/i }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          voucher_type: 'receipt',
          is_current_account: true,
          billing_client_id: 'c1',
          operating_client_id: 'c1',
          client_id: 'c1',
        } satisfies Partial<VoucherCreate>)
      )
    })
  })

  it('does NOT set is_current_account/billing_client_id/operating_client_id for other doc types (e.g. Cotización)', async () => {
    renderSales([makeLine()])
    await pickClient()

    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    await waitFor(() => expect(createMock).toHaveBeenCalled())
    const payload = createMock.mock.calls[0][0] as VoucherCreate
    expect(payload.voucher_type).toBe('quotation')
    expect(payload.is_current_account).toBeFalsy()
    expect(payload.billing_client_id).toBeUndefined()
    expect(payload.operating_client_id).toBeUndefined()
  })
})

describe('MobileSales — Factura resolves invoice_a/invoice_b by tax_condition (ported from desktop resolveBackendVoucherType, Sales.tsx ~293-301)', () => {
  it('submits voucher_type "invoice_a" for a client with tax_condition RI', async () => {
    renderSales([makeLine()])
    await pickClient(makeClient({ id: 'c1', name: 'Juan Pérez', tax_condition: 'RI' }))

    await userEvent.click(screen.getByRole('button', { name: 'Factura' }))
    await userEvent.click(screen.getByRole('button', { name: /facturar/i }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ voucher_type: 'invoice_a', client_id: 'c1' } satisfies Partial<VoucherCreate>)
      )
    })
  })

  it('submits voucher_type "invoice_b" for a client with a non-RI tax_condition (e.g. Monotributista)', async () => {
    renderSales([makeLine()])
    await pickClient(makeClient({ id: 'c1', name: 'Juan Pérez', tax_condition: 'Monotributista' }))

    await userEvent.click(screen.getByRole('button', { name: 'Factura' }))
    await userEvent.click(screen.getByRole('button', { name: /facturar/i }))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ voucher_type: 'invoice_b', client_id: 'c1' } satisfies Partial<VoucherCreate>)
      )
    })
  })
})

describe('MobileSales — Acopio mini-form (own mobile-designed form, wired to the real stockpileService.createByAmount endpoint)', () => {
  it('renders name/amount/discount inputs when the Acopio chip is active, replacing the cart-lines UI', async () => {
    renderSales([makeLine()])
    await userEvent.click(screen.getByRole('button', { name: 'Acopio' }))

    expect(screen.getByLabelText(/nombre.*acopio/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/monto.*acopio/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/descuento.*acopio/i)).toBeInTheDocument()
    expect(screen.queryByText('Producto A')).not.toBeInTheDocument()
  })

  it('disables the CTA until client, name and amount are all present', async () => {
    renderSales([makeLine()])
    await userEvent.click(screen.getByRole('button', { name: 'Acopio' }))
    expect(screen.getByRole('button', { name: /registrar acopio/i })).toBeDisabled()

    await pickClient()
    expect(screen.getByRole('button', { name: /registrar acopio/i })).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/nombre.*acopio/i), 'Obra Rivadavia')
    expect(screen.getByRole('button', { name: /registrar acopio/i })).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/monto.*acopio/i), '50000')
    expect(screen.getByRole('button', { name: /registrar acopio/i })).toBeEnabled()
  })

  it('submits via stockpileService.createByAmount (NOT vouchersService.create) with the exact expected payload', async () => {
    renderSales([makeLine()])
    await pickClient(makeClient({ id: 'c1', name: 'Juan Pérez' }))
    await userEvent.click(screen.getByRole('button', { name: 'Acopio' }))
    await userEvent.type(screen.getByLabelText(/nombre.*acopio/i), 'Obra Rivadavia')
    await userEvent.type(screen.getByLabelText(/monto.*acopio/i), '50000')
    await userEvent.type(screen.getByLabelText(/descuento.*acopio/i), '10')

    await userEvent.click(screen.getByRole('button', { name: /registrar acopio/i }))

    await waitFor(() => {
      expect(createByAmountMock).toHaveBeenCalledWith({
        client_id: 'c1',
        billing_client_id: 'c1',
        name: 'Obra Rivadavia',
        currency: 'ARS',
        amount: 50000,
        discount_percent: 10,
      })
    })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('restores the normal cart UI when switching away from Acopio to another doc type', async () => {
    renderSales([makeLine()])
    await userEvent.click(screen.getByRole('button', { name: 'Acopio' }))
    expect(screen.queryByText('Producto A')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cotización' }))

    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.queryByLabelText(/nombre.*acopio/i)).not.toBeInTheDocument()
  })
})

describe('MobileSales — cart price MUST be net, not gross, for correct IVA math and voucher payload (fiscal correctness, ported from desktop\'s effectiveNetPrice/"sale_price ya contiene IVA" contract, Sales.tsx ~1687-1690/~2234/~2993)', () => {
  it('calculateTotals treats cart price as net: net subtotal × 1.21 = correct gross total, not double-taxed', () => {
    // Reflects a product with net_price=1000 (its gross sale_price would be
    // 1210 = 1000*1.21, per the real backend formula). The cart MUST carry
    // the NET price (1000) — calculateTotals then adds IVA once (210) to
    // reach the correct gross total (1210), matching what the backend
    // itself computes from a net unit_price. If the cart wrongly carried
    // the gross price (1210) here, this would incorrectly double-tax:
    // 1210 + (1210*0.21=254.10) = 1464.10 — NOT what this asserts.
    const totals = calculateTotals([
      { code: 'P1', desc: 'Producto A', qty: 1, price: 1000, product_id: 'p1', discount: 0 },
    ])
    expect(totals).toEqual({ subtotal: 1000, iva: 210, total: 1210 })
  })

  it('sends the cart line price as-is (net) as unit_price in the vouchersService.create() payload — MobileProducts is responsible for feeding net, not gross, into the cart', async () => {
    renderSales([makeLine({ price: 1000, qty: 1, product_id: 'p1' })])
    await pickClient()

    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    await waitFor(() => expect(createMock).toHaveBeenCalled())
    const payload = createMock.mock.calls[0][0] as VoucherCreate
    expect(payload.items[0].unit_price).toBe(1000)
  })
})

describe('MobileSales — per-line discount_percent in the vouchersService.create() payload (matches desktop\'s per-item discount, not a single shared value)', () => {
  it('sends each cart line\'s own discount value as discount_percent, independently', async () => {
    renderSales([
      makeLine({ code: 'P1', desc: 'Producto A', qty: 1, price: 1000, discount: 10 }),
      makeLine({ code: 'P2', desc: 'Producto B', qty: 1, price: 500, discount: 0 }),
    ])
    await pickClient()

    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    await waitFor(() => expect(createMock).toHaveBeenCalled())
    const payload = createMock.mock.calls[0][0] as VoucherCreate
    expect(payload.items[0].discount_percent).toBe(10)
    expect(payload.items[1].discount_percent).toBe(0)
  })
})

describe('MobileSales — submit feedback (previously silent: tapping the CTA gave no success/error signal at all)', () => {
  it('shows a success toast and clears the cart once vouchersService.create() resolves', async () => {
    createMock.mockResolvedValue({ id: 'v1', sale_point: '0001', number: '00000042', voucher_type: 'quotation' })

    renderSales([makeLine()])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(screen.getByText(/todavía no agregaste productos/i)).toBeInTheDocument()
  })

  it('shows a visible error toast and keeps the cart intact when vouchersService.create() rejects', async () => {
    createMock.mockRejectedValue(new Error('Network Error'))

    renderSales([makeLine()])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/network error/i)))
    expect(screen.getByText('Producto A')).toBeInTheDocument()
  })

  it('shows a success toast and resets the mini-form once stockpileService.createByAmount() resolves', async () => {
    createByAmountMock.mockResolvedValue({ id: 's1', name: 'Obra Rivadavia', stockpile_number: 1 })

    renderSales([])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: 'Acopio' }))
    await userEvent.type(screen.getByLabelText(/nombre del acopio/i), 'Obra Rivadavia')
    await userEvent.type(screen.getByLabelText(/monto del acopio/i), '5000')
    await userEvent.click(screen.getByRole('button', { name: /registrar acopio/i }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(screen.getByLabelText(/nombre del acopio/i)).toHaveValue('')
  })

  it('shows a visible error toast when stockpileService.createByAmount() rejects', async () => {
    createByAmountMock.mockRejectedValue(new Error('Network Error'))

    renderSales([])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: 'Acopio' }))
    await userEvent.type(screen.getByLabelText(/nombre del acopio/i), 'Obra Rivadavia')
    await userEvent.type(screen.getByLabelText(/monto del acopio/i), '5000')
    await userEvent.click(screen.getByRole('button', { name: /registrar acopio/i }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/network error/i)))
  })

  it('disables the CTA and shows a pending label while the mutation is in flight, to prevent double-submit', async () => {
    let resolveCreate: (voucher: unknown) => void = () => {}
    createMock.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve }))

    renderSales([makeLine()])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    expect(screen.getByRole('button', { name: /procesando/i })).toBeDisabled()

    resolveCreate({ id: 'v1', sale_point: '0001', number: '00000042', voucher_type: 'quotation' })
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
  })
})

describe('MobileSales — auto-open generated PDF after success (mirrors desktop\'s post-success getPdf/getVoucherById flow, popup-blocker-safe)', () => {
  it('opens a blank tab synchronously on submit, then routes the voucher PDF into it once vouchersService.getPdf resolves', async () => {
    createMock.mockResolvedValue({ id: 'v1', sale_point: '0001', number: '00000042', voucher_type: 'quotation' })

    renderSales([makeLine()])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    expect(windowOpenMock).toHaveBeenCalledWith('', '_blank')
    await waitFor(() => expect(getPdfMock).toHaveBeenCalledWith('v1'))

    const openedWindow = windowOpenMock.mock.results[0]!.value as { location: { href?: string } }
    await waitFor(() => expect(openedWindow.location.href).toBe('blob:mock-url'))
  })

  it('fetches the child remito PDF via stockpileService.getVoucherById when Acopio creation returns a principal_voucher_id', async () => {
    createByAmountMock.mockResolvedValue({
      id: 's1',
      name: 'Obra Rivadavia',
      stockpile_number: 1,
      principal_voucher_id: 'rv1',
    })

    renderSales([])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: 'Acopio' }))
    await userEvent.type(screen.getByLabelText(/nombre del acopio/i), 'Obra Rivadavia')
    await userEvent.type(screen.getByLabelText(/monto del acopio/i), '5000')
    await userEvent.click(screen.getByRole('button', { name: /registrar acopio/i }))

    await waitFor(() => expect(getVoucherByIdMock).toHaveBeenCalledWith('rv1'))
    const openedWindow = windowOpenMock.mock.results[0]!.value as { location: { href?: string } }
    await waitFor(() => expect(openedWindow.location.href).toBe('blob:mock-url'))
  })

  it('does NOT call stockpileService.getVoucherById when Acopio creation has no principal_voucher_id', async () => {
    createByAmountMock.mockResolvedValue({
      id: 's1',
      name: 'Obra Rivadavia',
      stockpile_number: 1,
      principal_voucher_id: null,
    })

    renderSales([])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: 'Acopio' }))
    await userEvent.type(screen.getByLabelText(/nombre del acopio/i), 'Obra Rivadavia')
    await userEvent.type(screen.getByLabelText(/monto del acopio/i), '5000')
    await userEvent.click(screen.getByRole('button', { name: /registrar acopio/i }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(getVoucherByIdMock).not.toHaveBeenCalled()
  })

  it('completes the success flow (toast + cart clear) without throwing when window.open returns null (blocked popup)', async () => {
    windowOpenMock = vi.fn(() => null)
    vi.stubGlobal('open', windowOpenMock)
    createMock.mockResolvedValue({ id: 'v1', sale_point: '0001', number: '00000042', voucher_type: 'quotation' })

    renderSales([makeLine()])
    await pickClient()
    await userEvent.click(screen.getByRole('button', { name: /generar/i }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(screen.getByText(/todavía no agregaste productos/i)).toBeInTheDocument()
  })
})
