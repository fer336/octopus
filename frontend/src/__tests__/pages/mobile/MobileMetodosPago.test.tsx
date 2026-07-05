import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { PaymentMethod } from '../../../api/paymentMethodsService'

const { getAllMock, createMock, updateMock, updateStatusMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  getAllMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  updateStatusMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('../../../api/paymentMethodsService', () => ({
  default: {
    getAll: getAllMock,
    create: createMock,
    update: updateMock,
    updateStatus: updateStatusMock,
  },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccessMock, error: toastErrorMock },
}))

import MobileMetodosPago, { filterPaymentMethodsByQuery } from '../../../pages/mobile/MobileMetodosPago'

function makeMethod(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'pm1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    business_id: 'b1',
    name: 'Efectivo',
    code: 'CASH',
    is_active: true,
    requires_reference: false,
    ...overrides,
  }
}

function renderMetodosPago() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileMetodosPago />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MobileMetodosPago — pure helpers', () => {
  it('filterPaymentMethodsByQuery: empty query returns all methods', () => {
    const methods = [makeMethod({ id: '1' }), makeMethod({ id: '2' })]
    expect(filterPaymentMethodsByQuery(methods, '')).toEqual(methods)
  })

  it('filterPaymentMethodsByQuery: matches by name (case-insensitive)', () => {
    const methods = [
      makeMethod({ id: '1', name: 'Efectivo' }),
      makeMethod({ id: '2', name: 'Mercado Pago' }),
    ]
    expect(filterPaymentMethodsByQuery(methods, 'mercado')).toEqual([methods[1]])
  })

  it('filterPaymentMethodsByQuery: matches by code', () => {
    const methods = [
      makeMethod({ id: '1', name: 'Efectivo', code: 'CASH' }),
      makeMethod({ id: '2', name: 'Mercado Pago', code: 'MP' }),
    ]
    expect(filterPaymentMethodsByQuery(methods, 'mp')).toEqual([methods[1]])
  })
})

describe('MobileMetodosPago — data fetching', () => {
  it('shows a loading spinner while the query is in flight', () => {
    getAllMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderMetodosPago()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('fetches all payment methods with no active_only filter', async () => {
    getAllMock.mockResolvedValue([])
    renderMetodosPago()
    await screen.findByText(/no hay métodos de pago/i)
    expect(getAllMock).toHaveBeenCalledWith()
    expect(getAllMock).toHaveBeenCalledTimes(1)
  })

  it('renders the fetched methods with name, code and badges', async () => {
    getAllMock.mockResolvedValue([
      makeMethod({ id: '1', name: 'Efectivo', code: 'CASH', is_active: true, requires_reference: false }),
      makeMethod({ id: '2', name: 'Mercado Pago', code: 'MP', is_active: false, requires_reference: true }),
    ])
    renderMetodosPago()
    expect(await screen.findByText('Efectivo')).toBeInTheDocument()
    expect(screen.getByText('CASH')).toBeInTheDocument()
    expect(screen.getByText('Mercado Pago')).toBeInTheDocument()
    expect(screen.getByText('MP')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    expect(screen.getByText('Requiere referencia')).toBeInTheDocument()
    expect(screen.getByText('Sin referencia')).toBeInTheDocument()
  })

  it('shows "—" for a method with no code', async () => {
    getAllMock.mockResolvedValue([makeMethod({ id: '1', code: '' })])
    renderMetodosPago()
    await screen.findByTestId('payment-method-card')
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('CRITICAL: shows an error message instead of a blank screen when getAll fails', async () => {
    getAllMock.mockRejectedValue({ response: { status: 500, data: {} } })
    renderMetodosPago()
    expect(await screen.findByText(/error interno del servidor/i)).toBeInTheDocument()
  })
})

describe('MobileMetodosPago — search', () => {
  it('filters the list by name or code as the user types', async () => {
    getAllMock.mockResolvedValue([
      makeMethod({ id: '1', name: 'Efectivo', code: 'CASH' }),
      makeMethod({ id: '2', name: 'Mercado Pago', code: 'MP' }),
    ])
    renderMetodosPago()
    await screen.findByText('Efectivo')

    await userEvent.type(screen.getByLabelText(/buscar método de pago/i), 'mercado')

    expect(screen.queryByText('Efectivo')).not.toBeInTheDocument()
    expect(screen.getByText('Mercado Pago')).toBeInTheDocument()
  })
})

describe('MobileMetodosPago — empty state', () => {
  it('shows an empty state message when there are zero methods', async () => {
    getAllMock.mockResolvedValue([])
    renderMetodosPago()
    expect(await screen.findByText(/no hay métodos de pago/i)).toBeInTheDocument()
  })

  it('shows an empty state message when the search excludes every method', async () => {
    getAllMock.mockResolvedValue([makeMethod({ id: '1', name: 'Efectivo' })])
    renderMetodosPago()
    await screen.findByText('Efectivo')

    await userEvent.type(screen.getByLabelText(/buscar método de pago/i), 'zzz')

    expect(await screen.findByText(/no hay métodos de pago/i)).toBeInTheDocument()
  })
})

describe('MobileMetodosPago — create flow', () => {
  it('tapping "Nuevo método" opens an empty create form', async () => {
    getAllMock.mockResolvedValue([])
    renderMetodosPago()
    await screen.findByText(/no hay métodos de pago/i)

    await userEvent.click(screen.getByRole('button', { name: /nuevo método/i }))

    const dialog = await screen.findByRole('dialog', { name: /nuevo método de pago/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText(/^nombre/i)).toHaveValue('')
  })

  it('submitting with an empty name shows a validation toast and does not call create', async () => {
    getAllMock.mockResolvedValue([])
    renderMetodosPago()
    await screen.findByText(/no hay métodos de pago/i)

    await userEvent.click(screen.getByRole('button', { name: /nuevo método/i }))
    await screen.findByRole('dialog', { name: /nuevo método de pago/i })
    await userEvent.click(screen.getByRole('button', { name: /crear método/i }))

    expect(toastErrorMock).toHaveBeenCalledWith('El nombre es obligatorio')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('submitting a valid new method calls create with the right payload, shows success toast, and closes the sheet', async () => {
    getAllMock.mockResolvedValue([])
    createMock.mockResolvedValue(makeMethod({ id: 'new-1', name: 'Transferencia', code: 'TRANSF' }))
    renderMetodosPago()
    await screen.findByText(/no hay métodos de pago/i)

    await userEvent.click(screen.getByRole('button', { name: /nuevo método/i }))
    await screen.findByRole('dialog', { name: /nuevo método de pago/i })

    await userEvent.type(screen.getByLabelText(/^nombre/i), 'Transferencia')
    await userEvent.type(screen.getByLabelText(/código/i), 'transf')
    await userEvent.click(screen.getByLabelText(/requiere referencia/i))
    await userEvent.click(screen.getByRole('button', { name: /crear método/i }))

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        name: 'Transferencia',
        code: 'TRANSF',
        requires_reference: true,
        is_active: true,
      })
    )
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Método de pago creado', { icon: '✅' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /nuevo método de pago/i })).not.toBeInTheDocument()
    )
  })
})

describe('MobileMetodosPago — edit flow', () => {
  it('tapping "Editar" pre-fills the form with the method data', async () => {
    getAllMock.mockResolvedValue([
      makeMethod({ id: 'pm1', name: 'Efectivo', code: 'CASH', requires_reference: true, is_active: false }),
    ])
    renderMetodosPago()
    await screen.findByText('Efectivo')

    await userEvent.click(screen.getByLabelText('Editar Efectivo'))

    const dialog = await screen.findByRole('dialog', { name: /editar método de pago/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText(/^nombre/i)).toHaveValue('Efectivo')
    expect(screen.getByLabelText(/código/i)).toHaveValue('CASH')
    expect(screen.getByLabelText(/requiere referencia/i)).toBeChecked()
    expect(screen.getByLabelText(/método activo/i)).not.toBeChecked()
  })

  it('submitting the edit form calls update with the method id and edited payload', async () => {
    getAllMock.mockResolvedValue([
      makeMethod({ id: 'pm1', name: 'Efectivo', code: 'CASH', requires_reference: false, is_active: true }),
    ])
    updateMock.mockResolvedValue(makeMethod({ id: 'pm1', name: 'Efectivo Modificado' }))
    renderMetodosPago()
    await screen.findByText('Efectivo')

    await userEvent.click(screen.getByLabelText('Editar Efectivo'))
    await screen.findByRole('dialog', { name: /editar método de pago/i })

    const nameInput = screen.getByLabelText(/^nombre/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Efectivo Modificado')
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('pm1', {
        name: 'Efectivo Modificado',
        code: 'CASH',
        requires_reference: false,
        is_active: true,
      })
    )
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Método de pago actualizado', { icon: '✅' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /editar método de pago/i })).not.toBeInTheDocument()
    )
  })
})

describe('MobileMetodosPago — toggle status', () => {
  it('deactivating an active method calls updateStatus(id, false) and shows the deactivated toast', async () => {
    getAllMock.mockResolvedValue([makeMethod({ id: 'pm1', name: 'Efectivo', is_active: true })])
    updateStatusMock.mockResolvedValue(makeMethod({ id: 'pm1', is_active: false }))
    renderMetodosPago()
    await screen.findByText('Efectivo')

    await userEvent.click(screen.getByLabelText('Desactivar Efectivo'))

    await waitFor(() => expect(updateStatusMock).toHaveBeenCalledWith('pm1', false))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Método desactivado', { icon: '⏸️' }))
  })

  it('activating an inactive method calls updateStatus(id, true) and shows the activated toast', async () => {
    getAllMock.mockResolvedValue([makeMethod({ id: 'pm1', name: 'Efectivo', is_active: false })])
    updateStatusMock.mockResolvedValue(makeMethod({ id: 'pm1', is_active: true }))
    renderMetodosPago()
    await screen.findByText('Efectivo')

    await userEvent.click(screen.getByLabelText('Activar Efectivo'))

    await waitFor(() => expect(updateStatusMock).toHaveBeenCalledWith('pm1', true))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Método activado', { icon: '✅' }))
  })
})

describe('MobileMetodosPago — error toasts', () => {
  it('shows a visible error toast when create fails', async () => {
    getAllMock.mockResolvedValue([])
    createMock.mockRejectedValue(new Error('Network Error'))
    renderMetodosPago()
    await screen.findByText(/no hay métodos de pago/i)

    await userEvent.click(screen.getByRole('button', { name: /nuevo método/i }))
    await screen.findByRole('dialog', { name: /nuevo método de pago/i })
    await userEvent.type(screen.getByLabelText(/^nombre/i), 'Transferencia')
    await userEvent.click(screen.getByRole('button', { name: /crear método/i }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/network error/i)))
  })

  it('shows a visible error toast when update fails', async () => {
    getAllMock.mockResolvedValue([makeMethod({ id: 'pm1', name: 'Efectivo' })])
    updateMock.mockRejectedValue(new Error('Network Error'))
    renderMetodosPago()
    await screen.findByText('Efectivo')

    await userEvent.click(screen.getByLabelText('Editar Efectivo'))
    await screen.findByRole('dialog', { name: /editar método de pago/i })
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/network error/i)))
  })

  it('shows a visible error toast when toggling status fails', async () => {
    getAllMock.mockResolvedValue([makeMethod({ id: 'pm1', name: 'Efectivo', is_active: true })])
    updateStatusMock.mockRejectedValue(new Error('Network Error'))
    renderMetodosPago()
    await screen.findByText('Efectivo')

    await userEvent.click(screen.getByLabelText('Desactivar Efectivo'))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/network error/i)))
  })
})
