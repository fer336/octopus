/**
 * Panel lateral del Asistente IA.
 * Vive en el layout principal, se desplaza desde la derecha y mantiene
 * el historial de chat en sesión usando Zustand en memoria.
 */
import { Sparkles, X, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import aiService from '../../api/aiService'
import { AIMatchedProduct, AIDraftItem, AIChatResponse, ChatMessage } from '../../types'
import { useAIStore } from '../../stores/aiStore'
import { useSalesStore } from '../../stores/salesStore'
import AIChatHistory from './AIChatHistory'
import AIChatInput from './AIChatInput'

const safePrice = (value: unknown): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export default function AIAssistantPanel() {
  const navigate = useNavigate()
  const preloadItems = useSalesStore((s) => s.preloadItems)
  const {
    isOpen,
    isThinking,
    messages,
    quoteCart,
    close,
    clear,
    clearQuoteCart,
    addUserMessage,
    addAssistantMessage,
    addProductToQuoteCart,
    addThinkingMessage,
    resolveAssistantMessage,
    resolveErrorMessage,
    getHistoryForAPI,
  } = useAIStore()

  const handleSend = async (message: string, file?: File | null) => {
    const normalizedMessage = message.trim()
    const userMessage =
      normalizedMessage ||
      (file ? `Adjunto: ${file.name}` : '')

    if (!userMessage) {
      return
    }

    addUserMessage(userMessage)
    const thinkingId = addThinkingMessage()

    // Refinamiento local con contexto reciente de productos (sin round-trip backend)
    const localRefined = resolveLocalProductRefinement(normalizedMessage, useAIStore.getState().messages)
    if (localRefined) {
      resolveAssistantMessage(thinkingId, localRefined)
      return
    }

    try {
      const history = getHistoryForAPI(10)
      const response = await aiService.chat(normalizedMessage, history, file)
      resolveAssistantMessage(thinkingId, response)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'No pude procesar el mensaje. Probá de nuevo en unos segundos.'

      resolveErrorMessage(thinkingId, detail)
      toast.error(detail)
    }
  }

  const resolveLocalProductRefinement = (
    message: string,
    allMessages: ChatMessage[],
  ): AIChatResponse | null => {
    const lower = message.toLowerCase()
    const refinementKeywords = [
      'mas barato',
      'más barato',
      'mas baratos',
      'más baratos',
      'barato',
      'baratos',
      'economico',
      'económico',
      'mostrame',
      'mostra',
      'solo',
      'de esos',
      'de esas',
      'de los que me mostraste',
    ]
    const isRefinement =
      refinementKeywords.some((keyword) => lower.includes(keyword))

    if (!isRefinement) return null

    const lastProductsMessage = [...allMessages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.response_type === 'products' && Array.isArray(m.products) && m.products.length > 0)

    if (!lastProductsMessage?.products || lastProductsMessage.products.length === 0) {
      return null
    }

    const limitMatch = lower.match(/\b(\d{1,2})\b/)
    const limit = limitMatch ? Math.max(1, Math.min(Number(limitMatch[1]), 10)) : 5

    let products = [...lastProductsMessage.products]

    if (lower.includes('barato') || lower.includes('baratos') || lower.includes('economico') || lower.includes('económico')) {
      products.sort((a, b) => (a.sale_price ?? Number.MAX_SAFE_INTEGER) - (b.sale_price ?? Number.MAX_SAFE_INTEGER))
    } else if (lower.includes('caro') || lower.includes('caros') || lower.includes('premium')) {
      products.sort((a, b) => (b.sale_price ?? 0) - (a.sale_price ?? 0))
    }

    const sliced = products.slice(0, limit)
    if (sliced.length === 0) return null

    return {
      response_type: 'products',
      text: `Perfecto, te muestro ${sliced.length} opción${sliced.length !== 1 ? 'es' : ''} según tu filtro.`,
      products: sliced,
      quote: undefined,
    }
  }

  const handleQuoteProduct = (product: AIMatchedProduct) => {
    addProductToQuoteCart(product, 1)

    const state = useAIStore.getState()
    const totalItems = state.quoteCart.reduce((sum, item) => sum + item.qty, 0)
    const totalAmount = state.quoteCart.reduce(
      (sum, item) => sum + item.qty * safePrice(item.product.sale_price),
      0,
    )

    addUserMessage(`Cotizar: ${product.description} x1`)
    addAssistantMessage(
      `Listo, lo agregué al presupuesto virtual. ` +
      `Llevás ${totalItems} ítem${totalItems !== 1 ? 's' : ''} ` +
      `por $${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. ` +
      `Podés seguir agregando productos o tocar "Pasar a Ventas" cuando quieras cerrar.`,
    )
  }

  const handleSendToSales = () => {
    if (quoteCart.length === 0) return

    const draftItems: AIDraftItem[] = quoteCart.map((item) => ({
      item: {
        qty: item.qty,
        unit: item.product.unit,
        description: item.product.description,
        raw_original: `${item.product.description} x${item.qty}`,
      },
      product: item.product,
      confidence: 'HIGH',
      confidence_score: 1,
      alternatives: [],
      match_reason: 'selected_from_chat',
      qty: item.qty,
      unit_price: safePrice(item.product.sale_price),
      total: item.qty * safePrice(item.product.sale_price),
    }))

    try {
      sessionStorage.setItem('ai-sales-preload', JSON.stringify(draftItems))
    } catch {
      // no-op: best effort fallback
    }

    preloadItems(draftItems)
    close()
    navigate('/sales')
    toast.success('Carrito del asistente cargado en Ventas', { icon: '🛒' })
  }

  return (
    <aside
      className={`
        fixed right-0 top-16 bottom-0 z-30
        w-full sm:w-96
        border-l border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-900
        overflow-hidden
        shadow-2xl shadow-black/10
        transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}
      `}
      aria-hidden={!isOpen}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="h-14 shrink-0 px-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-sm">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                Asistente IA
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                Precios, stock y presupuestos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={clear}
              className="p-1.5 rounded-md text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors"
              aria-label="Limpiar historial"
              title="Limpiar historial"
            >
              <Trash2 size={14} />
            </button>

            <button
              onClick={close}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Cerrar asistente"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Historial */}
        <AIChatHistory
          messages={messages}
          onQuoteProduct={handleQuoteProduct}
        />

        {/* Input */}
        {quoteCart.length > 0 && (
          <div className="shrink-0 px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-cyan-50/70 dark:bg-cyan-900/10">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-cyan-800 dark:text-cyan-300">
                  Carrito virtual: {quoteCart.reduce((sum, item) => sum + item.qty, 0)} ítems · $
                {quoteCart
                  .reduce((sum, item) => sum + item.qty * safePrice(item.product.sale_price), 0)
                  .toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={clearQuoteCart}
                  className="text-[11px] px-2 py-1 rounded-md border border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100/70 dark:hover:bg-cyan-900/20 transition-colors"
                >
                  Limpiar
                </button>
                <button
                  onClick={handleSendToSales}
                  className="text-[11px] px-2 py-1 rounded-md bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600 transition-colors"
                >
                  Pasar a Ventas
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="shrink-0">
          <AIChatInput isThinking={isThinking} onSend={handleSend} />
        </div>
      </div>
    </aside>
  )
}
