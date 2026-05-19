import { type WhatsAppProviderConfig, DEFAULT_PROVIDER_CONFIG } from '../../types/whatsapp'

const STORAGE_KEY = 'whatsapp-provider-config'

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Retorna la config por defecto, sobreescribiendo apiKey desde VITE_EVOLUTION_API_KEY
 * cuando existe (build-time). Así cada entorno puede tener su propia key sin hardcodear.
 */
function defaultWithEnvOverrides(): WhatsAppProviderConfig {
  let envApiKey = ''
  try {
    envApiKey = import.meta.env.VITE_EVOLUTION_API_KEY ?? ''
  } catch {
    // fallback si import.meta.env no está disponible
  }

  return {
    ...DEFAULT_PROVIDER_CONFIG,
    apiKey: envApiKey || DEFAULT_PROVIDER_CONFIG.apiKey,
  }
}

function normalizeProviderConfig(rawConfig: unknown): WhatsAppProviderConfig {
  const data = typeof rawConfig === 'object' && rawConfig !== null
    ? rawConfig as Record<string, unknown>
    : {}
  const baseUrl = readString(data.baseUrl)?.trim()
  const apiKey = readString(data.apiKey) ?? ''
  const defaultSessionId = readString(data.defaultSessionId)?.trim()

  const defaults = defaultWithEnvOverrides()

  return {
    ...defaults,
    baseUrl: baseUrl || defaults.baseUrl,
    apiKey: apiKey || defaults.apiKey,
    defaultSessionId: defaultSessionId || defaults.defaultSessionId,
  }
}

export function getProviderConfig(): WhatsAppProviderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const normalized = normalizeProviderConfig(JSON.parse(raw) as unknown)
      saveProviderConfig(normalized)
      return normalized
    }
  } catch {
    // ignore parse errors
  }
  return { ...defaultWithEnvOverrides() }
}

export function saveProviderConfig(config: WhatsAppProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProviderConfig(config)))
}
