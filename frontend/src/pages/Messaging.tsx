import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { listSessions } from '../api/whatsapp/service'
import { getProviderConfig } from '../api/whatsapp/provider'
import { invalidateWhatsAppClient } from '../api/whatsapp/client'
import { useMessagingStore } from '../stores/messagingStore'
import SessionPanel from '../components/messaging/SessionPanel'
import WhatsAppSettings from '../components/settings/WhatsAppSettings'

export default function Messaging() {
  const { setSessions, setActiveSessionId } = useMessagingStore()
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [authError, setAuthError] = useState(false)

  const config = getProviderConfig()
  const hasApiKey = Boolean(config.apiKey?.trim())

  function handleSettingsSaved() {
    invalidateWhatsAppClient()
    setAuthError(false)
    setLoadingSessions(true)
    listSessions()
      .then((data) => {
        setSessions(data)
        const ready = data.find((s) => s.status === 'ready')
        if (ready) setActiveSessionId(ready.id)
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401 || status === 403) setAuthError(true)
      })
      .finally(() => setLoadingSessions(false))
  }

  useEffect(() => {
    if (!hasApiKey) {
      setLoadingSessions(false)
      return
    }
    listSessions()
      .then((data) => {
        setSessions(data)
        const ready = data.find((s) => s.status === 'ready')
        if (ready) setActiveSessionId(ready.id)
      })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 401 || status === 403) setAuthError(true)
      })
      .finally(() => setLoadingSessions(false))
  }, [setSessions, setActiveSessionId, hasApiKey])

  if (loadingSessions) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!hasApiKey || authError) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Configurá Evolution API para WhatsApp
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {authError
                  ? 'La API key es inválida (401). Actualizá las credenciales y guardá.'
                  : 'Completá las credenciales para conectar tu cuenta de WhatsApp.'}
              </p>
            </div>
          </div>
          <WhatsAppSettings onSaved={handleSettingsSaved} />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <SessionPanel onSessionReady={() => {}} />
      </div>
    </div>
  )
}
