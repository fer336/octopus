import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import type { CashMovement, CashRegister } from '../../types/cash'

const { openCashMock, closeCashMock, addMovementMock } = vi.hoisted(() => ({
  openCashMock: vi.fn(),
  closeCashMock: vi.fn(),
  addMovementMock: vi.fn(),
}))

vi.mock('../../api/cashService', () => ({
  openCash: openCashMock,
  closeCash: closeCashMock,
  addMovement: addMovementMock,
}))

import { useAddMovement, useCloseCash, useOpenCash } from '../../hooks/useCash'

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

beforeEach(() => {
  vi.clearAllMocks()
  openCashMock.mockResolvedValue(makeRegister())
  closeCashMock.mockResolvedValue(makeRegister({ status: 'CLOSED' }))
  addMovementMock.mockResolvedValue(makeMovement())
})

describe('useCash — cash-summary invalidation (balance must resync after a mutation)', () => {
  it('useAddMovement invalidates cash-summary (not just cash-current) on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useAddMovement('cr1'), { wrapper })
    result.current.mutate({ type: 'INCOME', payment_method: 'CASH', amount: 100, description: 'x' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey)
    expect(invalidatedKeys).toContainEqual(['cash-current'])
    expect(invalidatedKeys.some((key) => Array.isArray(key) && key[0] === 'cash-summary')).toBe(true)
  })

  it('useOpenCash invalidates cash-summary (not just cash-current) on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useOpenCash(), { wrapper })
    result.current.mutate({ opening_amount: 5000 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey)
    expect(invalidatedKeys).toContainEqual(['cash-current'])
    expect(invalidatedKeys.some((key) => Array.isArray(key) && key[0] === 'cash-summary')).toBe(true)
  })

  it('useCloseCash invalidates cash-summary (not just cash-current) on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useCloseCash(), { wrapper })
    result.current.mutate({ counted_cash: 5000 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey)
    expect(invalidatedKeys).toContainEqual(['cash-current'])
    expect(invalidatedKeys.some((key) => Array.isArray(key) && key[0] === 'cash-summary')).toBe(true)
  })
})
