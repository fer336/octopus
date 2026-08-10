/**
 * In-app PDF viewer — full-screen overlay rendering a just-generated
 * voucher/comprobante PDF inline via an <iframe>, replacing the previous
 * new-tab (`window.open` + pre-opened-window) flow used by MobileSales.
 * Mirrors desktop `Sales.tsx`'s PDF `<Modal>` (~lines 6712-6799: an
 * `<iframe src={pdfUrl} className="w-full h-[65vh]" title="Visor de PDF" />`
 * plus action buttons) — this is the mobile-native V1 minimum: the iframe
 * viewer, a close button, and explicit "Abrir PDF"/"Descargar" actions. The
 * iframe is best-effort because some mobile browsers/WebViews do not render
 * blob URLs inside iframes reliably.
 *
 * Props stay deliberately narrow: callers provide the object URL used by the
 * iframe/download link, and optionally the original Blob so "Abrir PDF" can
 * create a fresh user-initiated URL.
 */
import { Download, ExternalLink, X } from 'lucide-react'

interface PdfViewerSheetProps {
  open: boolean
  onClose: () => void
  pdfUrl: string | null
  pdfBlob?: Blob | null
  title?: string
}

export default function PdfViewerSheet({ open, onClose, pdfUrl, pdfBlob, title }: PdfViewerSheetProps) {
  if (!open || !pdfUrl) return null

  const openPdf = () => {
    const openUrl = pdfBlob ? URL.createObjectURL(pdfBlob) : pdfUrl
    const opened = window.open(openUrl, '_blank', 'noopener,noreferrer')

    if (!opened) {
      const link = document.createElement('a')
      link.href = openUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    if (pdfBlob) {
      setTimeout(() => URL.revokeObjectURL(openUrl), 60_000)
    }
  }

  return (
    <div role="dialog" aria-label={title ?? 'Comprobante'} className="fixed inset-0 z-[400] flex flex-col bg-white">
      <div className="flex items-center gap-[10px] px-[18px] pb-3 pt-4" style={{ background: '#f7f4fb' }}>
        <p className="flex-1 truncate text-base font-extrabold text-[#121325]">{title ?? 'Comprobante'}</p>
        <button
          type="button"
          onClick={openPdf}
          className="flex h-8 items-center gap-[5px] rounded-[9px] px-[10px] text-[11px] font-bold text-[#7c5ca8]"
          style={{ background: '#ece6f6' }}
        >
          <ExternalLink size={14} />
          Abrir PDF
        </button>
        <a
          href={pdfUrl}
          download
          className="flex h-8 items-center gap-[5px] rounded-[9px] px-[10px] text-[11px] font-bold text-[#7c5ca8]"
          style={{ background: '#ece6f6' }}
        >
          <Download size={14} />
          Descargar
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar visor de PDF"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px]"
          style={{ background: '#ece6f6' }}
        >
          <X size={16} color="#5b5570" />
        </button>
      </div>

      <div className="border-b border-[#ece6f6] px-[18px] py-2 text-[11px] leading-relaxed text-[#5b5570]">
        Si el visor no carga en tu celular, tocá <strong>Abrir PDF</strong> para verlo en otra pestaña o app.
      </div>

      <iframe src={pdfUrl} className="w-full flex-1" title="Visor de PDF" />
    </div>
  )
}
