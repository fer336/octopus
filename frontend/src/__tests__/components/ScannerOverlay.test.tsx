import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Thin-wrapper test: ScannerOverlay's own responsibility is open/close
// gating + prop forwarding, not QrScanner's camera logic (already covered
// by QrScanner.test.tsx). Stub the wrapped component the same way other
// "thin wrapper" components are tested in this codebase.
vi.mock('../../components/sales/QrScanner', () => ({
  default: ({ onAddProduct, onClose }: { onAddProduct: (p: unknown, qty: number) => void; onClose: () => void }) => (
    <div>
      <p>Escáner (stub)</p>
      <button onClick={onClose}>Cerrar escáner</button>
      <button onClick={() => onAddProduct({ id: 'p9', code: '7791234567890', description: 'Producto escaneado' }, 1)}>
        Simular escaneo exitoso
      </button>
    </div>
  ),
}))

import ScannerOverlay from '../../components/layout/ScannerOverlay'

describe('ScannerOverlay', () => {
  it('renders nothing when closed', () => {
    render(<ScannerOverlay open={false} onClose={vi.fn()} onAddProduct={vi.fn()} />)
    expect(screen.queryByText('Escáner (stub)')).not.toBeInTheDocument()
  })

  it('renders the wrapped scanner when open', () => {
    render(<ScannerOverlay open onClose={vi.fn()} onAddProduct={vi.fn()} />)
    expect(screen.getByText('Escáner (stub)')).toBeInTheDocument()
  })

  it('forwards onClose from the wrapped scanner (cancel)', async () => {
    const onClose = vi.fn()
    render(<ScannerOverlay open onClose={onClose} onAddProduct={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar escáner' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('forwards onAddProduct from the wrapped scanner (successful scan)', async () => {
    const onAddProduct = vi.fn()
    render(<ScannerOverlay open onClose={vi.fn()} onAddProduct={onAddProduct} />)
    await userEvent.click(screen.getByRole('button', { name: 'Simular escaneo exitoso' }))
    expect(onAddProduct).toHaveBeenCalledWith({ id: 'p9', code: '7791234567890', description: 'Producto escaneado' }, 1)
  })
})
