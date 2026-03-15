/**
 * Store Zustand del Asistente IA de Chat.
 * Gestiona el estado del panel lateral y el historial de conversación.
 *
 * El historial persiste en memoria durante la sesión (se pierde al recargar).
 * NO usa persist() de Zustand — decisión intencional para privacidad.
 */
import { create } from 'zustand'
import { ChatMessage, AIChatResponse, AIMatchedProduct, AIQuoteCartItem } from '../types'

// Generador de IDs únicos para mensajes (sin dependencia externa)
const nanoid = () => Math.random().toString(36).slice(2, 11)

interface AIState {
  // ── Estado del panel ──────────────────────────────────────
  isOpen: boolean
  isThinking: boolean

  // ── Historial de conversación ─────────────────────────────
  messages: ChatMessage[]
  quoteCart: AIQuoteCartItem[]

  // ── Acciones del panel ────────────────────────────────────
  toggle: () => void
  open: () => void
  close: () => void

  // ── Acciones del chat ─────────────────────────────────────

  /** Agrega el mensaje del usuario al historial */
  addUserMessage: (content: string) => ChatMessage

  /** Agrega el placeholder "pensando..." del asistente */
  addThinkingMessage: () => string   // retorna el id para reemplazarlo después

  /** Reemplaza el placeholder con la respuesta real del asistente */
  resolveAssistantMessage: (id: string, response: AIChatResponse) => void

  /** Agrega un mensaje de asistente local sin request backend */
  addAssistantMessage: (content: string) => ChatMessage

  /** Marca el mensaje de error si el request falló */
  resolveErrorMessage: (id: string, errorText: string) => void

  /** Limpia el historial completo */
  clear: () => void

  /** Suma un producto al carrito virtual del agente */
  addProductToQuoteCart: (product: AIMatchedProduct, qty?: number) => void

  /** Limpia carrito virtual del agente */
  clearQuoteCart: () => void

  setThinking: (v: boolean) => void

  /** Retorna los últimos N mensajes en formato {role, content} para el backend */
  getHistoryForAPI: (limit?: number) => { role: string; content: string }[]
}

export const useAIStore = create<AIState>((set, get) => ({
  // ── Estado inicial ─────────────────────────────────────────
  isOpen: false,
  isThinking: false,
  messages: [],
  quoteCart: [],

  // ── Panel ──────────────────────────────────────────────────
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open:   () => set({ isOpen: true }),
  close:  () => set({ isOpen: false }),
  setThinking: (v) => set({ isThinking: v }),

  // ── Chat ───────────────────────────────────────────────────
  addUserMessage: (content) => {
    const msg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content,
      response_type: 'text',
      timestamp: Date.now(),
    }
    set((s) => ({ messages: [...s.messages, msg] }))
    return msg
  },

  addThinkingMessage: () => {
    const id = nanoid()
    const msg: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      response_type: 'text',
      timestamp: Date.now(),
      isThinking: true,
    }
    set((s) => ({ messages: [...s.messages, msg], isThinking: true }))
    return id
  },

  resolveAssistantMessage: (id, response) => {
    set((s) => ({
      isThinking: false,
      messages: s.messages.map((m) =>
        m.id === id
          ? {
              ...m,
              content: response.text,
              response_type: response.response_type,
              products: response.products,
              quote: response.quote,
              isThinking: false,
            }
          : m,
      ),
    }))
  },

  addAssistantMessage: (content) => {
    const msg: ChatMessage = {
      id: nanoid(),
      role: 'assistant',
      content,
      response_type: 'text',
      timestamp: Date.now(),
    }
    set((s) => ({ messages: [...s.messages, msg] }))
    return msg
  },

  resolveErrorMessage: (id, errorText) => {
    set((s) => ({
      isThinking: false,
      messages: s.messages.map((m) =>
        m.id === id
          ? { ...m, content: errorText, isThinking: false }
          : m,
      ),
    }))
  },

  clear: () => set({ messages: [], isThinking: false, quoteCart: [] }),

  addProductToQuoteCart: (product, qty = 1) =>
    set((s) => {
      const existing = s.quoteCart.find((item) => item.product.id === product.id)
      if (existing) {
        return {
          quoteCart: s.quoteCart.map((item) =>
            item.product.id === product.id
              ? { ...item, qty: item.qty + qty }
              : item,
          ),
        }
      }

      return {
        quoteCart: [...s.quoteCart, { product, qty }],
      }
    }),

  clearQuoteCart: () => set({ quoteCart: [] }),

  getHistoryForAPI: (limit = 10) => {
    const { messages } = get()
    // Excluir mensajes isThinking y tomar los últimos N mensajes reales
    const real = messages.filter((m) => !m.isThinking)
    return real.slice(-limit).map((m) => ({
      role: m.role,
      content:
        m.role === 'assistant' &&
        m.response_type === 'products' &&
        Array.isArray(m.products) &&
        m.products.length > 0
          ? `${m.content}\n[PRODUCT_CONTEXT] ${m.products
              .map((p) => `${p.code}:${p.description}:${p.sale_price ?? ''}`)
              .join(' || ')}`
          : m.content,
    }))
  },
}))
