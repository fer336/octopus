import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Wifi } from 'lucide-react'
import QRCodeLib from 'qrcode'
import { getQRCode, getConnectionState } from '../../api/whatsapp/service'
import type { SessionStatus } from '../../types/whatsapp'

interface Props {
  sessionId: string
  onConnected: () => void
}

export default function QRCode({ sessionId, onConnected }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<SessionStatus>('initializing')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const session = await getConnectionState(sessionId)
      setStatus(session.status)

      if (session.status === 'ready') {
        onConnected()
        return
      }

      if (session.status === 'qr_ready') {
        const qr = await getQRCode(sessionId)
        if (qr.qrCode) {
          const url = await QRCodeLib.toDataURL(qr.qrCode, {
            width: 300,
            margin: 2,
            color: { dark: '#1f2937', light: '#ffffff' },
          })
          setQrDataUrl(url)
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al obtener el QR')
    } finally {
      setLoading(false)
    }
  }, [sessionId, onConnected])

  // Single load on mount — no polling
  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      {qrDataUrl && status === 'qr_ready' ? (
        <div className="bg-white p-4 rounded-xl shadow-md">
          <img src={qrDataUrl} alt="WhatsApp QR Code" className="w-56 h-56" />
        </div>
      ) : status === 'authenticating' ? (
        <div className="flex flex-col items-center gap-2 text-primary-600">
          <Wifi className="w-12 h-12 animate-pulse" />
          <span className="text-sm font-medium">Verificando...</span>
        </div>
      ) : loading ? (
        <div className="w-56 h-56 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      ) : null}

      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
        {statusLabels[status]}
      </p>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <button
        onClick={refresh}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Actualizando...' : 'Actualizar QR'}
      </button>

      <p className="text-xs text-gray-400 text-center max-w-xs">
        Abrí WhatsApp en tu celular → Menú → Dispositivos vinculados → Vincular un dispositivo
      </p>
    </div>
  )
}
