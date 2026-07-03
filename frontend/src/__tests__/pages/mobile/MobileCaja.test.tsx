import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { CashMovement, CashRegister, PaymentMethodSummary } from '../../../types/cash'

const {
  getCurrentCashMock,
  openCashMock,
  closeCashMock,
  addMovementMock,
  getCashSummaryMock,
} = vi.hoisted(() => ({
  getCurrentCashMock: vi.fn(),
  openCashMock: vi.fn(),
  closeCashMock: vi.fn(),
  addMovementMock: vi.fn(),
  getCashSummaryMock: vi.fn(),
}))

vi.mock('../../../api/cashService', () => ({
  getCurrentCash: getCurrentCashMock,
  openCash: openCashMock,
  closeCash: closeCashMock,
  addMovement: addMovementMock,
  getCashSummary: getCashSummaryMock,
}))

import MobileCaja, {
  resolveMovementDirection,
  formatMovementTime,
  computeIncomeExpenseTotals,
  hasClosingDifference,
  sortMovementsByRecency,
} from '../../../pages/mobile/MobileCaja'

function makeMovement(overrides: Partial<CashMovement> = {}): CashMovement {
  return {
    id: 'm1',
    type: 'INCOME',
    payment_method: 'CASH',
    amount: 1000,
    description: 'Venta mostrador',
    voucher_id: null,
    created_by: 'u1',
    created_at: '2026-07-03T12:00:00',
    ...overrides,
  }
}

function makeRegister(overrides: Partial<CashRegister> = {}): CashRegister {
  return {
    id: 'cr1',
    business_id: 'b1',
    opened_by: 'u1',
    closed_by: null,
    status: 'OPEN',
    is_expired: false,
    opening_amount: 5000,
    opened_at: '2026-07-03T09:00:00',
    closed_at: null,
    counted_cash: null,
    difference: null,
    difference_reason: null,
    closing_pdf_path: null,
    movements: [],
    created_at: '2026-07-03T09:00:00',
    ...overrides,
  }
}

function makeSummary(overrides: Partial<{ by_method: PaymentMethodSummary[]; total_net: number; expected_cash: number }> = {}) {
  return {
    by_method: [],
    total_net: 0,
    expected_cash: 0,
    ...overrides,
  }
}

/** Independently mirrors formatMovementTime's contract (append 'Z' to force UTC, then format in the runtime's local timezone) so assertions don't hardcode a timezone-dependent literal. */
function expectedLocalTime(iso: string): string {
  const withZ = iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`
  return new Date(withZ).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function renderCaja() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MobileCaja />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentCashMock.mockResolvedValue(null)
  getCashSummaryMock.mockResolvedValue(makeSummary())
  openCashMock.mockResolvedValue(makeRegister())
  closeCashMock.mockResolvedValue(makeRegister({ status: 'CLOSED' }))
  addMovementMock.mockResolvedValue(makeMovement())
})

describe('MobileCaja — pure helpers', () => {
  it('resolveMovementDirection classifies EXPENSE as expense and everything else as income', () => {
    expect(resolveMovementDirection('EXPENSE')).toBe('expense')
    expect(resolveMovementDirection('INCOME')).toBe('income')
    expect(resolveMovementDirection('SALE')).toBe('income')
    expect(resolveMovementDirection('PAYMENT_RECEIVED')).toBe('income')
  })

  it('formatMovementTime renders an HH:MM time from an ISO string without timezone', () => {
    expect(formatMovementTime('2026-07-03T14:05:00')).toBe(expectedLocalTime('2026-07-03T14:05:00'))
  })

  it('computeIncomeExpenseTotals sums sales+payments_received+income as income and total_expense as expense across methods', () => {
    const byMethod: PaymentMethodSummary[] = [
      { payment_method: 'CASH', total_sales: 1000, total_payments_received: 500, total_income: 200, total_expense: 300, net: 1400 },
      { payment_method: 'CARD', total_sales: 2000, total_payments_received: 0, total_income: 0, total_expense: 100, net: 1900 },
    ]
    expect(computeIncomeExpenseTotals(byMethod)).toEqual({ income: 3700, expense: 400 })
  })

  it('computeIncomeExpenseTotals returns zeros for an empty method list', () => {
    expect(computeIncomeExpenseTotals([])).toEqual({ income: 0, expense: 0 })
  })

  it('hasClosingDifference is false when counted is null (auto-close)', () => {
    expect(hasClosingDifference(null, 5000)).toBe(false)
  })

  it('hasClosingDifference is false when counted matches expected exactly', () => {
    expect(hasClosingDifference(5000, 5000)).toBe(false)
  })

  it('hasClosingDifference is true when counted differs from expected', () => {
    expect(hasClosingDifference(4800, 5000)).toBe(true)
  })

  it('sortMovementsByRecency orders movements from most recent to oldest', () => {
    const older = makeMovement({ id: 'm1', created_at: '2026-07-03T09:00:00' })
    const newer = makeMovement({ id: 'm2', created_at: '2026-07-03T12:00:00' })
    expect(sortMovementsByRecency([older, newer])).toEqual([newer, older])
  })
})

describe('MobileCaja — no open register (empty state)', () => {
  it('shows the "abrir caja" empty state when GET /cash/current returns null', async () => {
    renderCaja()
    expect(await screen.findByRole('heading', { name: /abrir caja/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /abrir caja/i })).toBeInTheDocument()
  })

  it('opens a new cash register with the typed opening amount via the real openCash service call', async () => {
    renderCaja()
    await screen.findByRole('heading', { name: /abrir caja/i })

    await userEvent.type(screen.getByLabelText(/monto inicial/i), '5000')
    await userEvent.click(screen.getByRole('button', { name: /abrir caja/i }))

    await waitFor(() => {
      expect(openCashMock).toHaveBeenCalledWith({ opening_amount: 5000 })
    })
  })

  it('BUG 1: shows the backend error message when opening the register fails (e.g. 422 for a negative amount) instead of failing silently', async () => {
    openCashMock.mockRejectedValueOnce({
      response: { status: 422, data: { detail: 'opening_amount: El monto no puede ser negativo' } },
    })
    renderCaja()
    await screen.findByRole('heading', { name: /abrir caja/i })

    await userEvent.type(screen.getByLabelText(/monto inicial/i), '-100')
    await userEvent.click(screen.getByRole('button', { name: /abrir caja/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/el monto no puede ser negativo/i)
  })
})

describe('MobileCaja — open register', () => {
  beforeEach(() => {
    getCurrentCashMock.mockResolvedValue(
      makeRegister({
        id: 'cr1',
        movements: [
          makeMovement({ id: 'm1', type: 'INCOME', payment_method: 'CASH', amount: 1000, description: 'Venta mostrador', created_at: '2026-07-03T10:00:00' }),
          makeMovement({ id: 'm2', type: 'EXPENSE', payment_method: 'CASH', amount: 300, description: 'Compra insumos', created_at: '2026-07-03T11:00:00' }),
        ],
      })
    )
    getCashSummaryMock.mockResolvedValue(
      makeSummary({
        expected_cash: 5700,
        by_method: [
          { payment_method: 'CASH', total_sales: 0, total_payments_received: 0, total_income: 1000, total_expense: 300, net: 700 },
        ],
      })
    )
  })

  it('shows the "caja abierta" hero with the current balance from the summary endpoint', async () => {
    renderCaja()
    expect(await screen.findByText(/caja abierta/i)).toBeInTheDocument()
    expect(await screen.findByText('$5.700,00')).toBeInTheDocument()
  })

  it('shows Ingresos/Egresos cards computed from the real cash summary', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    expect(screen.getByText('Ingresos')).toBeInTheDocument()
    expect(screen.getByText('Egresos')).toBeInTheDocument()
    expect(await screen.findByText('$1.000,00')).toBeInTheDocument()
    expect(screen.getByText('$300,00')).toBeInTheDocument()
  })

  it('lists today\'s movements most-recent-first with label, payment method, time and signed amount', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)

    expect(screen.getByText('Compra insumos')).toBeInTheDocument()
    expect(screen.getByText('Venta mostrador')).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`efectivo · ${expectedLocalTime('2026-07-03T11:00:00')}`, 'i'))
    ).toBeInTheDocument()
    expect(screen.getByText('-$300,00')).toBeInTheDocument()
    expect(screen.getByText('+$1.000,00')).toBeInTheDocument()
  })

  it('opens the "Registrar movimiento" sheet from the Movimiento button', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /^movimiento$/i }))
    expect(await screen.findByRole('dialog', { name: /registrar movimiento/i })).toBeInTheDocument()
  })

  it('CRITICAL: submits payment_method in the real addMovement payload even though the mockup does not show that field', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /^movimiento$/i }))
    await screen.findByRole('dialog', { name: /registrar movimiento/i })

    await userEvent.type(screen.getByLabelText(/monto/i), '250')
    await userEvent.type(screen.getByLabelText(/concepto/i), 'Compra de cinta')
    await userEvent.selectOptions(screen.getByLabelText(/m[eé]todo de pago/i), 'TRANSFER')
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(addMovementMock).toHaveBeenCalledWith('cr1', {
        type: 'INCOME',
        payment_method: 'TRANSFER',
        amount: 250,
        description: 'Compra de cinta',
      })
    })
  })

  it('toggles to Egreso before submitting and sends type EXPENSE', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /^movimiento$/i }))
    await screen.findByRole('dialog', { name: /registrar movimiento/i })

    await userEvent.click(screen.getByRole('button', { name: 'Egreso' }))
    await userEvent.type(screen.getByLabelText(/monto/i), '150')
    await userEvent.type(screen.getByLabelText(/concepto/i), 'Flete')
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(addMovementMock).toHaveBeenCalledWith(
        'cr1',
        expect.objectContaining({ type: 'EXPENSE', description: 'Flete' })
      )
    })
  })

  it('opens the "Cerrar caja" confirmation sheet from the Cerrar caja button', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }))
    expect(await screen.findByRole('dialog', { name: /cerrar caja/i })).toBeInTheDocument()
  })

  it('disables the confirm button until a counted cash amount is entered (mirrors desktop\'s countedCash !== \'\' guard — CloseCashRequest.counted_cash is a required number on the frontend)', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }))
    await screen.findByRole('dialog', { name: /cerrar caja/i })

    expect(screen.getByRole('button', { name: /confirmar cierre/i })).toBeDisabled()
    expect(closeCashMock).not.toHaveBeenCalled()
  })

  it('closes the register with no difference_reason when the counted cash matches the expected cash', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }))
    await screen.findByRole('dialog', { name: /cerrar caja/i })

    await userEvent.type(screen.getByLabelText(/efectivo contado/i), '5700')
    expect(screen.getByRole('button', { name: /confirmar cierre/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }))

    await waitFor(() => {
      expect(closeCashMock).toHaveBeenCalledWith({ counted_cash: 5700, difference_reason: undefined })
    })
  })

  it('requires a difference reason before confirming when the counted cash differs from the expected cash', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }))
    await screen.findByRole('dialog', { name: /cerrar caja/i })

    await userEvent.type(screen.getByLabelText(/efectivo contado/i), '5600')
    expect(screen.getByRole('button', { name: /confirmar cierre/i })).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/motivo de la diferencia/i), 'Faltante de caja chica')
    expect(screen.getByRole('button', { name: /confirmar cierre/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }))

    await waitFor(() => {
      expect(closeCashMock).toHaveBeenCalledWith({ counted_cash: 5600, difference_reason: 'Faltante de caja chica' })
    })
  })

  it('BUG 1: shows the backend error message when adding a movement fails (e.g. 409 on an expired register) instead of failing silently', async () => {
    addMovementMock.mockRejectedValueOnce({
      response: { status: 409, data: { detail: 'La caja está vencida, no se pueden registrar movimientos' } },
    })
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /^movimiento$/i }))
    await screen.findByRole('dialog', { name: /registrar movimiento/i })

    await userEvent.type(screen.getByLabelText(/monto/i), '250')
    await userEvent.type(screen.getByLabelText(/concepto/i), 'Compra de cinta')
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/la caja está vencida/i)
  })

  it('BUG 1: shows the backend error message when closing the register fails (e.g. 422 for a negative counted_cash) instead of failing silently', async () => {
    closeCashMock.mockRejectedValueOnce({
      response: { status: 422, data: { detail: 'counted_cash: El monto no puede ser negativo' } },
    })
    renderCaja()
    await screen.findByText(/caja abierta/i)
    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }))
    await screen.findByRole('dialog', { name: /cerrar caja/i })

    await userEvent.type(screen.getByLabelText(/efectivo contado/i), '5700')
    await userEvent.click(screen.getByRole('button', { name: /confirmar cierre/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/el monto no puede ser negativo/i)
  })
})

describe('MobileCaja — expired register (BUG 2: is_expired must be checked)', () => {
  beforeEach(() => {
    getCurrentCashMock.mockResolvedValue(
      makeRegister({
        id: 'cr1',
        is_expired: true,
        movements: [],
      })
    )
    getCashSummaryMock.mockResolvedValue(makeSummary({ expected_cash: 5000 }))
  })

  it('shows an expired-register warning instead of the normal "caja abierta" state', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)
    expect(screen.getByText(/vencida/i)).toBeInTheDocument()
  })

  it('blocks attempting a movement on an expired register (no dialog opens, no silent 409 attempt)', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)

    const movementButton = screen.getByRole('button', { name: /^movimiento$/i })
    expect(movementButton).toBeDisabled()

    await userEvent.click(movementButton, { skipPointerEventsCheck: true })
    expect(screen.queryByRole('dialog', { name: /registrar movimiento/i })).not.toBeInTheDocument()
  })

  it('still allows closing an expired register', async () => {
    renderCaja()
    await screen.findByText(/caja abierta/i)

    await userEvent.click(screen.getByRole('button', { name: /cerrar caja/i }))
    expect(await screen.findByRole('dialog', { name: /cerrar caja/i })).toBeInTheDocument()
  })
})
