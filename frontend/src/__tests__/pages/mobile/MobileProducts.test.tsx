import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Product, PaginatedResponse } from '../../../api/productsService'
import type { Category } from '../../../api/categoriesService'
import type { CartLine } from '../../../components/layout/MobileShell'

const { getAllMock, getCategoriesAllMock } = vi.hoisted(() => ({
  getAllMock: vi.fn(),
  getCategoriesAllMock: vi.fn(),
}))

vi.mock('../../../api/productsService', () => ({
  default: { getAll: getAllMock },
}))

vi.mock('../../../api/categoriesService', () => ({
  default: { getAll: getCategoriesAllMock },
}))

import MobileProducts from '../../../pages/mobile/MobileProducts'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '1',
    business_id: 'b1',
    code: 'P1',
    description: 'Producto genérico',
    cost_price: 0,
    list_price: 100,
    price_currency: 'ARS',
    discount_1: 0,
    discount_2: 0,
    discount_3: 0,
    extra_cost: 0,
    profit_margin: 0,
    net_price: 100,
    sale_price: 100,
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

function paginated(items: Product[]): PaginatedResponse<Product> {
  return { items, total: items.length, page: 1, per_page: 50, pages: 1 }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    business_id: 'b1',
    name: 'Categoría',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function renderProducts(props: Partial<React.ComponentProps<typeof MobileProducts>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onAddToCart = vi.fn()
  const onOpenScanner = vi.fn()
  const defaultProps = { cart: [] as CartLine[], onAddToCart, onOpenScanner }
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MobileProducts {...defaultProps} {...props} />
    </QueryClientProvider>
  )
  return { ...utils, onAddToCart, onOpenScanner }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MobileProducts — search and category filter', () => {
  it('combines search text and selected category chip (AND logic), API-driven, with a matching count', async () => {
    getCategoriesAllMock.mockResolvedValue([
      makeCategory({ id: 'cat-plomeria', name: 'Plomería' }),
      makeCategory({ id: 'cat-griferia', name: 'Grifería' }),
    ])
    getAllMock.mockResolvedValue(
      paginated([makeProduct({ id: '1', code: 'P1', description: 'Tubo PVC 1/2', category_id: 'cat-plomeria' })])
    )

    renderProducts()
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'Plomería' })
    await user.click(screen.getByRole('button', { name: 'Plomería' }))
    await user.type(screen.getByPlaceholderText(/buscar código o descripción/i), 'tubo')

    await waitFor(() => {
      expect(getAllMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'tubo', category_id: 'cat-plomeria' })
      )
    })

    expect(await screen.findByText('1 productos')).toBeInTheDocument()
    expect(screen.getByText(/tubo pvc/i)).toBeInTheDocument()
  })

  it('"Todas" clears the category filter', async () => {
    getCategoriesAllMock.mockResolvedValue([makeCategory({ id: 'cat-plomeria', name: 'Plomería' })])
    getAllMock.mockResolvedValue(paginated([makeProduct()]))

    renderProducts()
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'Plomería' })
    await user.click(screen.getByRole('button', { name: 'Plomería' }))
    await waitFor(() => {
      expect(getAllMock).toHaveBeenLastCalledWith(expect.objectContaining({ category_id: 'cat-plomeria' }))
    })

    await user.click(screen.getByRole('button', { name: 'Todas' }))
    await waitFor(() => {
      expect(getAllMock).toHaveBeenLastCalledWith(expect.objectContaining({ category_id: undefined }))
    })
  })
})

describe('MobileProducts — stock-low badge', () => {
  it('shows "Stock bajo" at stock=11 and hides it at stock=12 (boundary)', async () => {
    getCategoriesAllMock.mockResolvedValue([])
    getAllMock.mockResolvedValue(
      paginated([
        makeProduct({ id: '1', code: 'P1', description: 'Producto A', current_stock: 11 }),
        makeProduct({ id: '2', code: 'P2', description: 'Producto B', current_stock: 12 }),
      ])
    )

    renderProducts()

    const cardA = (await screen.findByText('Producto A')).closest('[data-testid="product-card"]') as HTMLElement
    const cardB = screen.getByText('Producto B').closest('[data-testid="product-card"]') as HTMLElement

    expect(within(cardA).getByText('Stock bajo')).toBeInTheDocument()
    expect(within(cardB).queryByText('Stock bajo')).not.toBeInTheDocument()
  })
})

describe('MobileProducts — add to cart', () => {
  it('emits a qty:1 delta line via onAddToCart when tapping + on a product not yet in cart', async () => {
    getCategoriesAllMock.mockResolvedValue([])
    getAllMock.mockResolvedValue(
      paginated([makeProduct({ id: '1', code: 'P1', description: 'Producto A', sale_price: 500 })])
    )

    const { onAddToCart } = renderProducts()
    const user = userEvent.setup()

    await screen.findByText('Producto A')
    await user.click(screen.getByRole('button', { name: /agregar producto a al carrito/i }))

    expect(onAddToCart).toHaveBeenCalledWith({
      code: 'P1',
      desc: 'Producto A',
      qty: 1,
      price: 500,
      product_id: '1',
    })
  })

  it('still emits a qty:1 delta line when the product is already in the cart prop (the cart owner merges/increments centrally)', async () => {
    getCategoriesAllMock.mockResolvedValue([])
    getAllMock.mockResolvedValue(
      paginated([makeProduct({ id: '1', code: 'P1', description: 'Producto A', sale_price: 500 })])
    )

    const existingLine: CartLine = { code: 'P1', desc: 'Producto A', qty: 1, price: 500, product_id: '1' }
    const { onAddToCart } = renderProducts({ cart: [existingLine] })
    const user = userEvent.setup()

    await screen.findByText('Producto A')
    await user.click(screen.getByRole('button', { name: /agregar producto a al carrito/i }))

    expect(onAddToCart).toHaveBeenCalledWith({
      code: 'P1',
      desc: 'Producto A',
      qty: 1,
      price: 500,
      product_id: '1',
    })
  })
})

describe('MobileProducts — scanner integration', () => {
  it('calls onOpenScanner when tapping the scan button', async () => {
    getCategoriesAllMock.mockResolvedValue([])
    getAllMock.mockResolvedValue(paginated([]))

    const { onOpenScanner } = renderProducts()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText(/abrir escáner/i))
    expect(onOpenScanner).toHaveBeenCalledTimes(1)
  })

  it('populates the search input when the scannedCode prop changes (post successful scan)', async () => {
    getCategoriesAllMock.mockResolvedValue([])
    getAllMock.mockResolvedValue(paginated([]))

    const { rerender } = renderProducts({ scannedCode: null })
    const search = await screen.findByPlaceholderText(/buscar código o descripción/i)
    expect(search).toHaveValue('')

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    rerender(
      <QueryClientProvider client={queryClient}>
        <MobileProducts
          cart={[]}
          onAddToCart={vi.fn()}
          onOpenScanner={vi.fn()}
          scannedCode={{ code: '7791234567890' }}
        />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar código o descripción/i)).toHaveValue('7791234567890')
    })
  })
})
