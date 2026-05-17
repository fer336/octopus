import { useEffect } from 'react'
import { X, Printer } from 'lucide-react'
import type { Product } from '../../types'
import ProductQrLabel from './ProductQrLabel'

interface Props {
  products: Product[]
  onClose: () => void
}

const LABELS_PER_PAGE = 18
const COLS = 3
const ROWS = 6

const PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
@media print {
  body * { visibility: hidden !important; }
  #qr-print-root,
  #qr-print-root * { visibility: visible !important; }
  #qr-print-root .no-print { display: none !important; }
  #qr-print-root {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: auto !important;
    overflow: visible !important;
    background: white !important;
    padding: 0 !important;
  }
  .qr-print-scroll {
    overflow: visible !important;
    height: auto !important;
    padding: 0 !important;
    background: white !important;
  }
  .qr-page-sheet {
    page-break-after: always;
    box-shadow: none !important;
    border: none !important;
    margin: 0 auto !important;
  }
  .qr-page-sheet:last-child { page-break-after: auto; }
}
`

export default function QrPrintPreview({ products, onClose }: Props) {
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'qr-print-css'
    style.textContent = PRINT_CSS
    document.head.appendChild(style)
    return () => document.getElementById('qr-print-css')?.remove()
  }, [])

  const pageCount = Math.ceil(products.length / LABELS_PER_PAGE)
  const pages = Array.from({ length: pageCount }, (_, i) =>
    products.slice(i * LABELS_PER_PAGE, (i + 1) * LABELS_PER_PAGE),
  )

  return (
    <div
      id="qr-print-root"
      className="fixed inset-0 z-50 flex flex-col bg-gray-100 dark:bg-gray-900"
    >
      {/* Toolbar */}
      <div className="no-print flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Vista previa de impresión — {products.length} etiqueta(s)
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {pageCount} página(s) · {COLS} col × {ROWS} filas por hoja
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 active:scale-95"
          >
            <Printer size={15} />
            Imprimir
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Scrollable page previews */}
      <div className="qr-print-scroll flex-1 overflow-auto p-6">
        {pages.map((pageProducts, pageIndex) => (
          <div
            key={pageIndex}
            className="qr-page-sheet mx-auto mb-6 rounded-sm bg-white shadow-md"
            style={{
              width: '210mm',
              minHeight: '297mm',
              padding: '5mm',
              boxSizing: 'border-box',
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, 1fr)`,
              gridAutoRows: '44mm',
              gap: 0,
            }}
          >
            {pageProducts.map((product) => (
              <div key={product.id} style={{ height: '44mm' }}>
                <ProductQrLabel product={product} />
              </div>
            ))}
            {/* Fill empty cells to keep dashed grid consistent */}
            {Array.from({ length: LABELS_PER_PAGE - pageProducts.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{ height: '44mm', border: '1px dashed #e5e7eb' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
