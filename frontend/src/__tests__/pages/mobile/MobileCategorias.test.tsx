import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Category } from '../../../api/categoriesService'

const { getAllMock, createMock, updateMock, deleteMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  getAllMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('../../../api/categoriesService', () => ({
  default: { getAll: getAllMock, create: createMock, update: updateMock, delete: deleteMock },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccessMock, error: toastErrorMock },
}))

import MobileCategorias, {
  resolveParentCategoryName,
  filterCategoriesByQuery,
} from '../../../pages/mobile/MobileCategorias'

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    business_id: 'b1',
    name: 'Grifería',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderCategorias() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileCategorias />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  createMock.mockResolvedValue(makeCategory())
  updateMock.mockResolvedValue(makeCategory())
  deleteMock.mockResolvedValue(undefined)
})

describe('MobileCategorias — pure helpers', () => {
  it('resolveParentCategoryName resolves an existing parent name', () => {
    const categories = [makeCategory({ id: 'p1', name: 'Herramientas' }), makeCategory({ id: 'c1', name: 'Martillos', parent_id: 'p1' })]
    expect(resolveParentCategoryName(categories, 'p1')).toBe('Herramientas')
  })

  it('resolveParentCategoryName returns null for undefined parentId', () => {
    const categories = [makeCategory({ id: 'p1', name: 'Herramientas' })]
    expect(resolveParentCategoryName(categories, undefined)).toBeNull()
  })

  it('resolveParentCategoryName returns null when the parent id does not match anything', () => {
    const categories = [makeCategory({ id: 'p1', name: 'Herramientas' })]
    expect(resolveParentCategoryName(categories, 'does-not-exist')).toBeNull()
  })

  it('filterCategoriesByQuery: empty query returns all categories unchanged', () => {
    const categories = [makeCategory({ id: '1', name: 'Grifería' }), makeCategory({ id: '2', name: 'Herramientas' })]
    expect(filterCategoriesByQuery(categories, '')).toEqual(categories)
  })

  it('filterCategoriesByQuery: filters case-insensitively by name', () => {
    const categories = [makeCategory({ id: '1', name: 'Grifería' }), makeCategory({ id: '2', name: 'Herramientas' })]
    expect(filterCategoriesByQuery(categories, 'grif')).toEqual([categories[0]])
  })
})

describe('MobileCategorias — data fetching', () => {
  it('shows a loading spinner while the query is in flight', () => {
    getAllMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderCategorias()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('CRITICAL: shows an error message instead of a blank screen when getAll fails', async () => {
    getAllMock.mockRejectedValue({ response: { status: 500, data: {} } })
    renderCategorias()
    expect(await screen.findByText(/error interno del servidor/i)).toBeInTheDocument()
  })

  it('renders the fetched categories once loaded', async () => {
    getAllMock.mockResolvedValue([makeCategory({ id: '1', name: 'Grifería' }), makeCategory({ id: '2', name: 'Herramientas' })])
    renderCategorias()
    expect(await screen.findByText('Grifería')).toBeInTheDocument()
    expect(screen.getByText('Herramientas')).toBeInTheDocument()
  })
})

describe('MobileCategorias — card rendering', () => {
  it('shows "Subcategoría de: X" for a category with a parent_id', async () => {
    getAllMock.mockResolvedValue([
      makeCategory({ id: 'p1', name: 'Herramientas' }),
      makeCategory({ id: 'c1', name: 'Martillos', parent_id: 'p1' }),
    ])
    renderCategorias()
    await screen.findByText('Martillos')
    expect(screen.getByText(/subcategoría de: herramientas/i)).toBeInTheDocument()
  })

  it('does not show the "Subcategoría de" line for a top-level category', async () => {
    getAllMock.mockResolvedValue([makeCategory({ id: '1', name: 'Grifería' })])
    renderCategorias()
    await screen.findByText('Grifería')
    expect(screen.queryByText(/subcategoría de:/i)).not.toBeInTheDocument()
  })
})

describe('MobileCategorias — search', () => {
  it('filters the list by name as the user types', async () => {
    getAllMock.mockResolvedValue([makeCategory({ id: '1', name: 'Grifería' }), makeCategory({ id: '2', name: 'Herramientas' })])
    renderCategorias()
    await screen.findByText('Grifería')

    await userEvent.type(screen.getByLabelText(/buscar categoría/i), 'grif')

    expect(screen.getByText('Grifería')).toBeInTheDocument()
    expect(screen.queryByText('Herramientas')).not.toBeInTheDocument()
  })
})

describe('MobileCategorias — empty state', () => {
  it('shows an empty state when there are zero categories', async () => {
    getAllMock.mockResolvedValue([])
    renderCategorias()
    expect(await screen.findByText(/no hay categorías/i)).toBeInTheDocument()
  })

  it('shows an empty state when the search filters out every category', async () => {
    getAllMock.mockResolvedValue([makeCategory({ id: '1', name: 'Grifería' })])
    renderCategorias()
    await screen.findByText('Grifería')

    await userEvent.type(screen.getByLabelText(/buscar categoría/i), 'zzz')

    expect(await screen.findByText(/no hay categorías/i)).toBeInTheDocument()
  })
})

describe('MobileCategorias — create flow', () => {
  it('tapping "Nueva categoría" opens the create form', async () => {
    getAllMock.mockResolvedValue([])
    renderCategorias()
    await screen.findByText(/no hay categorías/i)

    await userEvent.click(screen.getByRole('button', { name: /nueva categoría/i }))

    expect(await screen.findByRole('dialog', { name: /nueva categoría/i })).toBeInTheDocument()
  })

  it('submitting with an empty name shows a validation error and does not call create', async () => {
    getAllMock.mockResolvedValue([])
    renderCategorias()
    await screen.findByText(/no hay categorías/i)

    await userEvent.click(screen.getByRole('button', { name: /nueva categoría/i }))
    await screen.findByRole('dialog', { name: /nueva categoría/i })
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('El nombre es obligatorio'))
    expect(createMock).not.toHaveBeenCalled()
  })

  it('submitting a valid new top-level category (no parent) calls create with the right payload', async () => {
    getAllMock.mockResolvedValue([])
    renderCategorias()
    await screen.findByText(/no hay categorías/i)

    await userEvent.click(screen.getByRole('button', { name: /nueva categoría/i }))
    await screen.findByRole('dialog', { name: /nueva categoría/i })

    await userEvent.type(screen.getByLabelText(/^nombre/i), 'Grifería')
    await userEvent.type(screen.getByLabelText(/descripción/i), 'Canillas y accesorios')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ name: 'Grifería', description: 'Canillas y accesorios', parent_id: undefined })
    )
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Categoría creada correctamente', expect.anything()))
  })

  it('submitting a valid new category with a selected parent calls create with parent_id set', async () => {
    getAllMock.mockResolvedValue([makeCategory({ id: 'p1', name: 'Herramientas' })])
    renderCategorias()
    await screen.findByText('Herramientas')

    await userEvent.click(screen.getByRole('button', { name: /nueva categoría/i }))
    await screen.findByRole('dialog', { name: /nueva categoría/i })

    await userEvent.type(screen.getByLabelText(/^nombre/i), 'Martillos')
    await userEvent.selectOptions(screen.getByLabelText(/categoría padre/i), 'p1')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ name: 'Martillos', description: undefined, parent_id: 'p1' })
    )
  })
})

describe('MobileCategorias — edit flow', () => {
  it('tapping "Editar" pre-fills the form and excludes the category itself from the parent options; submitting calls update', async () => {
    getAllMock.mockResolvedValue([
      makeCategory({ id: 'p1', name: 'Herramientas' }),
      makeCategory({ id: 'c1', name: 'Martillos', parent_id: 'p1', description: 'Percusión' }),
    ])
    renderCategorias()
    await screen.findByText('Martillos')

    await userEvent.click(screen.getByLabelText(/editar categoría martillos/i))

    const dialog = await screen.findByRole('dialog', { name: /editar categoría/i })
    expect(within(dialog).getByLabelText(/^nombre/i)).toHaveValue('Martillos')
    expect(within(dialog).getByLabelText(/descripción/i)).toHaveValue('Percusión')
    expect(within(dialog).getByLabelText(/categoría padre/i)).toHaveValue('p1')

    const parentSelect = within(dialog).getByLabelText(/categoría padre/i) as HTMLSelectElement
    const optionValues = Array.from(parentSelect.options).map((o) => o.value)
    expect(optionValues).not.toContain('c1')

    await userEvent.clear(within(dialog).getByLabelText(/^nombre/i))
    await userEvent.type(within(dialog).getByLabelText(/^nombre/i), 'Martillos y mazas')
    await userEvent.click(within(dialog).getByRole('button', { name: /guardar/i }))

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('c1', { name: 'Martillos y mazas', description: 'Percusión', parent_id: 'p1' })
    )
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Categoría actualizada correctamente', expect.anything()))
  })
})

describe('MobileCategorias — delete flow', () => {
  it('tapping "Eliminar" opens a confirm modal with no reason input', async () => {
    getAllMock.mockResolvedValue([makeCategory({ id: 'c1', name: 'Grifería' })])
    renderCategorias()
    await screen.findByText('Grifería')

    await userEvent.click(screen.getByLabelText(/eliminar categoría grifería/i))

    const dialog = await screen.findByRole('dialog', { name: /eliminar categoría/i })
    expect(dialog).toBeInTheDocument()
    expect(screen.queryByLabelText(/motivo/i)).not.toBeInTheDocument()
  })

  it('confirming delete calls categoriesService.delete, shows a success toast, closes the modal, and refetches', async () => {
    getAllMock.mockResolvedValue([makeCategory({ id: 'c1', name: 'Grifería' })])
    renderCategorias()
    await screen.findByText('Grifería')

    await userEvent.click(screen.getByLabelText(/eliminar categoría grifería/i))
    const dialog = await screen.findByRole('dialog', { name: /eliminar categoría/i })
    await userEvent.click(within(dialog).getByRole('button', { name: /eliminar/i }))

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Categoría eliminada correctamente', expect.anything()))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /eliminar categoría/i })).not.toBeInTheDocument())
    await waitFor(() => expect(getAllMock).toHaveBeenCalledTimes(2))
  })

  it('shows a visible error toast and keeps the modal open when the delete request fails', async () => {
    getAllMock.mockResolvedValue([makeCategory({ id: 'c1', name: 'Grifería' })])
    deleteMock.mockRejectedValue(new Error('Network Error'))
    renderCategorias()
    await screen.findByText('Grifería')

    await userEvent.click(screen.getByLabelText(/eliminar categoría grifería/i))
    const dialog = await screen.findByRole('dialog', { name: /eliminar categoría/i })
    await userEvent.click(within(dialog).getByRole('button', { name: /eliminar/i }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/network error/i)))
    expect(screen.getByRole('dialog', { name: /eliminar categoría/i })).toBeInTheDocument()
  })
})
