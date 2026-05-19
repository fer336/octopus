import { useEffect, useState } from 'react'
import { Smartphone, Wifi, WifiOff, LogOut, RefreshCw, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { createSession, startSession, stopSession, deleteSession, listSessions } from '../../api/whatsapp/service'
import { useMessagingStore } from '../../stores/messagingStore'
import QRCode from './QRCode'
import type { WhatsAppSession } from '../../types/whatsapp'
import { getProviderConfig } from '../../api/whatsapp/provider'

interface Props {
  onSessionReady: () => void
}

export default function SessionPanel({ onSessionReady }: Props) {
  const { sessions, setSessions, upsertSession, setActiveSessionId } = useMessagingStore()

  const [loading, setLoading] = useState(true)
  const [reconnecting, setReconnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)

  const configuredSessionId = getProviderConfig().defaultSessionId.trim()
  const sessionId = configuredSessionId || 'octopustrack'
  const mySession: WhatsAppSession | undefined = sessions.find((s) => s.id === sessionId)

  useEffect(() => {
    if (!sessionId) return

    async function bootstrap() {
      setLoading(true)
      try {
        const all = await listSessions()
        setSessions(all)
        const existing = all.find((s) => s.id === sessionId)

        if (existing?.status === 'ready') {
          setActiveSessionId(existing.id)
          onSessionReady()
          return
        }

        if (existing && (existing.status === 'qr_ready' || existing.status === 'initializing' || existing.status === 'authenticating')) {
          setActiveSessionId(existing.id)
          setPendingSessionId(existing.id)
          return
        }

        // Create or restart
        let session: WhatsAppSession
        if (existing) {
          try {
            session = await startSession(existing.id)
          } catch {
            // Evolution puede perder la instancia en el servidor; se recrea para obtener QR nuevo.
            await deleteSession(existing.id).catch(() => null)
            session = await createSession(sessionId)
            session = await startSession(session.id)
          }
        } else {
          session = await createSession(sessionId)
          session = await startSession(session.id)
        }
        upsertSession(session)
        setActiveSessionId(session.id)
        setPendingSessionId(session.id)
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401 || status === 403) {
          toast.error('API key inválida. Revisá la configuración en Ajustes.')
        } else {
          toast.error('No se pudo conectar con el servidor de WhatsApp.')
        }
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [sessionId])

  async function handleDisconnect() {
    if (!mySession) return
    setDisconnecting(true)
    try {
      await stopSession(mySession.id)
      upsertSession({ ...mySession, status: 'disconnected' })
      setActiveSessionId(null)
      toast.success('Sesión desconectada')
    } catch {
      toast.error('Error al desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleReconnect() {
    if (!sessionId) return
    setReconnecting(true)
    try {
      let session: WhatsAppSession
      if (mySession) {
        try {
          session = await startSession(mySession.id)
        } catch {
          // Evolution puede perder la instancia en el servidor; se recrea para obtener QR nuevo.
          await deleteSession(mySession.id).catch(() => null)
          session = await createSession(sessionId)
          session = await startSession(session.id)
        }
      } else {
        // Session not in store (bootstrap failed) — create from scratch
        session = await createSession(sessionId)
        session = await startSession(session.id)
      }
      upsertSession(session)
      setActiveSessionId(session.id)
      setPendingSessionId(session.id)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) {
        toast.error('API key inválida. Revisá la configuración en Ajustes.')
      } else {
        toast.error('No se pudo conectar. Verificá que el servidor esté activo.')
      }
    } finally {
      setReconnecting(false)
    }
  }

  function handleQRConnected() {
    setPendingSessionId(null)
    onSessionReady()
    toast.success('WhatsApp conectado')
  }

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        <p className="text-sm">Iniciando sesión...</p>
      </div>
    )
  }

  if (pendingSessionId) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Escaneá el QR con tu teléfono
          </span>
        </div>
        <QRCode sessionId={pendingSessionId} onConnected={handleQRConnected} />
        <p className="text-xs text-gray-400 text-center mt-3">
          Sesión configurada: <span className="font-medium">{sessionId}</span>
        </p>
      </div>
    )
  }

  if (mySession?.status === 'ready') {
    return (
      <div className="p-6 flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">WhatsApp conectado</p>
          {mySession.phone && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{mySession.phone}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sessionId}</p>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:text-white hover:bg-red-500 border border-red-300 hover:border-red-500 rounded-lg transition-colors disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          {disconnecting ? 'Desconectando...' : 'Desconectar'}
        </button>
      </div>
    )
  }

  // Disconnected / failed
  return (
    <div className="p-6 flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
        <WifiOff className="w-8 h-8 text-gray-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Sesión desconectada</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sessionId}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleReconnect}
          disabled={reconnecting}
          className="flex items-center gap-2 px-4 py-2 text-sm text-primary-600 hover:text-white hover:bg-primary-600 border border-primary-300 hover:border-primary-600 rounded-lg transition-colors disabled:opacity-50"
        >
          <Wifi className="w-4 h-4" />
          {reconnecting ? 'Conectando...' : 'Conectar WhatsApp'}
        </button>
        <button
          onClick={handleReconnect}
          disabled={reconnecting}
          className="p-2 text-gray-400 hover:text-primary-500 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors disabled:opacity-50"
          title="Reintentar"
        >
          <RefreshCw className={`w-4 h-4 ${reconnecting ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  )
}
