/**
 * Burbuja de mensaje del chat del Asistente IA.
 * Renderiza mensajes del usuario y del asistente.
 * El asistente puede responder con texto, cards de producto o una cotización.
 */
import { Bot, User } from 'lucide-react'
import { ChatMessage, AIMatchedProduct } from '../../types'
import AIProductCard from './AIProductCard'
import AIQuoteCard from './AIQuoteCard'

interface AIChatMessageProps {
  message: ChatMessage
  /** Callback cuando el usuario elige cotizar un producto desde una card */
  onQuoteProduct?: (product: AIMatchedProduct) => void
}

/** Puntos animados mientras el asistente "piensa" */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
    </span>
  )
}

export default function AIChatMessage({ message, onQuoteProduct }: AIChatMessageProps) {
  const isUser = message.role === 'user'

  // ── Mensaje del usuario ──────────────────────────────────────
  if (isUser) {
    return (
      <div className="flex justify-end gap-2 px-3">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-cyan-500 to-blue-500 px-3.5 py-2.5 shadow-sm">
          <p className="text-sm text-white leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mt-1">
          <User size={14} className="text-gray-500 dark:text-gray-300" />
        </div>
      </div>
    )
  }

  // ── Mensaje del asistente ────────────────────────────────────
  return (
    <div className="flex gap-2 px-3">
      {/* Avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mt-1 shadow-sm">
        <Bot size={14} className="text-white" />
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0 max-w-[85%]">
        {/* Estado "pensando" */}
        {message.isThinking ? (
          <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3.5 py-2.5 shadow-sm inline-block">
            <ThinkingDots />
          </div>
        ) : (
          <>
            {/* Texto de respuesta (siempre presente en respuestas de texto y como intro en otras) */}
            {message.content && (
              <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3.5 py-2.5 shadow-sm mb-2">
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                  {message.content}
                </p>
              </div>
            )}

            {/* Cards de productos */}
            {message.response_type === 'products' && message.products && message.products.length > 0 && (
              <div className="space-y-2">
                {message.products.filter(Boolean).map((p) => (
                  <AIProductCard
                    key={p.id}
                    product={p as AIMatchedProduct & { stock?: number | null }}
                    showPrice={Object.prototype.hasOwnProperty.call(p, 'sale_price')}
                    showStock={Object.prototype.hasOwnProperty.call(p, 'stock')}
                    onQuote={onQuoteProduct}
                  />
                ))}
              </div>
            )}

            {/* Card de cotización */}
            {message.response_type === 'quote' && message.quote && (
              <AIQuoteCard quoteResponse={message.quote} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
