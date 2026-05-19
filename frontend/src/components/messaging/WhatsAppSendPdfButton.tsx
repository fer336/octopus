import { useState } from 'react'
import WhatsAppSendModal from './WhatsAppSendModal'
import WhatsAppIcon from './WhatsAppIcon'

interface Props {
  getPdfBlob: () => Promise<Blob>
  filename?: string
  caption?: string
  defaultClientId?: string
  size?: number
  className?: string
}

export default function WhatsAppSendPdfButton({
  getPdfBlob,
  filename = 'documento.pdf',
  caption,
  defaultClientId,
  size = 16,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Enviar por WhatsApp"
        className={`p-2 text-[#25D366] hover:text-[#128C7E] hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors ${className}`}
      >
        <WhatsAppIcon size={size} />
      </button>

      <WhatsAppSendModal
        isOpen={open}
        onClose={() => setOpen(false)}
        getPdfBlob={getPdfBlob}
        filename={filename}
        caption={caption}
        defaultClientId={defaultClientId}
      />
    </>
  )
}
