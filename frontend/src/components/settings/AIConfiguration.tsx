/**
 * Componente de configuración de proveedores IA (OpenAI, Gemini, OpenRouter, Anthropic).
 * Permite configurar la API key de cada proveedor, validarla y activar el que se quiera usar.
 * Las keys NUNCA se muestran en texto plano — solo los últimos 4 caracteres.
 */
import { useState, useEffect } from 'react'
import {
  Bot,
  Key,
  CheckCircle2,
  XCircle,
  Zap,
  Loader2,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import aiConfigService, {
  AIModelOption,
  AIProvider,
  AIProviderConfigResponse,
} from '../../api/aiConfigService'

// ─────────────────────────────────────────────────────────────
// Metadatos estáticos de cada proveedor (logo, link, modelos)
// ─────────────────────────────────────────────────────────────
interface ProviderMeta {
  label: string
  description: string
  docsUrl: string
  color: string
  models: { value: string; label: string }[]
  defaultModel: string
  requiresBaseUrl: boolean
  baseUrlPlaceholder?: string
}

// Modelos estáticos actualizados a marzo 2026.
// Se muestran como fallback mientras no hay key válida o si el fetch falla.
// Una vez que el usuario pega/tiene guardada la key, se reemplazan con los modelos reales.
const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  openai: {
    label: 'OpenAI',
    description: 'GPT-5.4, GPT-4o y más. Compatible con visión y audio (Whisper).',
    docsUrl: 'https://platform.openai.com/api-keys',
    color: 'bg-green-100 dark:bg-green-900/30 text-green-600',
    models: [
      { value: 'gpt-5.4',     label: 'GPT-5.4 (recomendado)' },
      { value: 'gpt-5-mini',  label: 'GPT-5 Mini (rápido y económico)' },
      { value: 'gpt-4.1',     label: 'GPT-4.1' },
      { value: 'gpt-4o',      label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
    defaultModel: 'gpt-5.4',
    requiresBaseUrl: false,
  },
  gemini: {
    label: 'Google Gemini',
    description: 'Gemini 3.1 Pro, 2.5 Pro y Flash. Excelente relación calidad/precio.',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    models: [
      { value: 'gemini-3.1-pro',   label: 'Gemini 3.1 Pro (preview, más nuevo)' },
      { value: 'gemini-3-flash',   label: 'Gemini 3 Flash (preview)' },
      { value: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro (recomendado)' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (rápido)' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
    defaultModel: 'gemini-2.5-pro',
    requiresBaseUrl: false,
  },
  openrouter: {
    label: 'OpenRouter',
    description: 'Acceso a cientos de modelos (Claude, Llama, Mistral, etc.) con una sola key.',
    docsUrl: 'https://openrouter.ai/keys',
    color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
    models: [
      { value: 'anthropic/claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (recomendado)' },
      { value: 'anthropic/claude-opus-4-6',           label: 'Claude Opus 4.6 (más inteligente)' },
      { value: 'openai/gpt-5.4',                      label: 'GPT-5.4' },
      { value: 'meta-llama/llama-3.1-70b-instruct',   label: 'Llama 3.1 70B' },
      { value: 'mistralai/mistral-large',             label: 'Mistral Large' },
    ],
    defaultModel: 'anthropic/claude-sonnet-4-6',
    requiresBaseUrl: true,
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
  },
  anthropic: {
    label: 'Anthropic',
    description: 'Claude Opus 4.6 y Sonnet 4.6. Los modelos más recientes de Anthropic.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    models: [
      { value: 'claude-opus-4-6',   label: 'Claude Opus 4.6 (más inteligente)' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recomendado)' },
      { value: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 (más rápido)' },
      { value: 'claude-opus-4-5',   label: 'Claude Opus 4.5' },
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    ],
    defaultModel: 'claude-sonnet-4-6',
    requiresBaseUrl: false,
  },
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────
interface AIConfigurationProps {
  businessId: string
}

// ─────────────────────────────────────────────────────────────
// Subcomponente: Card de un proveedor
// ─────────────────────────────────────────────────────────────
interface ProviderCardProps {
  provider: AIProvider
  meta: ProviderMeta
  config: AIProviderConfigResponse | null
  activeProvider: AIProvider | null
  onRefresh: () => void
}

function ProviderCard({
  provider,
  meta,
  config,
  activeProvider,
  onRefresh,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(meta.defaultModel)
  const [baseUrl, setBaseUrl] = useState(meta.baseUrlPlaceholder || '')
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [activating, setActivating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Modelos cargados dinámicamente desde la API del proveedor
  const [fetchedModels, setFetchedModels] = useState<AIModelOption[] | null>(null)
  const [fetchingModels, setFetchingModels] = useState(false)

  const isActive = activeProvider === provider
  const isConfigured = config !== null

  // Sincronizar modelo con config existente al abrir
  useEffect(() => {
    if (config) {
      setModel(config.default_model || meta.defaultModel)
      setBaseUrl(config.base_url || meta.baseUrlPlaceholder || '')
    }
  }, [config])

  // Cuando el proveedor ya está configurado y se abre el panel,
  // cargar los modelos reales usando la key guardada en DB (sin re-ingresarla)
  useEffect(() => {
    if (!expanded || !isConfigured || apiKey.length > 0) return
    let cancelled = false

    const load = async () => {
      setFetchingModels(true)
      try {
        const result = await aiConfigService.fetchModelsSaved(provider)
        if (cancelled) return
        setFetchedModels(result.models)
        // Si el modelo guardado no está en la lista actualizada, mantenerlo igual
        // (puede ser un modelo válido que la API no listó por algún motivo)
      } catch {
        // Error silencioso — se muestran los modelos estáticos como fallback
      } finally {
        if (!cancelled) setFetchingModels(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [expanded, isConfigured])

  // Cuando el usuario pega/escribe una API key nueva, esperar 800ms y consultar modelos reales
  useEffect(() => {
    // Key muy corta → no consultar todavía
    if (apiKey.length < 20) {
      setFetchedModels(null)
      return
    }

    const timer = setTimeout(async () => {
      setFetchingModels(true)
      try {
        const result = await aiConfigService.fetchModels(
          provider,
          apiKey,
          meta.requiresBaseUrl ? baseUrl : undefined
        )
        setFetchedModels(result.models)
        // Si el modelo actual no está en la lista, seleccionar el primero disponible
        if (result.models.length > 0 && !result.models.find((m) => m.id === model)) {
          setModel(result.models[0].id)
        }
      } catch {
        // Error silencioso — el usuario verá el error al intentar guardar/validar
        setFetchedModels(null)
      } finally {
        setFetchingModels(false)
      }
    }, 800)

    return () => clearTimeout(timer)
  }, [apiKey, baseUrl])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    // Si no está configurado, la API key es obligatoria para la primera vez
    if (!isConfigured && !apiKey) {
      toast.error('Ingresá la API Key')
      return
    }
    setSaving(true)
    try {
      await aiConfigService.upsertConfig(provider, {
        api_key: apiKey || undefined,   // undefined = no cambiar la key existente
        default_model: model,
        base_url: meta.requiresBaseUrl ? baseUrl : undefined,
      })
      toast.success(`Proveedor ${meta.label} guardado`)
      setApiKey('')
      onRefresh()
      setExpanded(false)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleValidate = async () => {
    if (!isConfigured) {
      toast.error('Primero guardá la API Key')
      return
    }
    setValidating(true)
    try {
      const result = await aiConfigService.validateProvider(provider)
      if (result.is_valid) {
        toast.success(`✅ Conexión exitosa con ${meta.label}`)
      } else {
        toast.error(`❌ Error: ${result.message}`)
      }
      onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al validar')
    } finally {
      setValidating(false)
    }
  }

  const handleActivate = async () => {
    if (!isConfigured) {
      toast.error('Primero guardá la API Key')
      return
    }
    setActivating(true)
    try {
      await aiConfigService.activateProvider(provider)
      toast.success(`${meta.label} activado como proveedor IA`)
      onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al activar')
    } finally {
      setActivating(false)
    }
  }

  const handleDelete = async () => {
    if (!isConfigured) return
    if (!confirm(`¿Eliminar la configuración de ${meta.label}?`)) return
    setDeleting(true)
    try {
      await aiConfigService.deleteProvider(provider)
      toast.success(`Configuración de ${meta.label} eliminada`)
      onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isActive
          ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/10'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
    >
      {/* Header del card */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Ícono del proveedor */}
        <div className={`p-2 rounded-lg ${meta.color}`}>
          <Bot size={18} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {meta.label}
            </span>
            {isActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                <Zap size={10} /> Activo
              </span>
            )}
            {isConfigured && !isActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                <CheckCircle2 size={10} /> Configurado
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {isConfigured
              ? `Key: ····${config!.api_key_last4} · Modelo: ${config!.default_model || meta.defaultModel}`
              : meta.description}
          </p>
        </div>

        {/* Validación anterior */}
        {isConfigured && config!.validated_at && (
          <div className="flex-shrink-0">
            {config!.is_valid ? (
              <CheckCircle2 size={16} className="text-green-500" />
            ) : (
              <XCircle size={16} className="text-red-500" />
            )}
          </div>
        )}

        {/* Chevron */}
        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Panel expandible */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
          {/* Estado de validación anterior */}
          {isConfigured && config!.validated_at && (
            <div
              className={`p-3 rounded-lg text-xs ${
                config!.is_valid
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
              }`}
            >
              <strong>Última validación:</strong>{' '}
              {new Date(config!.validated_at).toLocaleString('es-AR')} —{' '}
              {config!.is_valid
                ? '✅ OK'
                : `❌ ${config!.validation_error || 'Error desconocido'}`}
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSave} className="space-y-3">
            {/* API Key */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                API Key{' '}
                <a
                  href={meta.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline inline-flex items-center gap-0.5 ml-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  Obtener key <ExternalLink size={10} />
                </a>
              </label>
              <div className="relative">
                <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    isConfigured
                      ? `Key actual: ····${config!.api_key_last4}. Pegar nueva para actualizar`
                      : 'Pegar API Key...'
                  }
                />
              </div>
            </div>

            {/* Modelo */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2">
                Modelo
                {fetchingModels && (
                  <span className="inline-flex items-center gap-1 text-primary-500 text-xs font-normal">
                    <Loader2 size={11} className="animate-spin" />
                    Cargando modelos...
                  </span>
                )}
                {fetchedModels && !fetchingModels && (
                  <span className="inline-flex items-center gap-1 text-green-500 text-xs font-normal">
                    <CheckCircle2 size={11} />
                    {fetchedModels.length} modelos disponibles
                  </span>
                )}
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={fetchingModels}
              >
                {fetchedModels
                  ? // Modelos reales del proveedor
                    fetchedModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label !== m.id ? `${m.label} (${m.id})` : m.id}
                      </option>
                    ))
                  : // Catálogo estático mientras no hay key o está cargando
                    meta.models.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
              </select>
            </div>

            {/* Base URL (solo OpenRouter) */}
            {meta.requiresBaseUrl && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={meta.baseUrlPlaceholder}
                />
              </div>
            )}

            {/* Acciones */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* Guardar */}
              <button
                type="submit"
                disabled={saving || (!isConfigured && !apiKey)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                {saving ? 'Guardando...' : isConfigured ? 'Actualizar key' : 'Guardar'}
              </button>

              {/* Validar */}
              {isConfigured && (
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={validating}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50 transition-colors"
                >
                  {validating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {validating ? 'Validando...' : 'Validar conexión'}
                </button>
              )}

              {/* Activar */}
              {isConfigured && !isActive && (
                <button
                  type="button"
                  onClick={handleActivate}
                  disabled={activating}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors"
                >
                  {activating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {activating ? 'Activando...' : 'Activar'}
                </button>
              )}

              {/* Eliminar */}
              {isConfigured && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors ml-auto"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Eliminar
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function AIConfiguration({ businessId: _businessId }: AIConfigurationProps) {
  const [configs, setConfigs] = useState<Record<AIProvider, AIProviderConfigResponse | null>>({
    openai: null,
    gemini: null,
    openrouter: null,
    anthropic: null,
  })
  const [activeProvider, setActiveProvider] = useState<AIProvider | null>(null)
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadConfigs = async () => {
    try {
      const summary = await aiConfigService.listConfigs()
      const map: Record<AIProvider, AIProviderConfigResponse | null> = {
        openai: null,
        gemini: null,
        openrouter: null,
        anthropic: null,
      }
      for (const cfg of summary.providers) {
        map[cfg.provider] = cfg
      }
      setConfigs(map)
      setActiveProvider(summary.active_provider)
      setActiveModel(summary.active_model)
    } catch (error) {
      console.error('Error al cargar configuraciones IA:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfigs()
  }, [])

  const providers: AIProvider[] = ['openai', 'gemini', 'openrouter', 'anthropic']

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
          <Bot className="text-indigo-600" size={20} />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Inteligencia Artificial
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configurá el proveedor IA que usará el sistema para procesar presupuestos.
            Solo un proveedor puede estar activo a la vez.
          </p>
        </div>
      </div>

      {/* Estado activo */}
      {!loading && (
        <div className="mb-4 mt-4">
          {activeProvider ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 text-sm text-primary-700 dark:text-primary-300">
              <Zap size={14} />
              <span>
                Proveedor activo: <strong>{PROVIDER_META[activeProvider].label}</strong> ·{' '}
                {activeModel}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
              <XCircle size={14} />
              <span>Ningún proveedor IA activo. Configurá uno para usar el agente de presupuestos.</span>
            </div>
          )}
        </div>
      )}

      {/* Cards de proveedores */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider}
              provider={provider}
              meta={PROVIDER_META[provider]}
              config={configs[provider]}
              activeProvider={activeProvider}
              onRefresh={loadConfigs}
            />
          ))}
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs text-gray-600 dark:text-gray-400">
        <strong>¿Cómo funciona?</strong> Las API Keys se guardan cifradas en la base de datos.
        Solo se muestran los últimos 4 caracteres. El proveedor activo es el que usa el agente
        al procesar imágenes, audios y textos de presupuestos.
      </div>
    </div>
  )
}
