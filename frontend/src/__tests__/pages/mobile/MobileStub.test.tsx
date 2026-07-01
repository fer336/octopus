import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import MobileStub from '../../../pages/mobile/MobileStub'

function Home() {
  return <div>Mobile Dashboard Screen</div>
}

function renderStub(stubTitle = 'Comprobantes') {
  return render(
    <MemoryRouter initialEntries={['/comprobantes']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/comprobantes" element={<MobileStub stubTitle={stubTitle} />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('MobileStub', () => {
  it('renders the stubTitle prop', () => {
    renderStub('Comprobantes')
    expect(screen.getByText('Comprobantes')).toBeInTheDocument()
  })

  it('renders fixed body copy explaining the module is being adapted', () => {
    renderStub()
    expect(
      screen.getByText(/ya funciona en la versión completa de OctopusTrack/i)
    ).toBeInTheDocument()
  })

  it('navigates home when tapping "Volver al inicio"', async () => {
    renderStub()
    await userEvent.click(screen.getByRole('button', { name: /volver al inicio/i }))
    expect(screen.getByText('Mobile Dashboard Screen')).toBeInTheDocument()
  })
})
