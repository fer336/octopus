import { getWhatsAppClient } from './client'
import type { WhatsAppSession, WhatsAppMessage, WhatsAppContact } from '../../types/whatsapp'

function client() {
  return getWhatsAppClient()
}

// Sessions
export async function listSessions(): Promise<WhatsAppSession[]> {
  const res = await client().get('/api/sessions')
  return res.data
}

export async function getSession(id: string): Promise<WhatsAppSession> {
  const res = await client().get(`/api/sessions/${id}`)
  return res.data
}

export async function createSession(name: string): Promise<WhatsAppSession> {
  const res = await client().post('/api/sessions', { name })
  return res.data
}

export async function startSession(id: string): Promise<WhatsAppSession> {
  const res = await client().post(`/api/sessions/${id}/start`)
  return res.data
}

export async function stopSession(id: string): Promise<void> {
  await client().post(`/api/sessions/${id}/stop`)
}

export async function deleteSession(id: string): Promise<void> {
  await client().delete(`/api/sessions/${id}`)
}

export async function getQRCode(id: string): Promise<{ qrCode: string; status: string }> {
  const res = await client().get(`/api/sessions/${id}/qr`)
  return res.data
}

// Messages
export async function getMessages(
  sessionId: string,
  chatId?: string,
  limit = 50,
  offset = 0,
): Promise<WhatsAppMessage[]> {
  const params: Record<string, unknown> = { limit, offset }
  if (chatId) params.chatId = chatId
  const res = await client().get(`/api/sessions/${sessionId}/messages`, { params })
  return Array.isArray(res.data) ? res.data : res.data?.messages ?? []
}

export async function sendText(
  sessionId: string,
  chatId: string,
  text: string,
): Promise<{ messageId: string; timestamp: number }> {
  const res = await client().post(`/api/sessions/${sessionId}/messages/send-text`, { chatId, text })
  return res.data
}

export async function sendDocument(
  sessionId: string,
  chatId: string,
  payload: { url?: string; base64?: string; mimetype?: string; filename?: string; caption?: string },
): Promise<{ messageId: string; timestamp: number }> {
  const res = await client().post(`/api/sessions/${sessionId}/messages/send-document`, {
    chatId,
    ...payload,
  })
  return res.data
}

export async function replyToMessage(
  sessionId: string,
  chatId: string,
  messageId: string,
  text: string,
): Promise<{ messageId: string; timestamp: number }> {
  const res = await client().post(`/api/sessions/${sessionId}/messages/reply`, {
    chatId,
    messageId,
    text,
  })
  return res.data
}

export async function sendBulk(
  sessionId: string,
  recipients: string[],
  text: string,
): Promise<{ batchId: string }> {
  const res = await client().post(`/api/sessions/${sessionId}/messages/send-bulk`, {
    recipients: recipients.map((r) => ({ chatId: r, text })),
  })
  return res.data
}

// Contacts
export async function listContacts(sessionId: string): Promise<WhatsAppContact[]> {
  const res = await client().get(`/api/sessions/${sessionId}/contacts`)
  return Array.isArray(res.data) ? res.data : res.data?.contacts ?? []
}

export async function checkNumber(sessionId: string, number: string): Promise<boolean> {
  try {
    const res = await client().get(`/api/sessions/${sessionId}/contacts/check/${number}`)
    return res.data?.exists ?? false
  } catch {
    return false
  }
}

// Stats
export async function getStatsOverview(): Promise<Record<string, unknown>> {
  const res = await client().get('/api/stats/overview')
  return res.data
}

export async function getSessionStats(sessionId: string): Promise<Record<string, unknown>> {
  const res = await client().get(`/api/stats/sessions/${sessionId}`)
  return res.data
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
