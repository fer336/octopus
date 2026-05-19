import { useEffect, useState, useCallback, useRef } from 'react'
import { Smartphone, Wifi, WifiOff, LogOut, CheckCircle, AlertCircle, RefreshCw, MessageCircle } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import businessService from '../api/businessService'
import { stopSession, createSession, getConnectionState } from '../api/whatsapp/service'
import { invalidateWhatsAppClient } from '../api/whatsapp/client'
import { getProviderConfig, saveProviderConfig } from '../api/whatsapp/provider'
import { useMessagingStore } from '../stores/messagingStore'
import QRCode from '../components/messaging/QRCode'
import ConversationList from '../components/messaging/ConversationList'
import ChatView from '../components/messaging/ChatView'
import type { WhatsAppSession } from '../types/whatsapp'

const INSTANCE_CACHE_KEY = 'whatsapp-instance-name'

// env var key wins; business key is the fallback for environments without the var
function resolveApiKey(businessKey?: string | null): string {
  const envKey = (import.meta.env.VITE_EVOLUTION_API_KEY as string | undefined) ?? ''
  return envKey || businessKey || ''
}

export default function Messaging() {
  const queryClient = useQueryClient()
  const { data: business, isLoading: businessLoading } = useQuery({
    queryKey: ['business-me-messaging'],
    queryFn: () => businessService.getMyBusiness(),
  })

  const { sessions, setSessions, activeSessionId, setActiveSessionId, activeChat } = useMessagingStore()

  // Prefer backend value; fall back to localStorage cache (migration path)
  const backendInstance = business?.whatsapp_instance_name ?? null
  const [instanceName, setInstanceName] = useState<string>(() => localStorage.getItem(INSTANCE_CACHE_KEY) ?? '')
  const [nameInput, setNameInput] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const configInjected = useRef(false)

  // Sync instance name from backend when business loads
  useEffect(() => {
    if (backendInstance && backendInstance !== instanceName) {
      setInstanceName(backendInstance)
      localStorage.setItem(INSTANCE_CACHE_KEY, backendInstance)
    }
  }, [backendInstance])

  const mySession: WhatsAppSession | undefined = sessions.find((s) => s.id === instanceName)
  const isConnected = mySession?.status === 'ready'
  const effectiveApiKey = resolveApiKey(business?.evolution_api_key)

  // Inject the effective API key into the WhatsApp client config
  useEffect(() => {
    if (!effectiveApiKey || configInjected.current) return
    const current = getProviderConfig()
    saveProviderConfig({
      ...current,
      apiKey: effectiveApiKey,
      defaultSessionId: instanceName || current.defaultSessionId,
    })
    invalidateWhatsAppClient()
    configInjected.current = true
  }, [effectiveApiKey, instanceName])

  // Bootstrap: check connection state, create instance if needed — no startSession call
  const bootstrap = useCallback(async () => {
    if (!instanceName || !effectiveApiKey) return
    setSessionLoading(true)
    setSessionError(null)
    try {
      let session: WhatsAppSession
      try {
        session = await getConnectionState(instanceName)
      } catch {
        // Instance doesn't exist on the server — create it
        session = await createSession(instanceName)
      }

      setSessions([session])
      setActiveSessionId(session.id)

      if (session.status === 'ready') {
        // already connected
      } else {
        setPendingSessionId(session.id)
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 403) {
        setSessionError('El servidor rechazó la conexión. Contactá al administrador.')
      } else {
        setSessionError('No se pudo conectar con el servidor de WhatsApp.')
      }
    } finally {
      setSessionLoading(false)
    }
  }, [instanceName, effectiveApiKey])

  useEffect(() => {
    if (instanceName && effectiveApiKey) {
      bootstrap()
    }
  }, [instanceName, effectiveApiKey, bootstrap])

  async function handleCreateInstance() {
    const name = nameInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!name) return

    // Save to backend
    try {
      await businessService.updateMyBusiness({ whatsapp_instance_name: name })
      queryClient.invalidateQueries({ queryKey: ['business-me-messaging'] })
    } catch {
      toast.error('No se pudo guardar el nombre de instancia')
      return
    }

    // Update local config
    const current = getProviderConfig()
    saveProviderConfig({ ...current, defaultSessionId: name })
    localStorage.setItem(INSTANCE_CACHE_KEY, name)
    setInstanceName(name)
    configInjected.current = false
  }

  function handleQRConnected() {
    setPendingSessionId(null)
    toast.success('WhatsApp conectado')
    bootstrap()
  }

  async function handleDisconnect() {
    if (!mySession) return
    setDisconnecting(true)
    try {
      await stopSession(mySession.id)
      setSessions(sessions.map((s) => s.id === mySession.id ? { ...s, status: 'disconnected' } : s))
      setActiveSessionId(null)
      toast.success('Sesión desconectada')
    } catch {
      toast.error('Error al desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleChangeInstance() {
    // Clear backend value
    try {
      await businessService.updateMyBusiness({ whatsapp_instance_name: null })
      queryClient.invalidateQueries({ queryKey: ['business-me-messaging'] })
    } catch { /* best effort */ }

    localStorage.removeItem(INSTANCE_CACHE_KEY)
    setInstanceName('')
    setNameInput('')
    setPendingSessionId(null)
    setSessionError(null)
    setActiveSessionId(null)
    configInjected.current = false
  }

  // ── Loading business ──
  if (businessLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  // ── No API key in env or backend ──
  if (!effectiveApiKey) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-yellow-200 bg-yellow-50 p-8 text-center dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertCircle className="h-10 w-10 text-yellow-500" />
          <div>
            <p className="font-semibold text-yellow-800 dark:text-yellow-200">WhatsApp no configurado</p>
            <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
              El administrador aún no configuró la integración con Evolution API. Contactá al soporte.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── No instance name yet ──
  if (!instanceName) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Smartphone className="h-7 w-7 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Conectar WhatsApp</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Elegí un nombre para tu instancia. Solo lo configurás una vez.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateInstance()}
              placeholder="Ej: mi-negocio"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              autoFocus
            />
            <button
              onClick={handleCreateInstance}
              disabled={!nameInput.trim()}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40"
            >
              Crear instancia
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Session loading ──
  if (sessionLoading) {
    return (
      <div className="flex h-full flex-col gap-4">
        <StatusBar instanceName={instanceName} status="loading" />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
            <p className="text-sm">Verificando instancia…</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Error ──
  if (sessionError) {
    return (
      <div className="flex h-full flex-col gap-4">
        <StatusBar instanceName={instanceName} status="error" onChangeInstance={handleChangeInstance} />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-300">{sessionError}</p>
            <button
              onClick={bootstrap}
              className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900/30"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── QR pending ──
  if (pendingSessionId) {
    return (
      <div className="flex h-full flex-col gap-4">
        <StatusBar instanceName={instanceName} status="scanning" />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Escaneá el código QR</p>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo
              </p>
            </div>
            <div className="p-5">
              <QRCode sessionId={pendingSessionId} onConnected={handleQRConnected} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Connected → CRM ──
  if (isConnected && activeSessionId) {
    return (
      <div className="flex h-full flex-col gap-4">
        <StatusBar
          instanceName={instanceName}
          status="connected"
          phone={mySession?.phone}
          onDisconnect={handleDisconnect}
          disconnecting={disconnecting}
        />
        <div className="flex flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex w-72 flex-col border-r border-gray-200 dark:border-gray-700 lg:w-80">
            <div className="border-b border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Contactos
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationList sessionId={activeSessionId} />
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            {activeChat ? (
              <ChatView sessionId={activeSessionId} chatId={activeChat} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
                <MessageCircle className="h-10 w-10" />
                <p className="text-sm">Seleccioná un contacto para chatear</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Disconnected ──
  return (
    <div className="flex h-full flex-col gap-4">
      <StatusBar instanceName={instanceName} status="disconnected" onChangeInstance={handleChangeInstance} />
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <WifiOff className="h-7 w-7 text-gray-400" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-800 dark:text-gray-100">Sesión desconectada</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{instanceName}</p>
          </div>
          <button
            onClick={bootstrap}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            <Wifi className="h-4 w-4" />
            Conectar WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status bar ──
function StatusBar({
  instanceName,
  status,
  phone,
  onDisconnect,
  onChangeInstance,
  disconnecting,
}: {
  instanceName: string
  status: 'loading' | 'scanning' | 'connected' | 'disconnected' | 'error'
  phone?: string
  onDisconnect?: () => void
  onChangeInstance?: () => void
  disconnecting?: boolean
}) {
  const badge = {
    loading:      { label: 'Iniciando…',    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
    scanning:     { label: 'Escaneá el QR', cls: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' },
    connected:    { label: 'Conectado',     cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    disconnected: { label: 'Desconectado',  cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
    error:        { label: 'Error',         cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  }[status]

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${status === 'connected' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
          {status === 'connected' ? (
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <Smartphone className="h-4 w-4 text-gray-400" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">WhatsApp</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {phone ? `${phone} · ${instanceName}` : instanceName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status === 'connected' && onDisconnect && (
          <button
            onClick={onDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-red-700 dark:hover:bg-red-900/20"
          >
            <LogOut className="h-3.5 w-3.5" />
            {disconnecting ? 'Desconectando…' : 'Desconectar'}
          </button>
        )}
        {(status === 'disconnected' || status === 'error') && onChangeInstance && (
          <button
            onClick={onChangeInstance}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            Cambiar instancia
          </button>
        )}
      </div>
    </div>
  )
}
