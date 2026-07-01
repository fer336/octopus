import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import type { User } from '../../stores/authStore'

const mockUser: { current: User | null } = {
  current: {
    id: 'u1',
    email: 'owner@test.com',
    name: 'Fernando',
    platform_role: 'user',
    membership_role: 'owner',
    module_permissions: {},
  },
}

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: User | null }) => unknown) =>
    selector({ user: mockUser.current }),
}))

import MobileShell, { type CartLine } from '../../components/layout/MobileShell'

function renderShell(initialCart: CartLine[] = []) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <MobileShell initialCart={initialCart} />
    </MemoryRouter>
  )
}

describe('MobileShell — tab bar', () => {
  it('renders all 5 tab bar slots', () => {
    renderShell()
    expect(screen.getByRole('button', { name: 'Inicio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Productos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vender' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Caja' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cuenta' })).toBeInTheDocument()
  })

  it('shows the cart badge with the line count on the Vender FAB when cart has items', () => {
    renderShell([
      { code: 'P1', desc: 'Producto 1', qty: 1, price: 100, product_id: 'p1' },
      { code: 'P2', desc: 'Producto 2', qty: 2, price: 200, product_id: 'p2' },
    ])
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2')
  })

  it('hides the cart badge when the cart is empty', () => {
    renderShell()
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument()
  })

  it('routes Caja to MobileStub (deferred, not blank/broken)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Caja' }))
    expect(
      screen.getByText(/ya funciona en la versión completa de OctopusTrack/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /caja/i })).toBeInTheDocument()
  })

  it('routes Cuenta to MobileStub (deferred, not blank/broken)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Cuenta' }))
    expect(
      screen.getByText(/ya funciona en la versión completa de OctopusTrack/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /cuenta/i })).toBeInTheDocument()
  })

  it('routes Inicio to its screen placeholder (MobileStub in PR1)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    await userEvent.click(screen.getByRole('button', { name: 'Inicio' }))
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
  })

  it('routes Productos to its screen placeholder (MobileStub in PR1)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Productos' }))
    expect(screen.getByRole('heading', { name: 'Productos' })).toBeInTheDocument()
  })

  it('routes Vender to its screen placeholder (MobileStub in PR1)', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Vender' }))
    expect(screen.getByRole('heading', { name: 'Vender' })).toBeInTheDocument()
  })
})

describe('MobileShell — header actions', () => {
  it('opens the AI sheet host when tapping the sparkles button (content stubbed until PR4)', async () => {
    renderShell()
    expect(screen.queryByTestId('ai-sheet-host')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Abrir asistente IA'))
    expect(screen.getByTestId('ai-sheet-host')).toBeInTheDocument()
  })

  it('opens the drawer when tapping the menu button', async () => {
    renderShell()
    expect(screen.queryByText('OctopusTrack')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Abrir menú'))
    expect(screen.getByText('OctopusTrack')).toBeInTheDocument()
  })
})
