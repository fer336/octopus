import {
  type WhatsAppProviderConfig,
  DEFAULT_PROVIDER_CONFIG,
  PROVIDER_PRESETS,
  type WhatsAppProviderType,
} from '../../types/whatsapp'

const STORAGE_KEY = 'whatsapp-provider-config'

export function getProviderConfig(): WhatsAppProviderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_PROVIDER_CONFIG, ...JSON.parse(raw) }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_PROVIDER_CONFIG }
}

export function saveProviderConfig(config: WhatsAppProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function applyProviderPreset(
  current: WhatsAppProviderConfig,
  provider: WhatsAppProviderType,
): WhatsAppProviderConfig {
  const preset = PROVIDER_PRESETS[provider]
  return { ...current, provider, ...preset }
}
