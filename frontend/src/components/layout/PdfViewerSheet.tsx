/**
 * In-app PDF viewer — full-screen overlay rendering a just-generated
 * voucher/comprobante PDF inline via an <iframe>, replacing the previous
 * new-tab (`window.open` + pre-opened-window) flow used by MobileSales.
 * Mirrors desktop `Sales.tsx`'s PDF `<Modal>` (~lines 6712-6799: an
 * `<iframe src={pdfUrl} className="w-full h-[65vh]" title="Visor de PDF" />`
 * plus action buttons) — this is the mobile-native V1 minimum: the iframe
 * viewer, a close button, and a "Descargar" link. Desktop's "Imprimir" (no
 * direct mobile equivalent) and the SRX original/duplicado copy switcher
 * (desktop-only edge case) are intentionally NOT ported here.
 *
 * Props are kept deliberately minimal (`open`/`onClose`/`pdfUrl`/`title`) so
 * a follow-up task can reuse this exact component in `MobileComprobantes.tsx`
 * and wire a WhatsApp button in alongside it, without this component needing
 * to know about that concern.
 */
import { Download, X } from 'lucide-react'

interface PdfViewerSheetProps {
  open: boolean
  onClose: () => void
  pdfUrl: string | null
  title?: string
}

export default function PdfViewerSheet({ open, onClose, pdfUrl, title }: PdfViewerSheetProps) {
  if (!open || !pdfUrl) return null

  return (
    <div role="dialog" aria-label={title ?? 'Comprobante'} className="fixed inset-0 z-[400] flex flex-col bg-white">
      <div className="flex items-center gap-[10px] px-[18px] pb-3 pt-4" style={{ background: '#f7f4fb' }}>
        <p className="flex-1 truncate text-base font-extrabold text-[#121325]">{title ?? 'Comprobante'}</p>
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

      <iframe src={pdfUrl} className="w-full flex-1" title="Visor de PDF" />
    </div>
  )
}
