import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClientPickerSheet from '../../components/layout/ClientPickerSheet'
import type { Client } from '../../api/clientsService'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))

vi.mock('../../api/clientsService', () => ({
  default: { search: searchMock },
}))

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1',
    business_id: 'b1',
    name: 'Juan Pérez',
    document_type: 'DNI',
    document_number: '12345678',
    tax_condition: 'CF',
    client_type_id: 't1',
    current_balance: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

function renderSheet(onSelect = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onSelect,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ClientPickerSheet open onClose={vi.fn()} onSelect={onSelect} />
      </QueryClientProvider>
    ),
  }
}

describe('ClientPickerSheet — search feedback (loading/error/empty)', () => {
  beforeEach(() => {
    searchMock.mockReset()
  })

  it('shows a loading indicator while the search request is in flight', async () => {
    let resolveSearch: (clients: Client[]) => void = () => {}
    searchMock.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve }))

    renderSheet()
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'juan')

    expect(await screen.findByRole('status', { name: /buscando/i })).toBeInTheDocument()

    resolveSearch([makeClient()])
    await waitFor(() => expect(screen.queryByRole('status', { name: /buscando/i })).not.toBeInTheDocument())
  })

  it('shows a visible error message when the search request fails, instead of silently showing nothing', async () => {
    searchMock.mockRejectedValue(new Error('Network Error'))

    renderSheet()
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'juan')

    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i)
  })

  it('shows an explicit "no results" message when the search returns an empty list', async () => {
    searchMock.mockResolvedValue([])

    renderSheet()
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'zzz')

    expect(await screen.findByText(/no encontramos clientes/i)).toBeInTheDocument()
  })

  it('still renders matching results normally when the search succeeds', async () => {
    searchMock.mockResolvedValue([makeClient({ name: 'Juan Pérez' })])

    renderSheet()
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'juan')

    expect(await screen.findByRole('button', { name: /juan pérez/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/no encontramos clientes/i)).not.toBeInTheDocument()
  })

  it('shows only the "Sin cliente" clear-selection option when the search box is empty (no query yet) — NOT labeled "Consumidor final", which a real user flagged as a misleading fake default client', () => {
    renderSheet()

    expect(screen.getByText('Sin cliente')).toBeInTheDocument()
    expect(screen.queryByText(/consumidor final/i)).not.toBeInTheDocument()
  })

  it('hides the "Sin cliente" clear-selection option while a search is active, even if a real client is literally named "Consumidor Final" (no collision, distinct labels, but decluttering still applies)', async () => {
    searchMock.mockResolvedValue([makeClient({ id: 'c2', name: 'Consumidor Final', document_number: '1' })])

    renderSheet()
    await userEvent.type(screen.getByPlaceholderText(/buscar por nombre o documento/i), 'cons')

    // Wait for the real search result card to actually render (matched by its
    // document_number, unique to the real client) before asserting the static
    // option is gone — otherwise this could false-pass before the mocked
    // search promise resolves.
    await screen.findByText('1')

    expect(screen.queryByText('Sin cliente')).not.toBeInTheDocument()
    expect(screen.getByText('Consumidor Final')).toBeInTheDocument()
  })
})
