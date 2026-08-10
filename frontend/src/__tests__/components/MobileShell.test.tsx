import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { User } from '../../stores/authStore'
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

const {
  getAllProductsMock,
  getAllCategoriesMock,
  searchClientsMock,
  getAllClientsMock,
  createVoucherMock,
  getCurrentCashMock,
  getCashSummaryMock,
} = vi.hoisted(() => ({
  getAllProductsMock: vi.fn(),
  getAllCategoriesMock: vi.fn(),
  searchClientsMock: vi.fn(),
  getAllClientsMock: vi.fn(),
  createVoucherMock: vi.fn(),
  getCurrentCashMock: vi.fn(),
  getCashSummaryMock: vi.fn(),
}))

vi.mock('../../api/cashService', () => ({
  getCurrentCash: getCurrentCashMock,
  getCashSummary: getCashSummaryMock,
}))

vi.mock('../../api/productsService', () => ({
  default: { getAll: getAllProductsMock },
}))

vi.mock('../../api/categoriesService', () => ({
  default: { getAll: getAllCategoriesMock },
}))

vi.mock('../../api/clientsService', () => ({
  default: { search: searchClientsMock, getAll: getAllClientsMock },
}))

vi.mock('../../api/vouchersService', () => ({
  default: { create: createVoucherMock },
}))

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
getAllClientsMock.mockResolvedValue({ items: [], total: 0, page: 1, per_page: 100, pages: 0 })
createVoucherMock.mockResolvedValue({ id: 'v1' })
getCurrentCashMock.mockResolvedValue(null)
getCashSummaryMock.mockResolvedValue({ by_method: [], total_net: 0, expected_cash: 0 })

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

describe('MobileShell — bottom tab bar', () => {
  it('renders all 5 tabs in the bottom bar', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByRole('button', { name: 'Ventas' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Caja' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Comprobantes' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Productos' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Cta Cte' })).toBeInTheDocument()
  })

  it('defaults to the Ventas tab', () => {
    renderShell()
    expect(screen.getByText('Buscar cliente')).toBeInTheDocument()
  })

  it('switches to Caja tab and renders the cash screen', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Caja' }))
    expect(await screen.findByRole('heading', { name: /abrir caja/i })).toBeInTheDocument()
  })

  it('switches to Productos tab and shows the search input', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    expect(await screen.findByPlaceholderText(/buscar código o descripción/i)).toBeInTheDocument()
  })

  it('switches to Cuenta Corriente tab', async () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    await userEvent.click(within(nav).getByRole('button', { name: 'Cta Cte' }))
    expect(await screen.findByText(/total por cobrar/i)).toBeInTheDocument()
  })

  it('switches between tabs and back to Ventas', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Caja' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ventas' }))
    expect(screen.getByText('Buscar cliente')).toBeInTheDocument()
  })
})

describe('MobileShell — cart badge on Ventas tab', () => {
  it('shows no badge when cart is empty', () => {
    renderShell()
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument()
  })

  it('shows the cart line count on the Ventas tab when cart has items', () => {
    renderShell([
      { code: 'P1', desc: 'Producto 1', qty: 1, price: 100, product_id: 'p1', discount: 0 },
      { code: 'P2', desc: 'Producto 2', qty: 2, price: 200, product_id: 'p2', discount: 0 },
    ])
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2')
  })

  it('updates the badge count after adding a product from Productos', async () => {
    getAllProductsMock.mockResolvedValue(productsFixture([makeProduct()]))
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    await userEvent.click(await screen.findByRole('button', { name: /agregar producto a al carrito/i }))

    expect(screen.getByTestId('cart-badge')).toHaveTextContent('1')
  })
})

describe('MobileShell — cart flow', () => {
  it('adds a product from Productos and shows it in Ventas', async () => {
    getAllProductsMock.mockResolvedValue(productsFixture([makeProduct({ net_price: 1000, sale_price: 1210 })]))
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    await userEvent.click(await screen.findByRole('button', { name: /agregar producto a al carrito/i }))

    await userEvent.click(screen.getByRole('button', { name: 'Ventas' }))

    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.getByText('$1.210,00')).toBeInTheDocument()
  })

  it('merges duplicate product additions into one cart line', async () => {
    getAllProductsMock.mockResolvedValue(productsFixture([makeProduct()]))
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    const addButton = await screen.findByRole('button', { name: /agregar producto a al carrito/i })
    await userEvent.click(addButton)
    await userEvent.click(addButton)

    await userEvent.click(screen.getByRole('button', { name: 'Ventas' }))

    const cartLines = screen.getAllByText('Producto A')
    expect(cartLines.length).toBe(1)
  })
})

describe('MobileShell — scanner overlay', () => {
  it('scans a product from Productos and populates the search query', async () => {
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    await userEvent.click(screen.getByLabelText(/abrir escáner/i))
    await userEvent.click(screen.getByRole('button', { name: 'Simular escaneo exitoso' }))

    expect(screen.queryByText('Escáner (stub)')).not.toBeInTheDocument()
    expect(await screen.findByPlaceholderText(/buscar código o descripción/i)).toHaveValue('7791234567890')
  })
})
