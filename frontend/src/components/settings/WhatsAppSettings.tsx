import { useState, useEffect } from 'react'
import { Save, ExternalLink, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { getProviderConfig, saveProviderConfig } from '../../api/whatsapp/provider'
import { invalidateWhatsAppClient } from '../../api/whatsapp/client'
import type { WhatsAppProviderConfig } from '../../types/whatsapp'

const EVOLUTION_DOCS_URL = 'https://doc.evolution-api.com'

interface Props {
  onSaved?: () => void
}

export default function WhatsAppSettings({ onSaved }: Props = {}) {
  const [config, setConfig] = useState<WhatsAppProviderConfig>(getProviderConfig())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setConfig(getProviderConfig())
  }, [])

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

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Provider
        </label>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary-500 bg-primary-50 dark:bg-primary-900/20">
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              Evolution API
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Proveedor fijo para la integración de WhatsApp.
            </p>
          </div>
          <a
            href={EVOLUTION_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-primary-600 transition-colors"
            title="Ver documentación"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
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
            placeholder="https://evo.qeva.xyz"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            API Key (Global)
          </label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
            placeholder="VITE_EVOLUTION_API_KEY del .env"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Nombre de sesión por defecto
          </label>
          <input
            type="text"
            value={config.defaultSessionId}
            onChange={(e) => setConfig((prev) => ({ ...prev, defaultSessionId: e.target.value }))}
            placeholder="octopustrack"
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
