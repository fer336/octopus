import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Wifi } from 'lucide-react'
import QRCodeLib from 'qrcode'
import { getQRCode, getConnectionState } from '../../api/whatsapp/service'
import type { SessionStatus } from '../../types/whatsapp'

interface Props {
  sessionId: string
  onConnected: () => void
}

const POLL_INTERVAL_MS = 3000

export default function QRCode({ sessionId, onConnected }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<SessionStatus>('initializing')
  const [error, setError] = useState<string | null>(null)

  const poll = useCallback(async () => {
    try {
      // GET /instance/connectionState/{instance} — read-only, sin side effects
      const session = await getConnectionState(sessionId)
      setStatus(session.status)

      if (session.status === 'ready') {
        onConnected()
        return
      }

      if (session.status === 'qr_ready' && !qrDataUrl) {
        // GET /instance/connect/{instance} — devuelve el code para generar QR
        const qr = await getQRCode(sessionId)
        if (qr.qrCode) {
          // Generar QR image desde el code string
          const url = await QRCodeLib.toDataURL(qr.qrCode, {
            width: 300,
            margin: 2,
            color: { dark: '#1f2937', light: '#ffffff' },
          })
          setQrDataUrl(url)
        }
        setError(null)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching QR'
      setError(msg)
    }
  }, [sessionId, onConnected, qrDataUrl])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [poll])

  const statusLabels: Record<SessionStatus, string> = {
    created: 'Creando sesión...',
    initializing: 'Iniciando...',
    qr_ready: 'Escaneá el código QR con WhatsApp',
    authenticating: 'Autenticando...',
    ready: 'Conectado',
    disconnected: 'Desconectado',
    failed: 'Error de conexión',
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>{statusLabels[status]}</span>
      </div>

      {qrDataUrl && status === 'qr_ready' ? (
        <div className="bg-white p-4 rounded-xl shadow-md">
          <img src={qrDataUrl} alt="WhatsApp QR Code" className="w-56 h-56" />
        </div>
      ) : status === 'authenticating' ? (
        <div className="flex flex-col items-center gap-2 text-primary-600">
          <Wifi className="w-12 h-12 animate-pulse" />
          <span className="text-sm font-medium">Verificando...</span>
        </div>
      ) : !qrDataUrl && !error ? (
        <div className="w-56 h-56 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      ) : null}

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <p className="text-xs text-gray-400 text-center max-w-xs">
        Abrí WhatsApp en tu celular → Menú → Dispositivos vinculados → Vincular un dispositivo
      </p>
    </div>
  )
}
