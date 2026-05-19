import { create } from 'zustand'
import type { WhatsAppSession, WhatsAppMessage, WhatsAppContact } from '../types/whatsapp'

interface MessagingState {
  sessions: WhatsAppSession[]
  activeSessionId: string | null
  activeChat: string | null
  contacts: WhatsAppContact[]
  messages: Record<string, WhatsAppMessage[]>

  setSessions: (sessions: WhatsAppSession[]) => void
  upsertSession: (session: WhatsAppSession) => void
  setActiveSessionId: (id: string | null) => void
  setActiveChat: (chatId: string | null) => void
  setContacts: (contacts: WhatsAppContact[]) => void
  setMessages: (chatId: string, messages: WhatsAppMessage[]) => void
  appendMessage: (chatId: string, message: WhatsAppMessage) => void
  getActiveSession: () => WhatsAppSession | null
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeChat: null,
  contacts: [],
  messages: {},

  setSessions: (sessions) => set({ sessions }),

  upsertSession: (session) =>
    set((state) => {
      const existing = state.sessions.findIndex((s) => s.id === session.id)
      if (existing >= 0) {
        const updated = [...state.sessions]
        updated[existing] = session
        return { sessions: updated }
      }
      return { sessions: [...state.sessions, session] }
    }),

  setActiveSessionId: (id) => set({ activeSessionId: id }),

  setActiveChat: (chatId) => set({ activeChat: chatId }),

  setContacts: (contacts) => set({ contacts }),

  setMessages: (chatId, messages) =>
    set((state) => ({ messages: { ...state.messages, [chatId]: messages } })),

  appendMessage: (chatId, message) =>
    set((state) => {
      const current = state.messages[chatId] ?? []
      const already = current.some((m) => m.id === message.id)
      if (already) return {}
      return { messages: { ...state.messages, [chatId]: [...current, message] } }
    }),

  getActiveSession: () => {
    const { sessions, activeSessionId } = get()
    return sessions.find((s) => s.id === activeSessionId) ?? null
  },
}))
