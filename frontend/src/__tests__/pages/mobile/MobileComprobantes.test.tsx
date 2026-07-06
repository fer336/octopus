import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Voucher, PaginatedVouchers, DeleteVoucherResponse } from '../../../api/vouchersService'

const { getAllVouchersMock, getPdfMock, deleteMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  getAllVouchersMock: vi.fn(),
  getPdfMock: vi.fn(),
  deleteMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('../../../api/vouchersService', () => ({
  default: { getAll: getAllVouchersMock, getPdf: getPdfMock, delete: deleteMock },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccessMock, error: toastErrorMock },
}))

vi.mock('../../../components/messaging/WhatsAppSendPdfButton', () => ({
  // Lightweight test double — real props are exercised via getPdfBlob() call
  default: (props: any) => (
    <button aria-label="Enviar por WhatsApp" onClick={() => props.getPdfBlob()} />
  ),
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

function renderComprobantes(props: { whatsappEnabled?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileComprobantes {...props} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getPdfMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  deleteMock.mockResolvedValue({ message: 'Comprobante eliminado correctamente' } satisfies DeleteVoucherResponse)
  // jsdom doesn't implement these — stub them so the in-app PDF viewer
  // (PdfViewerSheet's pdfUrl, built via URL.createObjectURL(blob)) is
  // exercisable, matching MobileSales.test.tsx's convention.
  ;(URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = vi.fn(() => 'blob:mock-url')
  ;(URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = vi.fn()
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

describe('MobileComprobantes — Ver PDF action', () => {
  it('fetches the PDF and shows the in-app viewer when "Ver PDF" is tapped', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: '1', sale_point: '0001', number: '00000123' , voucher_type: 'quotation' })]))
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    await userEvent.click(screen.getByLabelText('Ver PDF 0001-00000123'))

    await waitFor(() => expect(getPdfMock).toHaveBeenCalledWith('1'))
    expect(await screen.findByRole('dialog', { name: '0001-00000123' })).toBeInTheDocument()
    const iframe = (await screen.findByTitle('Visor de PDF')) as HTMLIFrameElement
    expect(iframe.src).toContain('blob:mock-url')
  })
})

describe('MobileComprobantes — WhatsApp action (feature-flag gated)', () => {
  it('renders the WhatsApp button by default (whatsappEnabled defaults to true)', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: '1' })]))
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    expect(screen.getByLabelText('Enviar por WhatsApp')).toBeInTheDocument()
  })

  it('does not render the WhatsApp button when whatsappEnabled is false', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: '1' })]))
    renderComprobantes({ whatsappEnabled: false })
    await screen.findByTestId('comprobante-card')

    expect(screen.queryByLabelText('Enviar por WhatsApp')).not.toBeInTheDocument()
  })

  it('does not render the WhatsApp button for Cotización/Remito, even with whatsappEnabled true (matches desktop\'s isInvoiceVoucher gate, Vouchers.tsx ~1782)', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([makeVoucher({ id: '1', voucher_type: 'quotation' }), makeVoucher({ id: '2', voucher_type: 'receipt' })])
    )
    renderComprobantes()
    await screen.findAllByTestId('comprobante-card')

    expect(screen.queryByLabelText('Enviar por WhatsApp')).not.toBeInTheDocument()
  })

  it('wires getPdfBlob to vouchersService.getPdf for the correct voucher', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: 'v-42' })]))
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    await userEvent.click(screen.getByLabelText('Enviar por WhatsApp'))

    await waitFor(() => expect(getPdfMock).toHaveBeenCalledWith('v-42'))
  })
})

describe('MobileComprobantes — Eliminar eligibility (matches desktop\'s exact rule, Vouchers.tsx ~1816-1830)', () => {
  it('does not render Eliminar for Factura (a real emitted invoice needs a Nota de Crédito, not a delete)', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([makeVoucher({ id: '1', sale_point: '0001', number: '00000123', voucher_type: 'invoice_a' })])
    )
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    expect(screen.queryByLabelText('Eliminar comprobante 0001-00000123')).not.toBeInTheDocument()
  })

  it('does not render Eliminar for a voucher already soft-deleted', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([
        makeVoucher({
          id: '1',
          sale_point: '0001',
          number: '00000123',
          voucher_type: 'quotation',
          deleted_at: '2026-01-01T00:00:00Z',
        }),
      ])
    )
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    expect(screen.queryByLabelText('Eliminar comprobante 0001-00000123')).not.toBeInTheDocument()
  })

  it('does not render Eliminar for a receipt linked to a current-account closure', async () => {
    getAllVouchersMock.mockResolvedValue(
      fixture([
        makeVoucher({
          id: '1',
          sale_point: '0001',
          number: '00000123',
          voucher_type: 'receipt',
          is_receipt_linked_to_current_account_closure: true,
        }),
      ])
    )
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    expect(screen.queryByLabelText('Eliminar comprobante 0001-00000123')).not.toBeInTheDocument()
  })
})

describe('MobileComprobantes — Eliminar action', () => {
  it('opens the confirm modal with the Eliminar button disabled until a reason is typed', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: '1', sale_point: '0001', number: '00000123' , voucher_type: 'quotation' })]))
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    await userEvent.click(screen.getByLabelText('Eliminar comprobante 0001-00000123'))

    const dialog = await screen.findByRole('dialog', { name: /eliminar comprobante/i })
    expect(dialog).toBeInTheDocument()
    const confirmButton = screen.getByRole('button', { name: 'Eliminar' })
    expect(confirmButton).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/motivo de eliminación/i), 'Duplicado')
    expect(confirmButton).toBeEnabled()
  })

  it('confirming delete with a reason calls vouchersService.delete, shows a success toast, closes the modal, and refetches the list', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: 'v1', sale_point: '0001', number: '00000123' , voucher_type: 'quotation' })]))
    deleteMock.mockResolvedValue({ message: 'Comprobante eliminado correctamente' } satisfies DeleteVoucherResponse)
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    await userEvent.click(screen.getByLabelText('Eliminar comprobante 0001-00000123'))
    await userEvent.type(screen.getByLabelText(/motivo de eliminación/i), 'Duplicado')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('v1', 'Duplicado'))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Comprobante eliminado correctamente', { icon: '✅' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /eliminar comprobante/i })).not.toBeInTheDocument())
    await waitFor(() => expect(getAllVouchersMock).toHaveBeenCalledTimes(2))
  })

  it('shows the authorization-pending toast message instead of the generic success message when authorization_required is true', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: 'v1', sale_point: '0001', number: '00000123' , voucher_type: 'quotation' })]))
    deleteMock.mockResolvedValue({
      authorization_required: true,
      authorization_id: 'auth-1',
      message: 'Solicitud de autorización enviada',
    } satisfies DeleteVoucherResponse)
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    await userEvent.click(screen.getByLabelText('Eliminar comprobante 0001-00000123'))
    await userEvent.type(screen.getByLabelText(/motivo de eliminación/i), 'Duplicado')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith('Solicitud de autorización enviada', { icon: '🔒' })
    )
    expect(toastSuccessMock).not.toHaveBeenCalledWith('Comprobante eliminado correctamente', expect.anything())
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /eliminar comprobante/i })).not.toBeInTheDocument())
  })

  it('shows a visible error toast and keeps the modal open when the delete request fails', async () => {
    getAllVouchersMock.mockResolvedValue(fixture([makeVoucher({ id: 'v1', sale_point: '0001', number: '00000123' , voucher_type: 'quotation' })]))
    deleteMock.mockRejectedValue(new Error('Network Error'))
    renderComprobantes()
    await screen.findByTestId('comprobante-card')

    await userEvent.click(screen.getByLabelText('Eliminar comprobante 0001-00000123'))
    await userEvent.type(screen.getByLabelText(/motivo de eliminación/i), 'Duplicado')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/network error/i)))
    expect(screen.getByRole('dialog', { name: /eliminar comprobante/i })).toBeInTheDocument()
  })
})
