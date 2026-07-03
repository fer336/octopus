import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { User } from '../../stores/authStore'
import type { DashboardSummary } from '../../api/dashboardService'
import type { PaginatedResponse, Product } from '../../api/productsService'

const mockUser: { current: User | null } = {
  current: {
    id: 'u1',
    email: 'owner@test.com',
    name: 'Fernando',
    platform_role: 'user',
    membership_role: 'owner',
    module_permissions: {},
  },
}

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: User | null }) => unknown) =>
    selector({ user: mockUser.current }),
}))

const { getSummaryMock, getAllProductsMock, getAllCategoriesMock, searchClientsMock, createVoucherMock, chatMock } =
  vi.hoisted(() => ({
    getSummaryMock: vi.fn(),
    getAllProductsMock: vi.fn(),
    getAllCategoriesMock: vi.fn(),
    searchClientsMock: vi.fn(),
    createVoucherMock: vi.fn(),
    chatMock: vi.fn(),
  }))

vi.mock('../../api/dashboardService', () => ({
  default: { getSummary: getSummaryMock },
}))

vi.mock('../../api/productsService', () => ({
  default: { getAll: getAllProductsMock },
}))

vi.mock('../../api/categoriesService', () => ({
  default: { getAll: getAllCategoriesMock },
}))

vi.mock('../../api/clientsService', () => ({
  default: { search: searchClientsMock },
}))

vi.mock('../../api/vouchersService', () => ({
  default: { create: createVoucherMock },
}))

vi.mock('../../api/aiService', () => ({
  default: { chat: chatMock },
}))

// ScannerOverlay wraps QrScanner (real camera/html5-qrcode logic already
// covered by QrScanner.test.tsx and ScannerOverlay.test.tsx) — stub it here
// the same way, so shell-level tests only exercise MobileShell's own wiring.
vi.mock('../../components/sales/QrScanner', () => ({
  default: ({
    onAddProduct,
    onClose,
  }: {
    onAddProduct: (p: { id: string; code: string; description: string }, qty: number) => void
    onClose: () => void
  }) => (
    <div>
      <p>Escáner (stub)</p>
      <button onClick={onClose}>Cerrar escáner</button>
      <button
        onClick={() => onAddProduct({ id: 'p9', code: '7791234567890', description: 'Producto escaneado' }, 1)}
      >
        Simular escaneo exitoso
      </button>
    </div>
  ),
}))

function productsFixture(items: Product[] = []): PaginatedResponse<Product> {
  return { items, total: items.length, page: 1, per_page: 50, pages: 1 }
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '1',
    business_id: 'b1',
    code: 'P1',
    description: 'Producto A',
    cost_price: 0,
    list_price: 500,
    price_currency: 'ARS',
    discount_1: 0,
    discount_2: 0,
    discount_3: 0,
    extra_cost: 0,
    profit_margin: 0,
    net_price: 500,
    sale_price: 500,
    iva_rate: 21,
    current_stock: 20,
    minimum_stock: 5,
    unit: 'u',
    lots_count: 0,
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

getAllProductsMock.mockResolvedValue(productsFixture())
getAllCategoriesMock.mockResolvedValue([])
searchClientsMock.mockResolvedValue([])
createVoucherMock.mockResolvedValue({ id: 'v1' })
chatMock.mockResolvedValue({ response_type: 'text', text: 'Respuesta del asistente.' })

const summaryFixture: DashboardSummary = {
  total_products: 0,
  total_clients: 0,
  low_stock_products: 0,
  total_value: 0,
  total_sales: 0,
  total_invoices: 0,
  today_sales: 0,
  today_invoiced: 0,
  today_vouchers_count: 0,
  cash_income: 0,
  paid_invoices: 0,
  paid_stockpiles: 0,
  current_account_collected: 0,
  pending_customer_balance: 0,
  other_income: 0,
  closed_current_accounts: 0,
  closed_current_accounts_total: 0,
  filter_month: 6,
  filter_year: 2026,
  filter_date_from: '2026-06-01',
  filter_date_to: '2026-06-30',
}
getSummaryMock.mockResolvedValue(summaryFixture)

import MobileShell, { type CartLine } from '../../components/layout/MobileShell'

function renderShell(initialCart: CartLine[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <MobileShell initialCart={initialCart} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MobileShell — tab bar', () => {
  it('renders all 5 tab bar slots', () => {
    renderShell()
    expect(screen.getByRole('button', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Productos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vender' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Caja' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cuenta' })).toBeInTheDocument()
  })

  it('shows the cart badge with the line count on the Vender FAB when cart has items', () => {
    renderShell([
      { code: 'P1', desc: 'Producto 1', qty: 1, price: 100, product_id: 'p1' },
      { code: 'P2', desc: 'Producto 2', qty: 2, price: 200, product_id: 'p2' },
    ])
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2')
  })

  it('hides the cart badge when the cart is empty', () => {
    renderShell()
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument()
  })

  it('routes Caja to MobileStub (deferred, not blank/broken)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Caja' }))
    expect(
      screen.getByText(/ya funciona en la versión completa de OctopusTrack/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /caja/i })).toBeInTheDocument()
  })

  it('routes Cuenta to MobileStub (deferred, not blank/broken)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Cuenta' }))
    expect(
      screen.getByText(/ya funciona en la versión completa de OctopusTrack/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /cuenta/i })).toBeInTheDocument()
  })

  it('renders the real MobileDashboard on Inicio (wired in PR2)', async () => {
    renderShell()
    expect(await screen.findByText(/ingresado en caja/i)).toBeInTheDocument()
  })

  it('routes back to the real MobileDashboard when returning to Inicio', async () => {
    renderShell()
    await screen.findByText(/ingresado en caja/i)
    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    await userEvent.click(screen.getByRole('button', { name: 'Inicio' }))
    expect(await screen.findByText(/ingresado en caja/i)).toBeInTheDocument()
  })

  it('renders the real MobileProducts on Productos (wired in PR3)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    expect(await screen.findByPlaceholderText(/buscar código o descripción/i)).toBeInTheDocument()
  })

  it('renders the real MobileSales on Vender (wired in PR4)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Vender' }))
    expect(screen.getByText('Consumidor final')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cotización' })).toBeInTheDocument()
  })
})

describe('MobileShell — MobileDashboard quick-access wiring (PR2)', () => {
  it('routes "Nueva venta" quick access to the Vender tab', async () => {
    renderShell()
    await screen.findByText(/accesos rápidos/i)
    await userEvent.click(screen.getByRole('button', { name: /nueva venta/i }))
    expect(screen.getByText('Consumidor final')).toBeInTheDocument()
  })

  it('routes "Consultar precio" quick access to the Productos tab', async () => {
    renderShell()
    await screen.findByText(/accesos rápidos/i)
    await userEvent.click(screen.getByRole('button', { name: /consultar precio/i }))
    expect(await screen.findByPlaceholderText(/buscar código o descripción/i)).toBeInTheDocument()
  })

  it('routes "Caja diaria" quick access to MobileStub with the correct title', async () => {
    renderShell()
    await screen.findByText(/accesos rápidos/i)
    await userEvent.click(screen.getByRole('button', { name: /caja diaria/i }))
    expect(screen.getByRole('heading', { name: 'Caja diaria' })).toBeInTheDocument()
  })

  it('routes "Cuenta corriente" quick access to MobileStub with the correct title', async () => {
    renderShell()
    await screen.findByText(/accesos rápidos/i)
    await userEvent.click(screen.getByRole('button', { name: /cuenta corriente/i }))
    expect(screen.getByRole('heading', { name: 'Cuenta corriente' })).toBeInTheDocument()
  })
})

describe('MobileShell — header actions', () => {
  it('opens the real AIAssistantSheet when tapping the sparkles button (wired in PR4)', async () => {
    renderShell()
    expect(screen.queryByTestId('ai-sheet-host')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Abrir asistente IA'))
    expect(screen.getByTestId('ai-sheet-host')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/escribí tu consulta/i)).toBeInTheDocument()
  })

  it('opens the drawer when tapping the menu button', async () => {
    renderShell()
    expect(screen.queryByText('OctopusTrack')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Abrir menú'))
    expect(screen.getByText('OctopusTrack')).toBeInTheDocument()
  })
})

describe('MobileShell — MobileSales cart wiring (PR4)', () => {
  it('reflects a product added from Productos in the Vender tab cart totals', async () => {
    // Cart line price comes from net_price (NOT the gross sale_price shown
    // on the Productos card) — see PR4 Follow-up Correction #4: sale_price
    // already includes IVA, so the cart must carry net_price to avoid
    // double-taxing in MobileSales' totals bar / voucher payload.
    getAllProductsMock.mockResolvedValue(productsFixture([makeProduct({ net_price: 1000, sale_price: 1210 })]))
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    await userEvent.click(await screen.findByRole('button', { name: /agregar producto a al carrito/i }))

    await userEvent.click(screen.getByRole('button', { name: 'Vender' }))

    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.getAllByText('$1.000,00').length).toBeGreaterThan(0)
    expect(screen.getByText('$1.210,00')).toBeInTheDocument() // total incl. 21% IVA on a single $1000 line
  })

  it('sends a message through the real AIAssistantSheet and shows the assistant reply', async () => {
    chatMock.mockResolvedValue({ response_type: 'text', text: 'Tenés 3 productos con poco stock.' })
    renderShell()

    await userEvent.click(screen.getByLabelText('Abrir asistente IA'))
    await userEvent.type(screen.getByPlaceholderText(/escribí tu consulta/i), 'Stock bajo')
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }))

    expect(await screen.findByText('Tenés 3 productos con poco stock.')).toBeInTheDocument()
  })
})

describe('MobileShell — cart lifted state via MobileProducts (PR3)', () => {
  it('merges repeated add-to-cart taps for the same product code into one line (badge counts lines, not qty)', async () => {
    getAllProductsMock.mockResolvedValue(productsFixture([makeProduct()]))
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    const addButton = await screen.findByRole('button', { name: /agregar producto a al carrito/i })

    await userEvent.click(addButton)
    await userEvent.click(addButton)

    expect(screen.getByTestId('cart-badge')).toHaveTextContent('1')
  })

  it('adds a second distinct product as a new line (badge shows 2)', async () => {
    getAllProductsMock.mockResolvedValue(
      productsFixture([
        makeProduct({ id: '1', code: 'P1', description: 'Producto A' }),
        makeProduct({ id: '2', code: 'P2', description: 'Producto B' }),
      ])
    )
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    await userEvent.click(await screen.findByRole('button', { name: /agregar producto a al carrito/i }))
    await userEvent.click(screen.getByRole('button', { name: /agregar producto b al carrito/i }))

    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2')
  })
})

describe('MobileShell — scanner overlay (PR3)', () => {
  it('cancel (close) is a no-op: Productos search stays unchanged and the overlay unmounts', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))

    const search = await screen.findByPlaceholderText(/buscar código o descripción/i)
    await userEvent.type(search, 'tubo')

    await userEvent.click(screen.getByLabelText(/abrir escáner/i))
    expect(screen.getByText('Escáner (stub)')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar escáner' }))

    expect(screen.queryByText('Escáner (stub)')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/buscar código o descripción/i)).toHaveValue('tubo')
  })

  it('a successful scan closes the overlay and populates the Productos search query, without adding to the cart', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    await userEvent.click(screen.getByLabelText(/abrir escáner/i))

    await userEvent.click(screen.getByRole('button', { name: 'Simular escaneo exitoso' }))

    expect(screen.queryByText('Escáner (stub)')).not.toBeInTheDocument()
    expect(await screen.findByPlaceholderText(/buscar código o descripción/i)).toHaveValue('7791234567890')
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument()
  })
})
