import { useState } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import toast from 'react-hot-toast'
import WhatsAppSendModal from './WhatsAppSendModal'
import WhatsAppIcon from './WhatsAppIcon'
import { listSessions } from '../../api/whatsapp/service'
import { getProviderConfig } from '../../api/whatsapp/provider'

interface Props {
  getPdfBlob: () => Promise<Blob>
  filename?: string
  caption?: string
  defaultClientId?: string
  size?: number
  className?: string
  fullButton?: boolean
}

function launchWhatsAppSetupTour() {
  const steps = [
    {
      element: '[data-tour-nav-messaging="true"]',
      popover: {
        title: 'Conectá tu WhatsApp primero',
        description:
          'Ingresá a la sección <strong>WhatsApp CRM</strong> desde el menú lateral para emparejar tu dispositivo antes de enviar comprobantes.',
        side: 'right' as const,
        align: 'center' as const,
      },
    },
  ]

  const fallbackElement = '[data-tour-nav="/messaging"]'
  const target = document.querySelector('[data-tour-nav-messaging="true"]') ?? document.querySelector(fallbackElement)

  if (!target) {
    toast('Andá a WhatsApp CRM en el menú lateral para conectar tu dispositivo', { icon: '📱', duration: 5000 })
    return
  }

  const tour = driver({
    showProgress: false,
    animate: true,
    allowClose: true,
    overlayClickBehavior: 'close',
    nextBtnText: 'Entendido',
    doneBtnText: 'Entendido',
    steps: steps as never,
  })

  tour.drive()
}

export default function WhatsAppSendPdfButton({
  getPdfBlob,
  filename = 'documento.pdf',
  caption,
  defaultClientId,
  size = 16,
  className = '',
  fullButton = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)

  async function handleClick() {
    if (checking) return
    setChecking(true)
    try {
      const sessionId = getProviderConfig().defaultSessionId.trim() || 'octopustrack'
      const sessions = await listSessions()
      const active = sessions.find((s) => s.id === sessionId && s.status === 'ready')
      if (active) {
        setOpen(true)
      } else {
        toast.error('WhatsApp no está conectado. Emparejá tu dispositivo primero.', { duration: 4000 })
        launchWhatsAppSetupTour()
      }
    } catch {
      toast.error('No se pudo verificar el estado de WhatsApp.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      {fullButton ? (
        <button
          onClick={handleClick}
          disabled={checking}
          title="Enviar por WhatsApp"
          className={`w-full min-w-0 inline-flex items-center justify-center gap-2 text-sm font-medium rounded-lg border border-green-400 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/30 px-4 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 ${className}`}
        >
          <WhatsAppIcon size={size} />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>
      ) : (
        <button
          onClick={handleClick}
          disabled={checking}
          title="Enviar por WhatsApp"
          className={`p-2 text-[#25D366] hover:text-[#128C7E] hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50 ${className}`}
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
        defaultClientId={defaultClientId}
      />
    </>
  )
}
