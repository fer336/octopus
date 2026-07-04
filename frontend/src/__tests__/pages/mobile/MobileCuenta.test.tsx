import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Client } from '../../../api/clientsService'

const { getAllClientsMock } = vi.hoisted(() => ({ getAllClientsMock: vi.fn() }))

vi.mock('../../../api/clientsService', () => ({
  default: { getAll: getAllClientsMock },
}))

import MobileCuenta, {
  resolveBalanceStatus,
  computeReceivableSummary,
  filterClientsByQuery,
  getClientInitials,
} from '../../../pages/mobile/MobileCuenta'

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    business_id: 'b1',
    name: 'Constructora Belgrano S.A.',
    document_type: 'CUIT',
    document_number: '30711223344',
    tax_condition: 'Responsable Inscripto',
    client_type_id: 'ct1',
    current_balance: 236253.54,
    credit_limit: undefined,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

function fixture(items: Client[]) {
  return { items, total: items.length, page: 1, per_page: 100, pages: 1 }
}

function renderCuenta() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileCuenta />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MobileCuenta — pure helpers', () => {
  it('resolveBalanceStatus classifies positive as debe, negative as a_favor, zero as al_dia', () => {
    expect(resolveBalanceStatus(100)).toBe('debe')
    expect(resolveBalanceStatus(-100)).toBe('a_favor')
    expect(resolveBalanceStatus(0)).toBe('al_dia')
  })

  it('computeReceivableSummary sums only positive balances and counts only debtor clients', () => {
    const clients = [
      makeClient({ id: '1', current_balance: 1000 }),
      makeClient({ id: '2', current_balance: -500 }),
      makeClient({ id: '3', current_balance: 2000 }),
      makeClient({ id: '4', current_balance: 0 }),
    ]
    expect(computeReceivableSummary(clients)).toEqual({ totalReceivable: 3000, debtorCount: 2 })
  })

  it('computeReceivableSummary returns zeros for an empty list', () => {
    expect(computeReceivableSummary([])).toEqual({ totalReceivable: 0, debtorCount: 0 })
  })

  it('filterClientsByQuery is case-insensitive and matches by name substring', () => {
    const clients = [
      makeClient({ id: '1', name: 'Ferretería López' }),
      makeClient({ id: '2', name: 'Plomería del Sur' }),
    ]
    expect(filterClientsByQuery(clients, 'lopez')).toEqual([])
    expect(filterClientsByQuery(clients, 'López')).toEqual([clients[0]])
    expect(filterClientsByQuery(clients, 'plomería')).toEqual([clients[1]])
  })

  it('filterClientsByQuery returns all clients for a blank/whitespace query', () => {
    const clients = [makeClient({ id: '1' }), makeClient({ id: '2' })]
    expect(filterClientsByQuery(clients, '  ')).toEqual(clients)
  })

  it('getClientInitials takes the first letter of the first two words', () => {
    expect(getClientInitials('Constructora Belgrano S.A.')).toBe('CB')
    expect(getClientInitials('Juan Domínguez')).toBe('JD')
    expect(getClientInitials('Plomería')).toBe('P')
  })
})

describe('MobileCuenta — data fetching', () => {
  it('fetches clients with has_balance=true and per_page=100 (all-in-memory, no server debounce)', async () => {
    getAllClientsMock.mockResolvedValue(fixture([]))
    renderCuenta()
    await screen.findByText(/total por cobrar/i)
    expect(getAllClientsMock).toHaveBeenCalledWith({ has_balance: true, per_page: 100 })
  })

  it('shows a loading spinner while the query is in flight', () => {
    getAllClientsMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderCuenta()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('CRITICAL: shows an error message instead of a blank screen when getAll fails', async () => {
    getAllClientsMock.mockRejectedValue({
      response: { status: 500, data: {} },
    })
    renderCuenta()
    expect(await screen.findByText(/error interno del servidor/i)).toBeInTheDocument()
  })
})

describe('MobileCuenta — hero', () => {
  it('shows "Total por cobrar" as the sum of only positive balances', async () => {
    getAllClientsMock.mockResolvedValue(
      fixture([
        makeClient({ id: '1', current_balance: 236253.54 }),
        makeClient({ id: '2', current_balance: 112430.1 }),
        makeClient({ id: '3', current_balance: -15000 }),
      ])
    )
    renderCuenta()
    expect(await screen.findByText('$348.683,64')).toBeInTheDocument()
  })

  it('shows the debtor client count (only current_balance > 0), not the total client count', async () => {
    getAllClientsMock.mockResolvedValue(
      fixture([
        makeClient({ id: '1', current_balance: 1000 }),
        makeClient({ id: '2', current_balance: -500 }),
      ])
    )
    renderCuenta()
    await screen.findByText(/total por cobrar/i)
    expect(screen.getByText(/1 cliente con saldo deudor/i)).toBeInTheDocument()
  })

  it('pluralizes the debtor count label for more than one debtor', async () => {
    getAllClientsMock.mockResolvedValue(
      fixture([
        makeClient({ id: '1', current_balance: 1000 }),
        makeClient({ id: '2', current_balance: 2000 }),
      ])
    )
    renderCuenta()
    expect(await screen.findByText(/2 clientes con saldo deudor/i)).toBeInTheDocument()
  })
})

describe('MobileCuenta — client list', () => {
  it('lists ALL returned clients (debtors AND credit), not just the hero\'s debtor subset', async () => {
    getAllClientsMock.mockResolvedValue(
      fixture([
        makeClient({ id: '1', name: 'Constructora Belgrano S.A.', current_balance: 236253.54 }),
        makeClient({ id: '2', name: 'Juan Domínguez', current_balance: -15000 }),
      ])
    )
    renderCuenta()
    expect(await screen.findByText('Constructora Belgrano S.A.')).toBeInTheDocument()
    expect(screen.getByText('Juan Domínguez')).toBeInTheDocument()
  })

  it('shows amount and status "Debe" for a positive balance', async () => {
    getAllClientsMock.mockResolvedValue(
      fixture([
        makeClient({ id: '1', name: 'Ferretería López', current_balance: 112430.1 }),
        makeClient({ id: '2', name: 'Otro Cliente', current_balance: 1000 }),
      ])
    )
    renderCuenta()
    await screen.findByText('Ferretería López')
    // $112.430,10 is unique to this row (the hero total sums both debtors:
    // $113.430,10), so it can't collide with the two "Debe" labels below.
    expect(screen.getByText('$112.430,10')).toBeInTheDocument()
    expect(screen.getAllByText('Debe')).toHaveLength(2)
  })

  it('shows amount and status "A favor" for a negative balance', async () => {
    getAllClientsMock.mockResolvedValue(
      fixture([makeClient({ id: '1', name: 'Juan Domínguez', current_balance: -15000 })])
    )
    renderCuenta()
    expect(await screen.findByText('$15.000,00')).toBeInTheDocument()
    expect(screen.getByText('A favor')).toBeInTheDocument()
  })

  it('shows status "Al día" for a zero balance', async () => {
    getAllClientsMock.mockResolvedValue(
      fixture([makeClient({ id: '1', name: 'Arq. Martín Pereyra', current_balance: 0 })])
    )
    renderCuenta()
    await screen.findByText('Arq. Martín Pereyra')
    expect(screen.getByText('Al día')).toBeInTheDocument()
  })

  it('shows an empty state when the query returns no clients with balance', async () => {
    getAllClientsMock.mockResolvedValue(fixture([]))
    renderCuenta()
    expect(await screen.findByText(/no hay clientes con saldo/i)).toBeInTheDocument()
  })

  it('filters the visible list locally as the user types in the search box (no extra service call)', async () => {
    getAllClientsMock.mockResolvedValue(
      fixture([
        makeClient({ id: '1', name: 'Ferretería López', current_balance: 1000 }),
        makeClient({ id: '2', name: 'Plomería del Sur', current_balance: 2000 }),
      ])
    )
    renderCuenta()
    await screen.findByText('Ferretería López')

    await userEvent.type(screen.getByLabelText(/buscar cliente/i), 'plomería')

    expect(screen.queryByText('Ferretería López')).not.toBeInTheDocument()
    expect(screen.getByText('Plomería del Sur')).toBeInTheDocument()
    expect(getAllClientsMock).toHaveBeenCalledTimes(1)
  })
})
