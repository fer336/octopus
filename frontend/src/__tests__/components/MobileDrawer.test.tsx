import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import type { User } from '../../stores/authStore'

const mockUser: { current: User | null } = { current: null }

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: User | null }) => unknown) =>
    selector({ user: mockUser.current }),
}))

import MobileDrawer from '../../components/layout/MobileDrawer'
import { navigationItems } from '../../components/layout/navigationItems'

const OWNER: User = {
  id: 'u1',
  email: 'owner@test.com',
  name: 'Owner User',
  platform_role: 'user',
  membership_role: 'owner',
  module_permissions: {},
}

const SELLER: User = {
  id: 'u2',
  email: 'seller@test.com',
  name: 'Seller User',
  platform_role: 'user',
  membership_role: 'seller',
  module_permissions: {
    dashboard: true,
    sales: true,
    products: true,
    // rentabilidad intentionally omitted -> denied
  },
}

function renderDrawer(
  overrides: Partial<{
    open: boolean
    onClose: () => void
    onNavigate: (target: unknown) => void
    initialPath: string
    reportsEnabled: boolean
    currentAccountMode: 'disabled' | 'automatic' | 'manual'
  }> = {}
) {
  const onClose = overrides.onClose ?? vi.fn()
  const onNavigate = overrides.onNavigate ?? vi.fn()
  render(
    <MemoryRouter initialEntries={[overrides.initialPath ?? '/']}>
      <MobileDrawer
        open={overrides.open ?? true}
        onClose={onClose}
        onNavigate={onNavigate}
        reportsEnabled={overrides.reportsEnabled ?? true}
        currentAccountMode={overrides.currentAccountMode ?? 'automatic'}
      />
    </MemoryRouter>
  )
  return { onClose, onNavigate }
}

beforeEach(() => {
  mockUser.current = OWNER
})

describe('MobileDrawer — role/flag filtering', () => {
  it('renders the full 21-item/6-group navigationItems set for an owner with all flags enabled', () => {
    renderDrawer()
    navigationItems.forEach((item) => {
      expect(screen.getByText(item.label)).toBeInTheDocument()
    })
  })

  it('hides admin-only items for a seller role denied by hasPathAccess', () => {
    mockUser.current = SELLER
    renderDrawer()
    expect(screen.queryByText('Rentabilidad')).not.toBeInTheDocument()
  })

  it('hides an item when its feature flag is off regardless of role', () => {
    renderDrawer({ reportsEnabled: false })
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument()
  })
})

describe('MobileDrawer — navigation targets', () => {
  it('navigates to the real V1 screen for items with path "/"', async () => {
    const { onNavigate } = renderDrawer()
    await userEvent.click(screen.getByText('Dashboard'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'inicio' })
  })

  it('navigates to the real V1 screen for items with path "/products"', async () => {
    const { onNavigate } = renderDrawer()
    await userEvent.click(screen.getByText('Productos'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'productos' })
  })

  it('navigates to the real V1 screen for items with path "/sales"', async () => {
    const { onNavigate } = renderDrawer()
    await userEvent.click(screen.getByText('Ventas'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'ventas' })
  })

  it('navigates to the real V1 screen for items with path "/caja" (wired in PR5)', async () => {
    const { onNavigate } = renderDrawer()
    await userEvent.click(screen.getByText('Caja'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'caja' })
  })

  it('navigates to the real V1 screen for items with path "/current-account" (wired in PR6)', async () => {
    const { onNavigate } = renderDrawer({ currentAccountMode: 'automatic' })
    await userEvent.click(screen.getByText('Cuenta Corriente'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'cuenta' })
  })

  it('navigates to the real V1 screen for items with path "/comprobantes" (wired in PR7)', async () => {
    const { onNavigate } = renderDrawer()
    await userEvent.click(screen.getByText('Comprobantes'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'comprobantes' })
  })

  it('navigates to the real screens for items with path "/payment-methods", "/categories" and "/suppliers" (wired in PR8)', async () => {
    const { onNavigate } = renderDrawer()

    await userEvent.click(screen.getByText('Métodos de Pago'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'metodos-pago' })

    await userEvent.click(screen.getByText('Categorias'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'categorias' })

    await userEvent.click(screen.getByText('Proveedores'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'proveedores' })
  })

  it('navigates to MobileStub with stubTitle for any other visible item', async () => {
    const { onNavigate } = renderDrawer()
    await userEvent.click(screen.getByText('Marcas'))
    expect(onNavigate).toHaveBeenCalledWith({ screen: 'stub', stubTitle: 'Marcas' })
  })

  it('closes the drawer after navigating', async () => {
    const { onClose } = renderDrawer()
    await userEvent.click(screen.getByText('Dashboard'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('MobileDrawer — active item highlight', () => {
  it('marks the item matching the current route as active', () => {
    renderDrawer({ initialPath: '/products' })
    expect(screen.getByText('Productos').closest('button')).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByText('Dashboard').closest('button')).not.toHaveAttribute('aria-current')
  })
})

describe('MobileDrawer — open/close', () => {
  it('closes on backdrop click', async () => {
    const { onClose } = renderDrawer()
    await userEvent.click(screen.getByTestId('mobile-drawer-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on X button click', async () => {
    const { onClose } = renderDrawer()
    await userEvent.click(screen.getByLabelText('Cerrar menú'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing interactive when closed', () => {
    renderDrawer({ open: false })
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })
})
