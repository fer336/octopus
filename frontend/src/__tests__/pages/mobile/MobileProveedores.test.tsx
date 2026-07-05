import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Supplier } from '../../../api/suppliersService'
import type { PaginatedResponse } from '../../../api/productsService'

const { getAllMock, createMock, updateMock, deleteMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  getAllMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('../../../api/suppliersService', () => ({
  default: { getAll: getAllMock, create: createMock, update: updateMock, delete: deleteMock },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccessMock, error: toastErrorMock },
}))

import MobileProveedores, { buildSupplierPayload, formatSupplierContactLine } from '../../../pages/mobile/MobileProveedores'

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 's1',
    business_id: 'b1',
    name: 'Distribuidora Central',
    default_discount_1: 0,
    default_discount_2: 0,
    default_discount_3: 0,
    category_ids: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function fixture(items: Supplier[]): PaginatedResponse<Supplier> {
  return { items, total: items.length, page: 1, per_page: 50, pages: 1 }
}

function renderProveedores() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileProveedores />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getAllMock.mockResolvedValue(fixture([]))
  createMock.mockResolvedValue(makeSupplier())
  updateMock.mockResolvedValue(makeSupplier())
  deleteMock.mockResolvedValue(undefined)
})

describe('MobileProveedores — pure helpers', () => {
  it('buildSupplierPayload trims and only includes non-empty optional fields, always sending a trimmed name', () => {
    expect(
      buildSupplierPayload({
        name: '  ACME S.A.  ',
        cuit: '  30-12345678-9  ',
        phone: '',
        email: '',
        contact_name: '',
        address: '',
        city: '',
        province: '',
        notes: '',
      })
    ).toEqual({ name: 'ACME S.A.', cuit: '30-12345678-9' })
  })

  it('buildSupplierPayload never includes default_discount_1/2/3 or category_ids (V1 scope reduction)', () => {
    const payload = buildSupplierPayload({
      name: 'ACME',
      cuit: '',
      phone: '',
      email: '',
      contact_name: '',
      address: '',
      city: '',
      province: '',
      notes: '',
    })
    expect(payload).not.toHaveProperty('default_discount_1')
    expect(payload).not.toHaveProperty('default_discount_2')
    expect(payload).not.toHaveProperty('default_discount_3')
    expect(payload).not.toHaveProperty('category_ids')
  })

  it('formatSupplierContactLine joins phone and contact_name with " · ", omitting whichever is missing', () => {
    expect(formatSupplierContactLine(makeSupplier({ phone: '11-5555-1234', contact_name: 'Juan' }))).toBe(
      '11-5555-1234 · Juan'
    )
    expect(formatSupplierContactLine(makeSupplier({ phone: '11-5555-1234', contact_name: undefined }))).toBe(
      '11-5555-1234'
    )
    expect(formatSupplierContactLine(makeSupplier({ phone: undefined, contact_name: undefined }))).toBe('')
  })
})

describe('MobileProveedores — data fetching / list rendering', () => {
  it('shows a loading spinner while the query is in flight', () => {
    getAllMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderProveedores()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('CRITICAL: shows an error message instead of a blank screen when getAll fails', async () => {
    getAllMock.mockRejectedValue({ response: { status: 500, data: {} } })
    renderProveedores()
    expect(await screen.findByText(/error interno del servidor/i)).toBeInTheDocument()
  })

  it('renders fetched suppliers with their available contact fields', async () => {
    getAllMock.mockResolvedValue(
      fixture([
        makeSupplier({ id: '1', name: 'Distribuidora Norte', cuit: '30-11111111-1', phone: '11-1111-1111' }),
      ])
    )
    renderProveedores()
    expect(await screen.findByText('Distribuidora Norte')).toBeInTheDocument()
    expect(screen.getByText('CUIT: 30-11111111-1')).toBeInTheDocument()
    expect(screen.getByText('11-1111-1111')).toBeInTheDocument()
  })

  it('does not render a broken/empty line for a supplier missing optional fields (e.g. no cuit)', async () => {
    getAllMock.mockResolvedValue(fixture([makeSupplier({ id: '1', name: 'Sin Datos', cuit: undefined, phone: undefined, contact_name: undefined })]))
    renderProveedores()
    await screen.findByText('Sin Datos')
    expect(screen.queryByText(/^CUIT:/)).not.toBeInTheDocument()
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are zero suppliers', async () => {
    getAllMock.mockResolvedValue(fixture([]))
    renderProveedores()
    expect(await screen.findByText(/no hay proveedores/i)).toBeInTheDocument()
  })

  it('typing in the search box eventually calls suppliersService.getAll with the typed search value', async () => {
    renderProveedores()
    await screen.findByText(/no hay proveedores/i)

    await userEvent.type(screen.getByLabelText('Buscar proveedor'), 'norte')

    await waitFor(() =>
      expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'norte' }))
    )
  })
})

describe('MobileProveedores — create flow', () => {
  it('tapping "Nuevo proveedor" opens the create form', async () => {
    renderProveedores()
    await screen.findByText(/no hay proveedores/i)

    await userEvent.click(screen.getByLabelText('Nuevo proveedor'))

    expect(await screen.findByRole('dialog', { name: 'Nuevo proveedor' })).toBeInTheDocument()
  })

  it('submitting with an empty name shows a validation error and does not call create', async () => {
    renderProveedores()
    await screen.findByText(/no hay proveedores/i)
    await userEvent.click(screen.getByLabelText('Nuevo proveedor'))
    await screen.findByRole('dialog', { name: 'Nuevo proveedor' })

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(toastErrorMock).toHaveBeenCalledWith('El nombre es obligatorio')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('submitting a valid new supplier calls create with exactly the filled fields and shows a success toast', async () => {
    renderProveedores()
    await screen.findByText(/no hay proveedores/i)
    await userEvent.click(screen.getByLabelText('Nuevo proveedor'))
    await screen.findByRole('dialog', { name: 'Nuevo proveedor' })

    await userEvent.type(screen.getByLabelText('Nombre *'), 'Nuevo Proveedor SA')
    await userEvent.type(screen.getByLabelText('CUIT'), '30-99999999-9')
    await userEvent.type(screen.getByLabelText('Teléfono'), '11-2222-3333')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        name: 'Nuevo Proveedor SA',
        cuit: '30-99999999-9',
        phone: '11-2222-3333',
      })
    )
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Proveedor creado', { icon: '✅' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo proveedor' })).not.toBeInTheDocument())
  })
})

describe('MobileProveedores — edit flow', () => {
  it('tapping "Editar" pre-fills the form, and submitting calls update with that supplier id and the edited payload', async () => {
    getAllMock.mockResolvedValue(
      fixture([makeSupplier({ id: 'sup-9', name: 'Proveedor Viejo', cuit: '30-1-1', phone: '11-0000-0000' })])
    )
    renderProveedores()
    await screen.findByText('Proveedor Viejo')

    await userEvent.click(screen.getByLabelText('Editar proveedor Proveedor Viejo'))

    expect(await screen.findByRole('dialog', { name: 'Editar proveedor' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Proveedor Viejo')
    expect(screen.getByLabelText('CUIT')).toHaveValue('30-1-1')
    expect(screen.getByLabelText('Teléfono')).toHaveValue('11-0000-0000')

    await userEvent.clear(screen.getByLabelText('Nombre *'))
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Proveedor Actualizado')

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('sup-9', {
        name: 'Proveedor Actualizado',
        cuit: '30-1-1',
        phone: '11-0000-0000',
      })
    )
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Proveedor actualizado', { icon: '✅' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar proveedor' })).not.toBeInTheDocument())
  })
})

describe('MobileProveedores — delete flow', () => {
  it('tapping "Eliminar" opens a confirm modal with no reason input', async () => {
    getAllMock.mockResolvedValue(fixture([makeSupplier({ id: 's1', name: 'A Eliminar' })]))
    renderProveedores()
    await screen.findByText('A Eliminar')

    await userEvent.click(screen.getByLabelText('Eliminar proveedor A Eliminar'))

    const dialog = await screen.findByRole('dialog', { name: 'Eliminar proveedor' })
    expect(dialog).toBeInTheDocument()
    expect(screen.queryByLabelText(/motivo/i)).not.toBeInTheDocument()
  })

  it('confirming delete calls suppliersService.delete, shows a success toast, closes the modal, and refetches', async () => {
    getAllMock.mockResolvedValue(fixture([makeSupplier({ id: 's1', name: 'A Eliminar' })]))
    renderProveedores()
    await screen.findByText('A Eliminar')

    await userEvent.click(screen.getByLabelText('Eliminar proveedor A Eliminar'))
    await screen.findByRole('dialog', { name: 'Eliminar proveedor' })
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Proveedor eliminado', { icon: '✅' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Eliminar proveedor' })).not.toBeInTheDocument())
    await waitFor(() => expect(getAllMock).toHaveBeenCalledTimes(2))
  })

  it('shows a visible error toast and keeps the modal open when delete fails', async () => {
    getAllMock.mockResolvedValue(fixture([makeSupplier({ id: 's1', name: 'A Eliminar' })]))
    deleteMock.mockRejectedValue(new Error('Network Error'))
    renderProveedores()
    await screen.findByText('A Eliminar')

    await userEvent.click(screen.getByLabelText('Eliminar proveedor A Eliminar'))
    await screen.findByRole('dialog', { name: 'Eliminar proveedor' })
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/network error/i)))
    expect(screen.getByRole('dialog', { name: 'Eliminar proveedor' })).toBeInTheDocument()
  })
})
