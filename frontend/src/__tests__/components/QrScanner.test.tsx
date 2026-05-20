import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// html5-qrcode manipulates real DOM — mock it for unit tests
vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    resume: vi.fn(),
  })),
}))

vi.mock('../../api/productsService', () => ({
  default: {
    getById: vi.fn(),
  },
}))

import QrScanner from '../../components/sales/QrScanner'
import productsService from '../../api/productsService'

const mockProductsService = productsService as { getById: ReturnType<typeof vi.fn> }

const onAddProduct = vi.fn()
const onClose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QrScanner', () => {
  it('renders header and close button', () => {
    render(<QrScanner onAddProduct={onAddProduct} onClose={onClose} />)
    expect(screen.getByText('Escanear producto')).toBeInTheDocument()
    expect(screen.getByLabelText('Cerrar escáner')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    render(<QrScanner onAddProduct={onAddProduct} onClose={onClose} />)
    await userEvent.click(screen.getByLabelText('Cerrar escáner'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows camera hint text when idle', () => {
    render(<QrScanner onAddProduct={onAddProduct} onClose={onClose} />)
    expect(screen.getByText('Apuntá la cámara al QR del producto')).toBeInTheDocument()
  })
})
