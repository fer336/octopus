/**
 * Burbuja de mensaje del chat del Asistente IA.
 * Renderiza mensajes del usuario y del asistente con soporte de Markdown.
 */
import ReactMarkdown from 'react-markdown'
import { Bot, User } from 'lucide-react'
import { ChatMessage, AIMatchedProduct } from '../../types'
import AIProductCard from './AIProductCard'
import AIQuoteCard from './AIQuoteCard'

/** Renderiza texto con Markdown — negritas, cursivas, listas, etc. */
function MarkdownText({ content }: { content: string }) {
  // Ocultar el marcador [MULTI_CONTEXT] que es solo para el historial interno
  // Ocultar marcadores internos — [MULTI_CONTEXT] y [QUOTE_INTENT] son solo para el historial
  const clean = content
    .split('[MULTI_CONTEXT]')[0]
    .split('[QUOTE_INTENT]')[0]
    .trimEnd()

  return (
    <ReactMarkdown
      components={{
        // Párrafos
        p: ({ children }) => (
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed mb-1 last:mb-0">
            {children}
          </p>
        ),
        // Negrita
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900 dark:text-white">
            {children}
          </strong>
        ),
        // Cursiva
        em: ({ children }) => (
          <em className="italic text-gray-700 dark:text-gray-300">{children}</em>
        ),
        // Listas no ordenadas
        ul: ({ children }) => (
          <ul className="my-1 space-y-0.5 pl-1">{children}</ul>
        ),
        li: ({ children }) => (
          <li className="text-sm text-gray-800 dark:text-gray-200 flex gap-1.5 leading-relaxed">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
            <span>{children}</span>
          </li>
        ),
        // Listas ordenadas
        ol: ({ children }) => (
          <ol className="my-1 space-y-0.5 pl-1 list-decimal list-inside">{children}</ol>
        ),
        // Código inline
        code: ({ children }) => (
          <code className="text-xs bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5 font-mono">
            {children}
          </code>
        ),
      }}
    >
      {clean}
    </ReactMarkdown>
  )
}

interface AIChatMessageProps {
  message: ChatMessage
  /** Callback cuando el usuario elige cotizar un producto desde una card */
  onQuoteProduct?: (product: AIMatchedProduct) => void
}

/** Indicador de progreso del agente mientras procesa (streaming SSE) */
function ThinkingIndicator({ text }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {/* Tres puntos animados */}
      <span className="inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
      </span>
      {/* Texto del paso actual — aparece cuando el backend emite eventos SSE */}
      {text && (
        <span className="text-xs text-gray-400 dark:text-gray-500 italic animate-pulse">
          {text}
        </span>
      )}
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
        {/* Estado "pensando" — muestra el paso actual del agente en streaming */}
        {message.isThinking ? (
          <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3.5 py-2.5 shadow-sm inline-block max-w-full">
            <ThinkingIndicator text={message.thinkingText} />
          </div>
        ) : (
          <>
            {/* Texto de respuesta con Markdown */}
            {message.content && (
              <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 px-3.5 py-2.5 shadow-sm mb-2">
                <MarkdownText content={message.content} />
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
