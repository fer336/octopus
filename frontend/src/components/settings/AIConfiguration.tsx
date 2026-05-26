import { useState, useEffect } from 'react'
import { Bot, Key, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import aiConfigService from '../../api/aiConfigService'

interface OpenRouterModel {
  id: string
  name: string
  pricing: {
    prompt: string
    completion: string
  }
}

interface Props {
  businessId: string
}

function formatPrice(perToken: string): string {
  const usd = parseFloat(perToken) * 1_000_000
  if (!usd) return 'gratis'
  return `$${usd.toFixed(2)}/1M`
}

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6'

export default function AIConfiguration({ businessId: _businessId }: Props) {
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [saving, setSaving] = useState(false)
  const [configured, setConfigured] = useState<{ last4: string; model: string } | null>(null)

  useEffect(() => {
    fetch('https://openrouter.ai/api/v1/models')
      .then((r) => r.json())
      .then((json) => {
        const list: OpenRouterModel[] = (json.data ?? []).filter(
          (m: OpenRouterModel) => m.id && m.pricing,
        )
        list.sort((a, b) => parseFloat(a.pricing.prompt) - parseFloat(b.pricing.prompt))
        setModels(list)
      })
      .catch(() => null)
      .finally(() => setLoadingModels(false))
  }, [])

  useEffect(() => {
    aiConfigService
      .listConfigs()
      .then((summary) => {
        const cfg = summary.providers.find((p) => p.provider === 'openrouter')
        if (cfg?.api_key_last4) {
          setConfigured({ last4: cfg.api_key_last4, model: cfg.default_model ?? DEFAULT_MODEL })
          setModel(cfg.default_model ?? DEFAULT_MODEL)
        }
      })
      .catch(() => null)
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!configured && !apiKey) {
      toast.error('Ingresá la API Key de OpenRouter')
      return
    }
    setSaving(true)
    try {
      await aiConfigService.upsertConfig('openrouter', {
        api_key: apiKey || undefined,
        default_model: model,
        base_url: 'https://openrouter.ai/api/v1',
      })
      await aiConfigService.activateProvider('openrouter')
      setConfigured({ last4: apiKey ? apiKey.slice(-4) : (configured?.last4 ?? ''), model })
      setApiKey('')
      toast.success('Configuración guardada')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
          <Bot className="text-primary-600" size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Inteligencia Artificial
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Acceso a OpenRouter para el agente IA del negocio.
          </p>
        </div>
      </div>

      {configured && (
        <div className="mb-5 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
          <CheckCircle2 size={14} />
          <span>
            Configurado · Key: ····{configured.last4} · Modelo: {configured.model}
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
            API Key{' '}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 hover:underline font-normal ml-1"
            >
              openrouter.ai/keys
            </a>
          </label>
          <div className="relative">
            <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="password"
              className="w-full pl-8 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                configured
                  ? `Pegar nueva key para actualizar (actual: ····${configured.last4})`
                  : 'sk-or-...'
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 flex items-center gap-2">
            Modelo
            {loadingModels && <Loader2 size={12} className="animate-spin text-gray-400" />}
          </label>
          <select
            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loadingModels}
          >
            {models.length > 0 ? (
              models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {formatPrice(m.pricing.prompt)} entrada /{' '}
                  {formatPrice(m.pricing.completion)} salida
                </option>
              ))
            ) : (
              <option value={model}>{model}</option>
            )}
          </select>
        </div>

        <button
          type="submit"
          disabled={saving || (!configured && !apiKey)}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </form>
    </div>
  )
}
