import { type WhatsAppProviderConfig, DEFAULT_PROVIDER_CONFIG } from '../../types/whatsapp'

const STORAGE_KEY = 'whatsapp-provider-config'

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normalizeProviderConfig(rawConfig: unknown): WhatsAppProviderConfig {
  const data = typeof rawConfig === 'object' && rawConfig !== null
    ? rawConfig as Record<string, unknown>
    : {}
  const provider = readString(data.provider)
  const isEvolutionConfig = provider === DEFAULT_PROVIDER_CONFIG.provider
  const baseUrl = readString(data.baseUrl)?.trim()
  const apiKey = readString(data.apiKey) ?? ''
  const defaultSessionId = readString(data.defaultSessionId)?.trim()

  return {
    ...DEFAULT_PROVIDER_CONFIG,
    baseUrl: isEvolutionConfig && baseUrl ? baseUrl : DEFAULT_PROVIDER_CONFIG.baseUrl,
    apiKey,
    authHeader: DEFAULT_PROVIDER_CONFIG.authHeader,
    authPrefix: DEFAULT_PROVIDER_CONFIG.authPrefix,
    defaultSessionId: isEvolutionConfig && defaultSessionId
      ? defaultSessionId
      : DEFAULT_PROVIDER_CONFIG.defaultSessionId,
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
  return { ...DEFAULT_PROVIDER_CONFIG }
}

export function saveProviderConfig(config: WhatsAppProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeProviderConfig(config)))
}
