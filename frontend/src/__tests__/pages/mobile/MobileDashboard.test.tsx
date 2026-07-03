import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { User } from '../../../stores/authStore'
import type { DashboardSummary } from '../../../api/dashboardService'

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

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: User | null }) => unknown) =>
    selector({ user: mockUser.current }),
}))

const { getSummaryMock } = vi.hoisted(() => ({ getSummaryMock: vi.fn() }))

vi.mock('../../../api/dashboardService', () => ({
  default: { getSummary: getSummaryMock },
}))

import MobileDashboard from '../../../pages/mobile/MobileDashboard'

function baseSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
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
    ...overrides,
  }
}

function renderDashboard(onNavigate = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MobileDashboard onNavigate={onNavigate} />
    </QueryClientProvider>
  )
  return { ...utils, onNavigate }
}

describe('MobileDashboard — V1 sections', () => {
  it('renders greeting, hero, 2 metric cards, donut and quick-access grid, and NO "Actividad reciente" section', async () => {
    getSummaryMock.mockResolvedValue(baseSummary())
    renderDashboard()

    expect(await screen.findByText(/hola/i)).toBeInTheDocument()
    expect(screen.getByText(/fernando/i)).toBeInTheDocument()
    expect(screen.getByText(/ingresado en caja/i)).toBeInTheDocument()
    expect(screen.getByText(/ventas hoy/i)).toBeInTheDocument()
    expect(screen.getByText(/comprob\./i)).toBeInTheDocument()
    expect(screen.getByText(/composición de ingresos/i)).toBeInTheDocument()
    expect(screen.getByText(/accesos rápidos/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /nueva venta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /consultar precio/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /caja diaria/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cuenta corriente/i })).toBeInTheDocument()

    expect(screen.queryByText(/actividad reciente/i)).not.toBeInTheDocument()
  })
})

describe('MobileDashboard — data + formatting', () => {
  it('formats the hero amount in AR currency from dashboardService.getSummary()', async () => {
    getSummaryMock.mockResolvedValue(baseSummary({ cash_income: 624563.65 }))
    renderDashboard()

    expect(await screen.findByText('$624.563,65')).toBeInTheDocument()
  })
})

describe('MobileDashboard — revenue composition donut', () => {
  it('derives donut percentages from paid_invoices/paid_stockpiles/other_income', async () => {
    getSummaryMock.mockResolvedValue(
      baseSummary({ paid_invoices: 780, paid_stockpiles: 140, other_income: 80 })
    )
    renderDashboard()

    await screen.findByText(/composición de ingresos/i)
    const legend = within(screen.getByTestId('donut-legend'))
    expect(legend.getByText('Facturas')).toBeInTheDocument()
    expect(legend.getByText('78%')).toBeInTheDocument()
    expect(legend.getByText('Acopios')).toBeInTheDocument()
    expect(legend.getByText('14%')).toBeInTheDocument()
    expect(legend.getByText('Otros')).toBeInTheDocument()
    expect(legend.getByText('8%')).toBeInTheDocument()
  })

  it('renders 0% slices without crashing when there is no income in the period', async () => {
    getSummaryMock.mockResolvedValue(baseSummary())
    renderDashboard()

    await screen.findByText(/composición de ingresos/i)
    const legend = within(screen.getByTestId('donut-legend'))
    expect(legend.getAllByText('0%')).toHaveLength(3)
  })
})

describe('MobileDashboard — quick-access navigation', () => {
  it('routes "Nueva venta" to the ventas tab', async () => {
    getSummaryMock.mockResolvedValue(baseSummary())
    const { onNavigate } = renderDashboard()
    const user = userEvent.setup()

    await screen.findByText(/accesos rápidos/i)
    await user.click(screen.getByRole('button', { name: /nueva venta/i }))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'ventas' })
  })

  it('routes "Consultar precio" to the productos tab', async () => {
    getSummaryMock.mockResolvedValue(baseSummary())
    const { onNavigate } = renderDashboard()
    const user = userEvent.setup()

    await screen.findByText(/accesos rápidos/i)
    await user.click(screen.getByRole('button', { name: /consultar precio/i }))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'productos' })
  })

  it('routes "Caja diaria" to the real Caja tab (wired in PR5)', async () => {
    getSummaryMock.mockResolvedValue(baseSummary())
    const { onNavigate } = renderDashboard()
    const user = userEvent.setup()

    await screen.findByText(/accesos rápidos/i)
    await user.click(screen.getByRole('button', { name: /caja diaria/i }))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'caja' })
  })

  it('routes "Cuenta corriente" to MobileStub with stubTitle "Cuenta corriente"', async () => {
    getSummaryMock.mockResolvedValue(baseSummary())
    const { onNavigate } = renderDashboard()
    const user = userEvent.setup()

    await screen.findByText(/accesos rápidos/i)
    await user.click(screen.getByRole('button', { name: /cuenta corriente/i }))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'stub', stubTitle: 'Cuenta corriente' })
  })
})
