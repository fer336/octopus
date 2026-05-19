import { useEffect, useState } from 'react'
import { Wifi, WifiOff, LogOut, RefreshCw, Smartphone } from 'lucide-react'
import { listSessions, startSession, stopSession, createSession, deleteSession } from '../../api/whatsapp/service'
import { getProviderConfig } from '../../api/whatsapp/provider'
import type { WhatsAppSession } from '../../types/whatsapp'
import QRCode from './QRCode'

export default function WhatsAppStatusCard() {
  const [session, setSession] = useState<WhatsAppSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionId = getProviderConfig().defaultSessionId.trim() || 'octopustrack'

  async function checkSession() {
    setLoading(true)
    setError(null)
    try {
      const all = await listSessions()
      const found = all.find((s) => s.id === sessionId) ?? null
      setSession(found)

      if (found && (found.status === 'qr_ready' || found.status === 'initializing' || found.status === 'authenticating')) {
        setPendingId(found.id)
      } else {
        setPendingId(null)
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) {
        setError('API Key incorrecta')
      } else {
        setError('No se pudo conectar')
      }
      setSession(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkSession()
  }, [])

  async function handleConnect() {
    setActionLoading(true)
    setError(null)
    try {
      let s: WhatsAppSession

      if (session) {
        try {
          s = await startSession(session.id)
        } catch {
          await deleteSession(session.id).catch(() => null)
          s = await createSession(sessionId)
          s = await startSession(s.id)
        }
      } else {
        s = await createSession(sessionId)
        s = await startSession(s.id)
      }

      setSession(s)
      setPendingId(s.id)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) {
        setError('API Key incorrecta. Revisá la configuración.')
      } else {
        setError('No se pudo conectar con Evolution')
      }
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDisconnect() {
    if (!session) return
    setActionLoading(true)
    try {
      await stopSession(session.id)
      setSession({ ...session, status: 'disconnected' })
      setPendingId(null)
    } catch {
      setError('Error al desconectar')
    } finally {
      setActionLoading(false)
    }
  }

  function handleQRConnected() {
    setPendingId(null)
    checkSession()
  }

  // ── QR pendiente ──
  if (pendingId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)] border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone size={16} className="text-primary-600" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Escaneá el QR desde tu teléfono
          </span>
        </div>
        <QRCode sessionId={pendingId} onConnected={handleQRConnected} />
        <p className="text-xs text-gray-400 text-center mt-2">{sessionId}</p>
      </div>
    )
  }

  // ── Estado conectado ──
  if (session?.status === 'ready') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)] border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
              <Wifi size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">WhatsApp conectado</p>
              {session.phone && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{session.phone}</p>
              )}
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{sessionId}</p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:text-white hover:bg-red-500 border border-red-300 hover:border-red-500 rounded-lg transition-colors disabled:opacity-50"
          >
            <LogOut size={12} />
            {actionLoading ? 'Desconectando...' : 'Desconectar'}
          </button>
        </div>
      </div>
    )
  }

  // ── Cargando ──
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)] border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" />
          <p className="text-sm">Verificando sesión...</p>
        </div>
      </div>
    )
  }

  // ── Error / Desconectado ──
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)] border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400">
            <WifiOff size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {error || 'WhatsApp desconectado'}
            </p>
            <p className="text-xs text-gray-400">{sessionId}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleConnect}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={actionLoading ? 'animate-spin' : ''} />
            {actionLoading ? 'Conectando...' : 'Conectar'}
          </button>
        </div>
      </div>
    </div>
  )
}
