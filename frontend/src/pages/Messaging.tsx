import { useEffect, useState, useCallback } from 'react'
import {
  Smartphone,
  Wifi,
  WifiOff,
  Settings,
  MessageCircle,
} from 'lucide-react'
import { listSessions, getSession, getConnectionState } from '../api/whatsapp/service'
import { invalidateWhatsAppClient } from '../api/whatsapp/client'
import { getProviderConfig } from '../api/whatsapp/provider'
import { useMessagingStore } from '../stores/messagingStore'
import SessionPanel from '../components/messaging/SessionPanel'
import ConversationList from '../components/messaging/ConversationList'
import ChatView from '../components/messaging/ChatView'
import WhatsAppSettings from '../components/settings/WhatsAppSettings'
import type { WhatsAppSession } from '../types/whatsapp'

export default function Messaging() {
  const { sessions, setSessions, activeSessionId, setActiveSessionId, activeChat } = useMessagingStore()

  const [initialLoading, setInitialLoading] = useState(true)
  const [authError, setAuthError] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [realState, setRealState] = useState<WhatsAppSession | null>(null)

  const sessionId = getProviderConfig().defaultSessionId.trim() || 'octopustrack'
  const mySession: WhatsAppSession | undefined = sessions.find((s) => s.id === sessionId)
  const isConnected = mySession?.status === 'ready'

  const checkSession = useCallback(async () => {
    try {
      // GET /instance/connect/{instance} — inicia/verifica conexión
      const session = await getSession(sessionId)

      // GET /instance/connectionState/{instance} — estado real sin side effects
      const real = await getConnectionState(sessionId)
      setRealState(real)

      const sessionsList = await listSessions()
      setSessions(sessionsList)

      if (session.status === 'ready') {
        setActiveSessionId(session.id)
      }

      setAuthError(false)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403 || status === 503) {
        setAuthError(true)
      }
      // Si falla pero ya tenemos data en el store, no mostramos error
    } finally {
      setInitialLoading(false)
    }
  }, [sessionId, setSessions, setActiveSessionId])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  function handleSettingsSaved() {
    invalidateWhatsAppClient()
    setAuthError(false)
    setShowSettings(false)
    setInitialLoading(true)
    checkSession()
  }

  function handleSessionReady() {
    // SessionPanel ya actualizó el store, recargamos el estado
    checkSession()
  }

  // ── Loading inicial ──
  if (initialLoading) {
    return (
      <div className="h-full flex flex-col gap-4">
        {/* Header placeholder */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        </div>
      </div>
    )
  }

  // ── Auth error → settings ──
  if (authError && !isConnected) {
    return (
      <div className="h-full flex flex-col gap-4">
        <WhatsAppSettingsHeader onSettings={() => setShowSettings(true)} showSettings={showSettings} />
        {showSettings ? (
          <div className="max-w-2xl mx-auto w-full">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              <WhatsAppSettings onSaved={handleSettingsSaved} />
            </div>
          </div>
        ) : (
          <SessionHeader session={null} realState={realState} sessionId={sessionId} onSettings={() => setShowSettings(true)} />
        )}
      </div>
    )
  }

  // ── Connected → CRM layout ──
  if (isConnected && activeSessionId) {
    return (
      <div className="h-full flex flex-col gap-4">
        {/* Header con status + conexión real */}
        <SessionHeader session={mySession} realState={realState} sessionId={sessionId} onSettings={() => setShowSettings(true)} />

        {/* Split CRM */}
        <div className="flex-1 flex overflow-hidden bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Sidebar: contactos */}
          <div className="w-72 lg:w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Contactos
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationList sessionId={activeSessionId} />
            </div>
          </div>

          {/* Main: chat */}
          <div className="flex-1 flex flex-col">
            {activeChat ? (
              <ChatView sessionId={activeSessionId} chatId={activeChat} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
                <MessageCircle className="w-10 h-10" />
                <p className="text-sm">Seleccioná un contacto para empezar a chatear</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Disconnected → SessionPanel ──
  return (
    <div className="h-full flex flex-col gap-4">
        <SessionHeader session={mySession} realState={realState} sessionId={sessionId} onSettings={() => setShowSettings(true)} />
      {showSettings ? (
        <div className="max-w-2xl mx-auto w-full">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <WhatsAppSettings onSaved={handleSettingsSaved} />
          </div>
        </div>
      ) : (
        <div className="max-w-md mx-auto w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <SessionPanel onSessionReady={handleSessionReady} />
        </div>
      )}
    </div>
  )
}

// ── Componentes internos ──

function SessionHeader({
  session,
  realState,
  sessionId,
  onSettings,
}: {
  session?: WhatsAppSession | null
  realState?: WhatsAppSession | null
  sessionId: string
  onSettings: () => void
}) {
  const isReady = session?.status === 'ready'
  const hasQR = session?.status === 'qr_ready' || session?.status === 'initializing' || session?.status === 'authenticating'
  const realStatus = realState?.status
  const realReady = realStatus === 'ready'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-5 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isReady ? 'bg-green-50 dark:bg-green-900/20' : hasQR ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
            <Smartphone size={16} className={
              isReady
                ? 'text-green-600 dark:text-green-400'
                : hasQR
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-400'
            } />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  WhatsApp
                </p>
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  isReady
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : hasQR
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {isReady && <Wifi size={10} />}
                  {!isReady && !hasQR && <WifiOff size={10} />}
                  {isReady ? 'Conectado' : hasQR ? 'Escaneá el QR' : 'Desconectado'}
                </span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">{sessionId}</p>
            </div>

            {/* ═══ Barra de estado real (connectionState) ═══ */}
            <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-gray-200 dark:border-gray-600">
              <span className={`w-2 h-2 rounded-full ${realReady ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                <span className="font-medium text-gray-500 dark:text-gray-400">Real:</span>{' '}
                {realStatus === 'ready' ? 'Conectado' : realStatus === 'qr_ready' ? 'QR listo' : realStatus || '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session?.phone && (
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
              {session.phone}
            </span>
          )}
          <button
            onClick={onSettings}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Configuración"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function WhatsAppSettingsHeader({
  showSettings,
  onSettings,
}: {
  showSettings: boolean
  onSettings: () => void
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-5 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
            <Smartphone size={16} className="text-gray-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">WhatsApp</p>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
                <WifiOff size={10} />
                Error de conexión
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">Revisá la configuración de la API</p>
          </div>
        </div>
        <button
          onClick={onSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-white hover:bg-primary-600 border border-primary-300 hover:border-primary-600 rounded-lg transition-colors"
        >
          <Settings size={12} />
          {showSettings ? 'Cerrar' : 'Configurar'}
        </button>
      </div>
    </div>
  )
}
