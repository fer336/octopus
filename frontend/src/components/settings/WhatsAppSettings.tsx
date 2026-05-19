import { useState, useEffect } from 'react'
import { Save, ExternalLink, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getProviderConfig,
  saveProviderConfig,
  applyProviderPreset,
} from '../../api/whatsapp/provider'
import { invalidateWhatsAppClient } from '../../api/whatsapp/client'
import type { WhatsAppProviderConfig, WhatsAppProviderType } from '../../types/whatsapp'

const PROVIDERS: { value: WhatsAppProviderType; label: string; docsUrl: string }[] = [
  { value: 'qeva', label: 'Qeva (open-wa)', docsUrl: 'https://api.qeva.xyz/api/docs' },
  { value: 'open-wa', label: 'open-wa / wa-js', docsUrl: 'https://github.com/open-wa/wa-automate-nodejs' },
  { value: 'evolution-api', label: 'Evolution API', docsUrl: 'https://doc.evolution-api.com' },
  { value: 'waha', label: 'WAHA (WhatsApp HTTP API)', docsUrl: 'https://waha.devlike.pro' },
  { value: 'meta', label: 'WhatsApp Business (Meta Cloud API)', docsUrl: 'https://developers.facebook.com/docs/whatsapp' },
]

interface Props {
  onSaved?: () => void
}

export default function WhatsAppSettings({ onSaved }: Props = {}) {
  const [config, setConfig] = useState<WhatsAppProviderConfig>(getProviderConfig())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setConfig(getProviderConfig())
  }, [])

  function handleProviderChange(provider: WhatsAppProviderType) {
    setConfig((prev) => applyProviderPreset(prev, provider))
  }

  function handleSave() {
    if (!config.baseUrl.trim()) {
      toast.error('La URL base es obligatoria')
      return
    }
    saveProviderConfig(config)
    invalidateWhatsAppClient()
    setSaved(true)
    toast.success('Configuración de WhatsApp guardada')
    setTimeout(() => setSaved(false), 3000)
    onSaved?.()
  }

  const selectedProvider = PROVIDERS.find((p) => p.value === config.provider)

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Provider
        </label>
        <div className="flex flex-col gap-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                config.provider === p.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={p.value}
                checked={config.provider === p.value}
                onChange={() => handleProviderChange(p.value)}
                className="text-primary-600"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {p.label}
                </span>
              </div>
              <a
                href={p.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-gray-400 hover:text-primary-600 transition-colors"
                title="Ver documentación"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            URL Base
          </label>
          <input
            type="url"
            value={config.baseUrl}
            onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
            placeholder="https://api.qeva.xyz"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            API Key / Token
          </label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
            placeholder="sk-..."
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Header de autenticación
          </label>
          <input
            type="text"
            value={config.authHeader}
            onChange={(e) => setConfig((prev) => ({ ...prev, authHeader: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            {config.provider === 'meta' ? 'Authorization (con prefix Bearer)' : `Auto-detectado para ${selectedProvider?.label}`}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Nombre de sesión por defecto
          </label>
          <input
            type="text"
            value={config.defaultSessionId}
            onChange={(e) => setConfig((prev) => ({ ...prev, defaultSessionId: e.target.value }))}
            placeholder="octopus-session"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
      >
        {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Guardado' : 'Guardar configuración'}
      </button>
    </div>
  )
}
