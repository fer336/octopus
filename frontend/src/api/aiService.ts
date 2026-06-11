/**
 * Cliente HTTP para el Agente IA de Presupuestos.
 * Conecta con los endpoints /api/tenant/ai/* del backend.
 */
import { AIParseQuoteResponse, AIChatResponse } from '../types'
import httpClient, { getTenantApiUrl } from './httpClient'

// ── Tipos de eventos SSE del stream ────────────────────────────
export type AIStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'result'; response_type: string; text: string; products?: unknown; quote?: unknown }
  | { type: 'error'; text: string }

const AI_BASE = '/ai'

// Obtiene la URL base de la API — exactamente igual que httpClient.ts
// para garantizar que fetch y axios apunten al mismo host.
function getApiBase(): string {
  return getTenantApiUrl()
}

const aiService = {
  /**
   * Envía un archivo o texto al agente IA para analizar el presupuesto.
   * El backend corre el grafo LangGraph en un hilo separado.
   *
   * @param file    Archivo (imagen, audio, PDF, DOCX) — opcional si se envía text
   * @param text    Texto libre del presupuesto — opcional si se envía file
   * @returns       Draft con ítems matcheados y niveles de confianza
   */
  parseQuote: async (
    file?: File | null,
    text?: string
  ): Promise<AIParseQuoteResponse> => {
    const formData = new FormData()

    if (file) {
      formData.append('file', file)
    }
    if (text?.trim()) {
      formData.append('text', text.trim())
    }

    const response = await httpClient.post<AIParseQuoteResponse>(
      `${AI_BASE}/parse-quote`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        // El agente puede tardar hasta 60s en procesar archivos grandes
        timeout: 90_000,
      }
    )
    return response.data
  },

  /**
   * Guarda un término aprendido en el campo customer_terms del producto.
   * Se llama cuando el usuario corrige un match y confirma querer guardar.
   */
  learnTerm: async (productId: string, term: string): Promise<void> => {
    await httpClient.patch(`${AI_BASE}/learn-term`, {
      product_id: productId,
      term,
    })
  },

  /**
   * Envía un mensaje al asistente IA de chat.
   * El backend clasifica la intención y responde con el tipo apropiado:
   * - "text"     → respuesta conversacional general
   * - "products" → lista de productos del catálogo encontrados
   * - "quote"    → draft de cotización con semáforo de confianza
   *
   * @param message  Mensaje actual del usuario
   * @param history  Últimos N mensajes del historial [{role, content}]
   * @param file     Archivo adjunto opcional (imagen, audio, PDF, DOCX)
   */
  chat: async (
    message: string,
    history: { role: string; content: string }[],
    file?: File | null,
  ): Promise<AIChatResponse> => {
    const formData = new FormData()
    formData.append('message', message)
    formData.append('history', JSON.stringify(history.slice(-10)))

    if (file) {
      formData.append('file', file)
    }

    const response = await httpClient.post<AIChatResponse>(
      `${AI_BASE}/chat`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 90_000,
      },
    )
    return response.data
  },

  /**
   * Carga el historial de conversación guardado en PostgreSQL.
   * Se llama al abrir el panel para restaurar el contexto de sesiones anteriores.
   */
  loadHistory: async (): Promise<{ role: string; content: string; products?: unknown[] }[]> => {
    const { data } = await httpClient.get<{ history: { role: string; content: string; products?: unknown[] }[] }>(
      `${AI_BASE}/history`
    )
    return data.history ?? []
  },

  /**
   * Limpia el historial de conversación en PostgreSQL.
   * Se llama cuando el usuario toca "Limpiar" en el panel.
   */
  clearHistory: async (): Promise<void> => {
    await httpClient.delete(`${AI_BASE}/history`)
  },

  /**
   * Guarda toda la conversación en Engram.
   * Se llama automáticamente al cerrar el panel del asistente.
   */
  saveConversation: async (
    messages: { role: string; content: string }[],
  ): Promise<void> => {
    try {
      await httpClient.post(`${AI_BASE}/chat/save-conversation`, { messages })
    } catch (e) {
      console.warn('[aiService] No se pudo guardar conversación en Engram:', e)
    }
  },

  /**
   * Versión streaming de chat(). Usa fetch nativo + ReadableStream para leer
   * eventos SSE del endpoint /ai/chat/stream.
   *
   * Llama a `onEvent` por cada evento SSE recibido:
   * - {type: "thinking", text: "..."} → paso actual del agente
   * - {type: "result", ...}           → respuesta final completa
   * - {type: "error", text: "..."}    → error del agente
   *
   * @param message  Mensaje actual del usuario
   * @param history  Historial de la conversación
   * @param onEvent  Callback que recibe cada evento SSE
   * @param file     Archivo adjunto opcional
   */
  chatStream: async (
    message: string,
    history: { role: string; content: string }[],
    onEvent: (event: AIStreamEvent) => void | Promise<void>,
    file?: File | null,
  ): Promise<void> => {
    const formData = new FormData()
    formData.append('message', message)
    formData.append('history', JSON.stringify(history.slice(-10)))

    if (file) {
      formData.append('file', file)
    }

    // Obtener el JWT del store de auth (Zustand)
    // Usamos el mismo mecanismo que httpClient pero con fetch nativo para SSE
    const { useAuthStore } = await import('../stores/authStore')
    const token = useAuthStore.getState().accessToken

    const url = `${getApiBase()}${AI_BASE}/chat/stream`

    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(90_000),
    })

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}))
      throw new Error(errorBody?.detail ?? `Error ${res.status} del servidor`)
    }

    if (!res.body) {
      throw new Error('El servidor no devolvió un stream.')
    }

    // Leer el stream línea a línea
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Procesar líneas completas del buffer
      const lines = buffer.split('\n')
      // La última línea puede estar incompleta → la devolvemos al buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr) continue

        try {
          const event = JSON.parse(jsonStr) as AIStreamEvent
          await onEvent(event)
        } catch {
          // Ignorar líneas SSE malformadas
        }
      }
    }
  },
}

export default aiService
