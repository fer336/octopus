import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ThemeProvider } from '../../context/ThemeContext'
import type { User } from '../../stores/authStore'
import type { Business } from '../../api/businessService'

const { mockUser, mockBusiness } = vi.hoisted(() => ({
  mockUser: {
    id: 'u1',
    email: 'owner@test.com',
    name: 'Fernando',
    platform_role: 'user',
    membership_role: 'owner',
    module_permissions: {},
  },
  mockBusiness: {
    id: 'b1',
    name: 'Ferretería Test',
    cuit: '20111111111',
    tax_condition: 'RI',
    sale_point: '1',
    ai_agent_enabled: false,
    whatsapp_enabled: true,
    qr_scanner_enabled: true,
    current_account_mode: 'automatic',
    invoicing_enabled: true,
    receipts_enabled: true,
    quotation_enabled: true,
    inventory_enabled: true,
    stockpile_enabled: true,
    price_update_enabled: true,
    wholesale_lists_enabled: true,
    reports_enabled: true,
    profitability_enabled: true,
    sql_backup_enabled: false,
    invoice_zero_stock_enabled: false,
  },
}))

// jsdom doesn't implement matchMedia — ThemeContext reads it on mount.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Node 22's experimental global localStorage shadows jsdom's Storage
  // implementation with `undefined` in this environment — stub a minimal one.
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  })
})

vi.mock('../../stores/authStore', () => {
  const state = {
    user: mockUser as unknown as User,
    accessToken: null,
    logout: vi.fn(),
  }
  const useAuthStoreMock = (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state
  useAuthStoreMock.getState = () => ({
    accessToken: null,
    setUser: vi.fn(),
    setLoading: vi.fn(),
    logout: vi.fn(),
  })
  return { useAuthStore: useAuthStoreMock }
})

vi.mock('../../stores/aiStore', () => ({
  useAIStore: (selector: (s: { isOpen: boolean; toggle: () => void; close: () => void }) => unknown) =>
    selector({ isOpen: false, toggle: vi.fn(), close: vi.fn() }),
}))

vi.mock('../../hooks/useProductTour', () => ({
  useProductTour: () => ({ hasTourForCurrentPage: false, launchCurrentTour: vi.fn() }),
}))

vi.mock('../../api/businessService', () => ({
  default: {
    getMyBusiness: vi.fn().mockResolvedValue(mockBusiness as unknown as Business),
  },
}))

import MainLayout from '../../components/layout/MainLayout'

function renderMainLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<div>Desktop Dashboard Page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

describe('MainLayout — mobile mount point swap', () => {
  it('renders MobileShell (menu button) instead of the removed MobileNav for mobile viewport', () => {
    renderMainLayout()
    expect(screen.getByLabelText('Abrir menú')).toBeInTheDocument()
  })

  it('does not render MobileNav’s old "más" tab or full-item bottom sheet trigger', () => {
    renderMainLayout()
    expect(screen.queryByLabelText('Abrir menú completo')).not.toBeInTheDocument()
    expect(screen.queryByText('Más')).not.toBeInTheDocument()
  })
})
