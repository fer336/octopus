import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Voucher, PaginatedVouchers } from '../../../api/vouchersService'

const { getAllVouchersMock } = vi.hoisted(() => ({
  getAllVouchersMock: vi.fn(),
}))

vi.mock('../../../api/vouchersService', () => ({
  default: { getAll: getAllVouchersMock },
}))

import MobileComprobantes, {
  resolveComprobanteStatus,
  resolveComprobanteTypeBadge,
  filterVouchersByType,
} from '../../../pages/mobile/MobileComprobantes'

function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'v1',
    client_id: 'c1',
    client: { id: 'c1', name: 'Ferretería López', document_type: 'CUIT', document_number: '30711223344', tax_condition: 'RI' },
    voucher_type: 'invoice_b',
    status: 'active',
    sale_point: '0001',
    number: '00000123',
    date: '2026-06-15',
    subtotal: 1000,
    iva_amount: 210,
    total: 1210,
    has_credit_note: false,
    is_paid: true,
    items: [],
    ...overrides,
  }
}

function fixture(items: Voucher[]): PaginatedVouchers {
  return { items, total: items.length, page: 1, per_page: 50, pages: 1 }
}

function renderComprobantes() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileComprobantes />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MobileComprobantes — pure helpers', () => {
  it('resolveComprobanteStatus: invoice + is_paid=true -> cobrado', () => {
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'invoice_a', is_paid: true }))).toBe('cobrado')
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'invoice_b', is_paid: true }))).toBe('cobrado')
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'invoice_c', is_paid: true }))).toBe('cobrado')
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'invoice_x', is_paid: true }))).toBe('cobrado')
  })

  it('resolveComprobanteStatus: invoice + is_paid=false -> pendiente', () => {
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'invoice_a', is_paid: false }))).toBe('pendiente')
  })

  it('resolveComprobanteStatus: invoice + is_paid=undefined -> pendiente', () => {
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'invoice_a', is_paid: undefined }))).toBe('pendiente')
  })

  it('resolveComprobanteStatus: quotation -> vigente regardless of is_paid', () => {
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'quotation', is_paid: true }))).toBe('vigente')
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'quotation', is_paid: false }))).toBe('vigente')
  })

  it('resolveComprobanteStatus: receipt -> vigente regardless of is_paid', () => {
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'receipt', is_paid: true }))).toBe('vigente')
    expect(resolveComprobanteStatus(makeVoucher({ voucher_type: 'receipt', is_paid: false }))).toBe('vigente')
  })

  it('resolveComprobanteTypeBadge maps quotation/receipt/invoice_* correctly', () => {
    expect(resolveComprobanteTypeBadge('quotation')).toBe('cotizacion')
    expect(resolveComprobanteTypeBadge('receipt')).toBe('remito')
    expect(resolveComprobanteTypeBadge('invoice_a')).toBe('factura')
    expect(resolveComprobanteTypeBadge('invoice_b')).toBe('factura')
    expect(resolveComprobanteTypeBadge('invoice_c')).toBe('factura')
    expect(resolveComprobanteTypeBadge('invoice_x')).toBe('factura')
  })

  it('filterVouchersByType: todos returns all vouchers unchanged', () => {
    const vouchers = [
      makeVoucher({ id: '1', voucher_type: 'quotation' }),
      makeVoucher({ id: '2', voucher_type: 'receipt' }),
      makeVoucher({ id: '3', voucher_type: 'invoice_a' }),
    ]
    expect(filterVouchersByType(vouchers, 'todos')).toEqual(vouchers)
  })

  it('filterVouchersByType: cotizacion matches only quotation', () => {
    const vouchers = [
      makeVoucher({ id: '1', voucher_type: 'quotation' }),
      makeVoucher({ id: '2', voucher_type: 'receipt' }),
      makeVoucher({ id: '3', voucher_type: 'invoice_a' }),
    ]
    expect(filterVouchersByType(vouchers, 'cotizacion')).toEqual([vouchers[0]])
  })

  it('filterVouchersByType: remito matches only receipt', () => {
    const vouchers = [
      makeVoucher({ id: '1', voucher_type: 'quotation' }),
      makeVoucher({ id: '2', voucher_type: 'receipt' }),
      makeVoucher({ id: '3', voucher_type: 'invoice_a' }),
    ]
    expect(filterVouchersByType(vouchers, 'remito')).toEqual([vouchers[1]])
  })

  it('filterVouchersByType: factura matches all 4 invoice_* variants', () => {
    const vouchers = [
      makeVoucher({ id: '1', voucher_type: 'quotation' }),
      makeVoucher({ id: '2', voucher_type: 'invoice_a' }),
      makeVoucher({ id: '3', voucher_type: 'invoice_b' }),
      makeVoucher({ id: '4', voucher_type: 'invoice_c' }),
      makeVoucher({ id: '5', voucher_type: 'invoice_x' }),
    ]
    expect(filterVouchersByType(vouchers, 'factura')).toEqual([vouchers[1], vouchers[2], vouchers[3], vouchers[4]])
  })
})

describe('MobileComprobantes — data fetching', () => {
  it('fetches vouchers once with per_page=50 and no server-side voucher_type filter', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([]))
    renderComprobantes()
    await screen.findByText(/todos/i)
    expect(getAllVouchersMock).toHaveBeenCalledWith({ per_page: 50 })
    expect(getAllVouchersMock).toHaveBeenCalledTimes(1)
  })

  it('shows a loading spinner while the query is in flight', () => {
    getAllVouchersMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderComprobantes()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('CRITICAL: shows an error message instead of a blank screen when getAll fails', async () => {
    getAllVouchersMock.mockRejectedValue({
      response: { status: 500, data: {} },
    })
    renderComprobantes()
    expect(await screen.findByText(/error interno del servidor/i)).toBeInTheDocument()
  })
})

describe('MobileComprobantes — chip filter', () => {
  it('shows all vouchers by default (Todos)', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([
        makeVoucher({ id: '1', voucher_type: 'quotation', client: { id: 'c1', name: 'Cliente A', document_type: 'CUIT', document_number: '1', tax_condition: 'RI' } }),
        makeVoucher({ id: '2', voucher_type: 'receipt', client: { id: 'c2', name: 'Cliente B', document_type: 'CUIT', document_number: '2', tax_condition: 'RI' } }),
      ])
    )
    renderComprobantes()
    expect(await screen.findByText('Cliente A')).toBeInTheDocument()
    expect(screen.getByText('Cliente B')).toBeInTheDocument()
  })

  it('filters the list to only quotations when "Cotización" chip is clicked', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([
        makeVoucher({ id: '1', voucher_type: 'quotation', client: { id: 'c1', name: 'Cliente A', document_type: 'CUIT', document_number: '1', tax_condition: 'RI' } }),
        makeVoucher({ id: '2', voucher_type: 'receipt', client: { id: 'c2', name: 'Cliente B', document_type: 'CUIT', document_number: '2', tax_condition: 'RI' } }),
      ])
    )
    renderComprobantes()
    await screen.findByText('Cliente A')

    await userEvent.click(screen.getByRole('button', { name: 'Cotización' }))

    expect(screen.getByText('Cliente A')).toBeInTheDocument()
    expect(screen.queryByText('Cliente B')).not.toBeInTheDocument()
    expect(getAllVouchersMock).toHaveBeenCalledTimes(1)
  })

  it('filters the list to only receipts when "Remito" chip is clicked', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([
        makeVoucher({ id: '1', voucher_type: 'quotation', client: { id: 'c1', name: 'Cliente A', document_type: 'CUIT', document_number: '1', tax_condition: 'RI' } }),
        makeVoucher({ id: '2', voucher_type: 'receipt', client: { id: 'c2', name: 'Cliente B', document_type: 'CUIT', document_number: '2', tax_condition: 'RI' } }),
      ])
    )
    renderComprobantes()
    await screen.findByText('Cliente A')

    await userEvent.click(screen.getByRole('button', { name: 'Remito' }))

    expect(screen.queryByText('Cliente A')).not.toBeInTheDocument()
    expect(screen.getByText('Cliente B')).toBeInTheDocument()
  })

  it('filters the list to all invoice variants when "Factura" chip is clicked', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([
        makeVoucher({ id: '1', voucher_type: 'quotation', client: { id: 'c1', name: 'Cliente A', document_type: 'CUIT', document_number: '1', tax_condition: 'RI' } }),
        makeVoucher({ id: '2', voucher_type: 'invoice_a', client: { id: 'c2', name: 'Cliente B', document_type: 'CUIT', document_number: '2', tax_condition: 'RI' } }),
        makeVoucher({ id: '3', voucher_type: 'invoice_c', client: { id: 'c3', name: 'Cliente C', document_type: 'CUIT', document_number: '3', tax_condition: 'RI' } }),
      ])
    )
    renderComprobantes()
    await screen.findByText('Cliente A')

    await userEvent.click(screen.getByRole('button', { name: 'Factura' }))

    expect(screen.queryByText('Cliente A')).not.toBeInTheDocument()
    expect(screen.getByText('Cliente B')).toBeInTheDocument()
    expect(screen.getByText('Cliente C')).toBeInTheDocument()
  })
})

describe('MobileComprobantes — card rendering', () => {
  it('renders code (sale_point-number), client name, date, amount, type badge and status for an invoice', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([
        makeVoucher({
          id: '1',
          voucher_type: 'invoice_b',
          sale_point: '0001',
          number: '00000123',
          date: '2026-06-15',
          total: 1210,
          is_paid: true,
          client: { id: 'c1', name: 'Ferretería López', document_type: 'CUIT', document_number: '1', tax_condition: 'RI' },
        }),
      ])
    )
    renderComprobantes()
    expect(await screen.findByText('0001-00000123')).toBeInTheDocument()
    expect(screen.getByText('Ferretería López')).toBeInTheDocument()
    expect(screen.getByText('$1.210,00')).toBeInTheDocument()
    expect(screen.getByTestId('comprobante-type-badge')).toHaveTextContent('Factura')
    expect(screen.getByText('Cobrado')).toBeInTheDocument()
  })

  it('falls back to "Consumidor final" when the voucher has no client', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([makeVoucher({ id: '1', client: undefined })])
    )
    renderComprobantes()
    expect(await screen.findByText('Consumidor final')).toBeInTheDocument()
  })

  it('shows "Pendiente" status for an unpaid invoice', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([makeVoucher({ id: '1', voucher_type: 'invoice_a', is_paid: false })])
    )
    renderComprobantes()
    await screen.findByText('Pendiente')
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
  })

  it('shows "Vigente" status and "Cotización" badge for a quotation', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([makeVoucher({ id: '1', voucher_type: 'quotation', is_paid: false })])
    )
    renderComprobantes()
    await screen.findByTestId('comprobante-card')
    expect(screen.getByTestId('comprobante-type-badge')).toHaveTextContent('Cotización')
    expect(screen.getByText('Vigente')).toBeInTheDocument()
  })

  it('shows "Vigente" status and "Remito" badge for a receipt', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([makeVoucher({ id: '1', voucher_type: 'receipt', is_paid: false })])
    )
    renderComprobantes()
    await screen.findByTestId('comprobante-card')
    expect(screen.getByTestId('comprobante-type-badge')).toHaveTextContent('Remito')
    expect(screen.getByText('Vigente')).toBeInTheDocument()
  })
})

describe('MobileComprobantes — empty state', () => {
  it('shows an empty state when there are no vouchers to display', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([]))
    renderComprobantes()
    expect(await screen.findByText(/no hay comprobantes/i)).toBeInTheDocument()
  })

  it('shows an empty state when the filter excludes every voucher', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: '1', voucher_type: 'quotation' })]))
    renderComprobantes()
    await screen.findByText(/todos/i)

    await userEvent.click(screen.getByRole('button', { name: 'Remito' }))

    expect(await screen.findByText(/no hay comprobantes/i)).toBeInTheDocument()
  })
})
