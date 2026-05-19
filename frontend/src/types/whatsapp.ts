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

export const WHATSAPP_PROVIDER = {
  EVOLUTION_API: 'evolution-api',
} as const

export type WhatsAppProviderType = (typeof WHATSAPP_PROVIDER)[keyof typeof WHATSAPP_PROVIDER]

export interface WhatsAppProviderConfig {
  provider: WhatsAppProviderType
  baseUrl: string
  apiKey: string
  authHeader: string
  authPrefix: string
  defaultSessionId: string
}

export const DEFAULT_PROVIDER_CONFIG: WhatsAppProviderConfig = {
  provider: WHATSAPP_PROVIDER.EVOLUTION_API,
  baseUrl: 'https://evo.qeva.xyz',
  apiKey: '',
  authHeader: 'apikey',
  authPrefix: '',
  defaultSessionId: 'octopustrack',
}
