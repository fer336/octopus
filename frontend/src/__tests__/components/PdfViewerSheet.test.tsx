import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PdfViewerSheet from '../../components/layout/PdfViewerSheet'

describe('PdfViewerSheet — in-app PDF viewer (replaces the new-tab window.open flow)', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<PdfViewerSheet open={false} onClose={vi.fn()} pdfUrl="blob:mock-url" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when pdfUrl is null, even if open is true', () => {
    const { container } = render(<PdfViewerSheet open={true} onClose={vi.fn()} pdfUrl={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an iframe with the given pdfUrl as its src when open with a pdfUrl', () => {
    render(<PdfViewerSheet open={true} onClose={vi.fn()} pdfUrl="blob:mock-url" />)
    const iframe = screen.getByTitle('Visor de PDF') as HTMLIFrameElement
    expect(iframe).toBeInTheDocument()
    expect(iframe.src).toContain('blob:mock-url')
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(<PdfViewerSheet open={true} onClose={onClose} pdfUrl="blob:mock-url" />)
    await userEvent.click(screen.getByLabelText('Cerrar visor de PDF'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the default title "Comprobante" when no title prop is given', () => {
    render(<PdfViewerSheet open={true} onClose={vi.fn()} pdfUrl="blob:mock-url" />)
    expect(screen.getByText('Comprobante')).toBeInTheDocument()
  })

  it('shows a custom title when provided', () => {
    render(
      <PdfViewerSheet open={true} onClose={vi.fn()} pdfUrl="blob:mock-url" title="Comprobante 0001-00000042" />
    )
    expect(screen.getByText('Comprobante 0001-00000042')).toBeInTheDocument()
  })
})
