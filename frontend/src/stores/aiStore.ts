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

  /**
   * Actualiza el texto del placeholder "pensando..." con el paso actual del agente.
   * Permite mostrar progreso en tiempo real (streaming SSE).
   */
  updateThinkingText: (id: string, text: string) => void

  /** Reemplaza el placeholder con la respuesta real del asistente */
  resolveAssistantMessage: (id: string, response: AIChatResponse) => void

  /** Agrega un mensaje de asistente local sin request backend */
  addAssistantMessage: (content: string) => ChatMessage

  /** Marca el mensaje de error si el request falló */
  resolveErrorMessage: (id: string, errorText: string) => void

  /** Limpia el historial completo (solo en memoria) */
  clear: () => void

  /** Carga el historial desde PostgreSQL y lo restaura en el store */
  loadFromDB: () => Promise<void>

  /** Limpia el historial en PostgreSQL + en memoria */
  clearFromDB: () => Promise<void>

  /** Suma un producto al carrito virtual del agente */
  addProductToQuoteCart: (product: AIMatchedProduct, qty?: number) => void

  /** Agrega múltiples productos al carrito de una vez (usado por cart_action de Luci) */
  addMultipleToQuoteCart: (items: { product: AIMatchedProduct; qty: number }[]) => void

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

  updateThinkingText: (id, text) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id && m.isThinking
          ? { ...m, thinkingText: text }
          : m,
      ),
    }))
  },

  resolveAssistantMessage: (id, response) => {
    set((s) => ({
      isThinking: false,
      messages: s.messages.map((m) =>
        m.id === id
          ? ({
              ...m,
              content: response.text,
              response_type: response.response_type,
              products: response.products,
              quote: response.quote,
              isThinking: false,
            } as ChatMessage)
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

  loadFromDB: async () => {
    try {
      const { default: aiService } = await import('../api/aiService')
      const history = await aiService.loadHistory()
      if (!history.length) return

      const { nanoid } = await import('nanoid')
      const messages: ChatMessage[] = history.map((h: any) => ({
        id:            nanoid(),
        role:          h.role as 'user' | 'assistant',
        content:       h.content,
        response_type: h.response_type ?? (h.products ? 'products' : 'text'),
        products:      h.products ?? undefined,
        quote:         h.quote ?? undefined,
        timestamp:     Date.now(),
        isThinking:    false,
      }))

      set({ messages })
    } catch (e) {
      console.warn('[aiStore] No se pudo cargar historial:', e)
    }
  },

  clearFromDB: async () => {
    try {
      const { default: aiService } = await import('../api/aiService')
      await aiService.clearHistory()
    } catch (e) {
      console.warn('[aiStore] No se pudo limpiar historial remoto:', e)
    }
    set({ messages: [], quoteCart: [], isThinking: false })
  },

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

  addMultipleToQuoteCart: (items) =>
    set((s) => {
      let cart = [...s.quoteCart]
      for (const { product, qty } of items) {
        const existing = cart.find((c) => c.product.id === product.id)
        if (existing) {
          cart = cart.map((c) =>
            c.product.id === product.id ? { ...c, qty: c.qty + qty } : c,
          )
        } else {
          cart.push({ product, qty })
        }
      }
      return { quoteCart: cart }
    }),

  clearQuoteCart: () => set({ quoteCart: [] }),

  getHistoryForAPI: (limit = 10) => {
    const { messages } = get()
    // Excluir mensajes isThinking y tomar los últimos N mensajes reales
    const real = messages.filter((m) => !m.isThinking)
    return real.slice(-limit).map((m) => {
      const base: Record<string, unknown> = { role: m.role }

      if (
        m.role === 'assistant' &&
        m.response_type === 'products' &&
        Array.isArray(m.products) &&
        m.products.length > 0
      ) {
        // Incluir products como campo separado (para add_to_cart y refinement)
        // Y también en el content como [PRODUCT_CONTEXT] (compatibilidad)
        base.content = `${m.content}\n[PRODUCT_CONTEXT] ${m.products
          .map((p) => `${p.code}:${p.description}:${p.sale_price ?? ''}`)
          .join(' || ')}`
        base.products = m.products.map((p) => ({
          id: p.id, code: p.code, description: p.description,
          sale_price: p.sale_price, unit: p.unit,
        }))
      } else {
        base.content = m.content
      }

      return base as { role: string; content: string; products?: unknown[] }
    })
  },
}))
