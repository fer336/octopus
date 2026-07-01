import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { User } from '../../stores/authStore'
import type { DashboardSummary } from '../../api/dashboardService'

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

const { getSummaryMock } = vi.hoisted(() => ({ getSummaryMock: vi.fn() }))

vi.mock('../../api/dashboardService', () => ({
  default: { getSummary: getSummaryMock },
}))

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

  it('routes Productos to its screen placeholder (MobileStub in PR1)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    expect(screen.getByRole('heading', { name: 'Productos' })).toBeInTheDocument()
  })

  it('routes Vender to its screen placeholder (MobileStub in PR1)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Vender' }))
    expect(screen.getByRole('heading', { name: 'Vender' })).toBeInTheDocument()
  })
})

describe('MobileShell — MobileDashboard quick-access wiring (PR2)', () => {
  it('routes "Nueva venta" quick access to the Vender tab', async () => {
    renderShell()
    await screen.findByText(/accesos rápidos/i)
    await userEvent.click(screen.getByRole('button', { name: /nueva venta/i }))
    expect(screen.getByRole('heading', { name: 'Vender' })).toBeInTheDocument()
  })

  it('routes "Consultar precio" quick access to the Productos tab', async () => {
    renderShell()
    await screen.findByText(/accesos rápidos/i)
    await userEvent.click(screen.getByRole('button', { name: /consultar precio/i }))
    expect(screen.getByRole('heading', { name: 'Productos' })).toBeInTheDocument()
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
  it('opens the AI sheet host when tapping the sparkles button (content stubbed until PR4)', async () => {
    renderShell()
    expect(screen.queryByTestId('ai-sheet-host')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Abrir asistente IA'))
    expect(screen.getByTestId('ai-sheet-host')).toBeInTheDocument()
  })

  it('opens the drawer when tapping the menu button', async () => {
    renderShell()
    expect(screen.queryByText('OctopusTrack')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Abrir menú'))
    expect(screen.getByText('OctopusTrack')).toBeInTheDocument()
  })
})
