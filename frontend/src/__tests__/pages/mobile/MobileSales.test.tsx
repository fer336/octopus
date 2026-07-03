import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { CartLine } from '../../../components/layout/MobileShell'
import type { Client } from '../../../api/clientsService'
import type { VoucherCreate } from '../../../api/vouchersService'

const { searchMock, createMock, createByAmountMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
  createMock: vi.fn(),
  createByAmountMock: vi.fn(),
}))

vi.mock('../../../api/clientsService', () => ({
  default: { search: searchMock },
}))

vi.mock('../../../api/vouchersService', () => ({
  default: { create: createMock },
}))

vi.mock('../../../api/stockpileService', () => ({
  default: { createByAmount: createByAmountMock },
}))

import MobileSales, { mergeCartLine, calculateTotals } from '../../../pages/mobile/MobileSales'

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return { code: 'P1', desc: 'Producto A', qty: 1, price: 1000, product_id: 'p1', ...overrides }
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

beforeEach(() => {
  vi.clearAllMocks()
  searchMock.mockResolvedValue([])
  createMock.mockResolvedValue({ id: 'v1' })
  createByAmountMock.mockResolvedValue({ id: 's1', name: 'Obra Rivadavia', stockpile_number: 1 })
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
