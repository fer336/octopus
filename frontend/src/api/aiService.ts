/**
 * Cliente HTTP para el Agente IA de Presupuestos.
 * Conecta con los endpoints /api/v1/ai/* del backend.
 */
import { AIParseQuoteResponse } from '../types'
import httpClient from './httpClient'

const AI_BASE = '/ai'

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
}

export default aiService
