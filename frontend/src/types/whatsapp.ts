export type SessionStatus =
  | 'created'
  | 'initializing'
  | 'qr_ready'
  | 'authenticating'
  | 'ready'
  | 'disconnected'
  | 'failed'

export interface WhatsAppSession {
  id: string
  name: string
  status: SessionStatus
  phone?: string
  pushName?: string
  connectedAt?: string
  lastActive?: string
  createdAt: string
  updatedAt: string
}

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'unknown'

export interface WhatsAppMessage {
  id: string
  chatId: string
  fromMe: boolean
  body: string
  type: MessageType
  timestamp: number
  author?: string
  mediaUrl?: string
  filename?: string
  mimetype?: string
  caption?: string
  isRead?: boolean
}

export interface WhatsAppContact {
  id: string
  name?: string
  pushname?: string
  number: string
  isGroup: boolean
  isMyContact?: boolean
  profilePicUrl?: string
}

export type WhatsAppProviderType =
  | 'qeva'
  | 'evolution-api'
  | 'waha'
  | 'open-wa'
  | 'meta'

export interface WhatsAppProviderConfig {
  provider: WhatsAppProviderType
  baseUrl: string
  apiKey: string
  authHeader: string
  authPrefix: string
  defaultSessionId: string
}

export const PROVIDER_PRESETS: Record<
  WhatsAppProviderType,
  Pick<WhatsAppProviderConfig, 'authHeader' | 'authPrefix'>
> = {
  qeva: { authHeader: 'X-API-Key', authPrefix: '' },
  'open-wa': { authHeader: 'X-API-Key', authPrefix: '' },
  'evolution-api': { authHeader: 'apikey', authPrefix: '' },
  waha: { authHeader: 'X-Api-Key', authPrefix: '' },
  meta: { authHeader: 'Authorization', authPrefix: 'Bearer ' },
}

export const DEFAULT_PROVIDER_CONFIG: WhatsAppProviderConfig = {
  provider: 'qeva',
  baseUrl: 'https://api.qeva.xyz',
  apiKey: '',
  authHeader: 'X-API-Key',
  authPrefix: '',
  defaultSessionId: '',
}
