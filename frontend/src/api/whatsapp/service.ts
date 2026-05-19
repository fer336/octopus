import { getWhatsAppClient } from './client'
import { getProviderConfig } from './provider'
import type { SessionStatus, WhatsAppSession, WhatsAppMessage, WhatsAppContact } from '../../types/whatsapp'

function client() {
  return getWhatsAppClient()
}

interface EvolutionInstanceData {
  instanceName?: string
  owner?: string
  profileName?: string
  status?: string
  state?: string
  createdAt?: string
  updatedAt?: string
}

interface EvolutionInstanceResponse {
  instance?: EvolutionInstanceData
}

interface EvolutionMessageResponse {
  key?: {
    id?: string
  }
  messageId?: string
  id?: string
  timestamp?: number
}

interface EvolutionCheckNumberResponse {
  exists?: boolean
  numberExists?: boolean
  canReceiveMessage?: boolean
}

interface EvolutionChatMessage {
  key?: {
    id?: string
    remoteJid?: string
    fromMe?: boolean
  }
  messageTimestamp?: number
  pushName?: string
  message?: {
    conversation?: string
    extendedTextMessage?: {
      text?: string
    }
    documentMessage?: {
      fileName?: string
      mimetype?: string
      caption?: string
    }
  }
}

interface EvolutionFindMessagesResponse {
  messages?: {
    records?: EvolutionChatMessage[]
  }
}

interface EvolutionContactData {
  id?: string
  remoteJid?: string
  pushName?: string
  name?: string
  profilePicUrl?: string
}

function normalizeEvolutionStatus(state?: string): SessionStatus {
  if (state === 'open') return 'ready'
  if (state === 'connecting') return 'qr_ready'
  if (state === 'close') return 'disconnected'
  if (state === 'qrcode') return 'qr_ready'
  return 'created'
}

function normalizeEvolutionSession(data: EvolutionInstanceData): WhatsAppSession {
  const now = new Date().toISOString()
  const id = data.instanceName ?? getProviderConfig().defaultSessionId
  return {
    id,
    name: id,
    status: normalizeEvolutionStatus(data.state ?? data.status),
    phone: data.owner,
    pushName: data.profileName,
    connectedAt: data.state === 'open' ? data.updatedAt ?? now : undefined,
    lastActive: data.updatedAt,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  }
}

function normalizeEvolutionSessions(data: unknown): WhatsAppSession[] {
  const items = Array.isArray(data) ? data : [data]
  return items.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const response = item as EvolutionInstanceResponse
    return response.instance ? [normalizeEvolutionSession(response.instance)] : []
  })
}

function normalizeMessageResult(data: EvolutionMessageResponse): { messageId: string; timestamp: number } {
  return {
    messageId: data.key?.id ?? data.messageId ?? data.id ?? '',
    timestamp: data.timestamp ?? Date.now(),
  }
}

function normalizeEvolutionMessage(data: EvolutionChatMessage): WhatsAppMessage {
  const id = data.key?.id ?? `${data.key?.remoteJid ?? 'message'}-${data.messageTimestamp ?? Date.now()}`
  const document = data.message?.documentMessage
  const body = data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? document?.caption ?? ''

  return {
    id,
    chatId: data.key?.remoteJid ?? '',
    fromMe: data.key?.fromMe ?? false,
    body,
    type: document ? 'document' : 'text',
    timestamp: data.messageTimestamp ?? Date.now(),
    author: data.pushName,
    filename: document?.fileName,
    mimetype: document?.mimetype,
    caption: document?.caption,
  }
}

function normalizeEvolutionContact(data: EvolutionContactData): WhatsAppContact | null {
  const id = data.id ?? data.remoteJid
  if (!id) return null

  return {
    id,
    name: data.name,
    pushname: data.pushName,
    number: id.replace(/@.+$/, ''),
    isGroup: id.endsWith('@g.us'),
    profilePicUrl: data.profilePicUrl,
  }
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined

  const response = (error as { response?: unknown }).response
  if (typeof response !== 'object' || response === null || !('status' in response)) return undefined

  const status = (response as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

function getMediaPayload(payload: { url?: string; base64?: string }): string {
  return payload.base64 ?? payload.url ?? ''
}

// Sessions
export async function listSessions(): Promise<WhatsAppSession[]> {
  const instanceName = getProviderConfig().defaultSessionId
  try {
    const res = await client().get('/instance/fetchInstances', { params: { instanceName } })
    return normalizeEvolutionSessions(res.data)
  } catch (error: unknown) {
    if (getHttpStatus(error) === 404) return []
    throw error
  }
}

export async function getSession(id: string): Promise<WhatsAppSession> {
  // GET /instance/connectionState/{instance} — read-only, sin side effects
  const res = await client().get(`/instance/connectionState/${id}`)
  return normalizeEvolutionSession(res.data?.instance ?? { instanceName: id })
}

/** GET /instance/connect/{instance} — inicia conexión y devuelve pairingCode/code para QR */
export async function connectSession(id: string): Promise<{ pairingCode?: string; code?: string }> {
  const res = await client().get<{ pairingCode?: string; code?: string; count?: number }>(`/instance/connect/${id}`)
  return {
    pairingCode: res.data.pairingCode,
    code: res.data.code,
  }
}

/** GET /instance/connectionState/{instance} — estado real sin efectos secundarios */
export async function getConnectionState(id: string): Promise<WhatsAppSession> {
  const res = await client().get(`/instance/connectionState/${id}`)
  return normalizeEvolutionSession(res.data?.instance ?? { instanceName: id })
}

export async function createSession(name: string, token?: string): Promise<WhatsAppSession> {
  try {
    const payload: Record<string, unknown> = {
      instanceName: name,
      qrcode: true,
      rejectCall: true,
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: true,
      readStatus: true,
      syncFullHistory: true,
    }

    if (token) payload.token = token

    const res = await client().post('/instance/create', payload)
    return normalizeEvolutionSession(res.data?.instance ?? { instanceName: name, state: 'qrcode' })
  } catch (error: unknown) {
    if (getHttpStatus(error) === 403) {
      const sessions = await listSessions()
      const existing = sessions.find((session) => session.id === name)
      if (existing) return existing
    }

    throw error
  }
}

export async function startSession(id: string): Promise<WhatsAppSession> {
  // GET /instance/connect/{instance} — inicia conexión y devuelve pairingCode/code para QR
  await client().get(`/instance/connect/${id}`)
  // Después de conectar, consultamos el estado real
  return getConnectionState(id)
}

export async function stopSession(id: string): Promise<void> {
  await client().delete(`/instance/logout/${id}`)
}

export async function deleteSession(id: string): Promise<void> {
  await client().delete(`/instance/delete/${id}`)
}

/** GET /instance/connect/{instance} — obtiene el code/pairingCode para generar QR */
export async function getQRCode(id: string): Promise<{ qrCode: string; pairingCode?: string }> {
  const res = await client().get<{ pairingCode?: string; code?: string; count?: number; base64?: string; qrcode?: string }>(`/instance/connect/${id}`)
  return {
    qrCode: res.data.code ?? res.data.base64 ?? res.data.qrcode ?? '',
    pairingCode: res.data.pairingCode,
  }
}

// Messages
export async function getMessages(
  sessionId: string,
  chatId?: string,
  limit = 50,
  offset = 0,
): Promise<WhatsAppMessage[]> {
  if (!chatId) return []

  const res = await client().post<EvolutionFindMessagesResponse>(`/chat/findMessages/${sessionId}`, {
    where: { key: { remoteJid: chatId } },
    limit,
    offset,
  })
  return res.data.messages?.records?.map(normalizeEvolutionMessage) ?? []
}

export async function sendText(
  sessionId: string,
  chatId: string,
  text: string,
): Promise<{ messageId: string; timestamp: number }> {
  const res = await client().post<EvolutionMessageResponse>(`/message/sendText/${sessionId}`, {
    number: chatId,
    text,
  })
  return normalizeMessageResult(res.data)
}

export async function sendDocument(
  sessionId: string,
  chatId: string,
  payload: { url?: string; base64?: string; mimetype?: string; filename?: string; caption?: string },
): Promise<{ messageId: string; timestamp: number }> {
  const res = await client().post<EvolutionMessageResponse>(`/message/sendMedia/${sessionId}`, {
    number: chatId,
    mediatype: 'document',
    mimetype: payload.mimetype ?? 'application/pdf',
    caption: payload.caption ?? '',
    media: getMediaPayload(payload),
    fileName: payload.filename ?? 'document.pdf',
  })
  return normalizeMessageResult(res.data)
}

export async function replyToMessage(
  sessionId: string,
  chatId: string,
  _messageId: string,
  text: string,
): Promise<{ messageId: string; timestamp: number }> {
  return sendText(sessionId, chatId, text)
}

export async function sendBulk(
  sessionId: string,
  recipients: string[],
  text: string,
): Promise<{ batchId: string }> {
  const results = await Promise.all(recipients.map((recipient) => sendText(sessionId, recipient, text)))
  return { batchId: results.map((result) => result.messageId).filter(Boolean).join(',') }
}

// Contacts
export async function listContacts(sessionId: string): Promise<WhatsAppContact[]> {
  const res = await client().post<EvolutionContactData[] | { contacts?: EvolutionContactData[] }>(
    `/chat/findContacts/${sessionId}`,
    {},
  )
  const contacts = Array.isArray(res.data) ? res.data : res.data.contacts ?? []
  return contacts.map(normalizeEvolutionContact).filter((contact): contact is WhatsAppContact => contact !== null)
}

export async function checkNumber(sessionId: string, number: string): Promise<boolean> {
  try {
    const res = await client().post<EvolutionCheckNumberResponse[] | EvolutionCheckNumberResponse>(
      `/chat/whatsappNumbers/${sessionId}`,
      { numbers: [number] },
    )
    const result = Array.isArray(res.data) ? res.data[0] : res.data
    return result?.exists ?? result?.numberExists ?? result?.canReceiveMessage ?? false
  } catch {
    return false
  }
}

// Stats
export async function getStatsOverview(): Promise<Record<string, unknown>> {
  return {}
}

export async function getSessionStats(sessionId: string): Promise<Record<string, unknown>> {
  return { sessionId }
}

const whatsappService = {
  listSessions,
  getSession,
  createSession,
  startSession,
  stopSession,
  deleteSession,
  getQRCode,
  getMessages,
  sendText,
  sendDocument,
  replyToMessage,
  sendBulk,
  listContacts,
  checkNumber,
  getStatsOverview,
  getSessionStats,
}

export default whatsappService
