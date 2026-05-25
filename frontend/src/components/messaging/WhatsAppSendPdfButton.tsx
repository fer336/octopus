import { useState } from 'react'
import WhatsAppSendModal from './WhatsAppSendModal'
import WhatsAppIcon from './WhatsAppIcon'

interface Props {
  getPdfBlob: () => Promise<Blob>
  filename?: string
  caption?: string
  mimetype?: string
  defaultClientId?: string
  size?: number
  className?: string
  fullButton?: boolean
}

export default function WhatsAppSendPdfButton({
  getPdfBlob,
  filename = 'documento.pdf',
  caption,
  mimetype,
  defaultClientId,
  size = 16,
  className = '',
  fullButton = false,
}: Props) {
  const [open, setOpen] = useState(false)

  function handleClick() {
    setOpen(true)
  }

  return (
    <>
      {fullButton ? (
        <button
          onClick={handleClick}
          title="Enviar por WhatsApp"
          className={`w-full min-w-0 inline-flex items-center justify-center gap-2 text-sm font-medium rounded-lg border border-green-400 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/30 px-4 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${className}`}
        >
          <WhatsAppIcon size={size} />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>
      ) : (
        <button
          onClick={handleClick}
          title="Enviar por WhatsApp"
          className={`p-2 text-[#25D366] hover:text-[#128C7E] hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors ${className}`}
        >
          <WhatsAppIcon size={size} />
        </button>
      )}

      <WhatsAppSendModal
        isOpen={open}
        onClose={() => setOpen(false)}
        getPdfBlob={getPdfBlob}
        filename={filename}
        caption={caption}
        mimetype={mimetype}
        defaultClientId={defaultClientId}
      />
    </>
  )
}
