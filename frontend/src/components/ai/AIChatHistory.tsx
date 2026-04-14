/**
 * Lista scrollable de mensajes del chat del Asistente IA.
 * Hace auto-scroll al último mensaje cuando hay mensajes nuevos.
 * Muestra un estado vacío cuando no hay mensajes.
 */
import { useEffect, useRef } from 'react'
import { Bot } from 'lucide-react'
import { ChatMessage, AIMatchedProduct } from '../../types'
import AIChatMessage from './AIChatMessage'

interface AIChatHistoryProps {
  messages: ChatMessage[]
  /** Callback para cuando el usuario quiere cotizar un producto desde una card */
  onQuoteProduct?: (product: AIMatchedProduct) => void
}

/** Pantalla de bienvenida cuando no hay mensajes */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[260px] h-full px-6 text-center select-none">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-400 flex items-center justify-center mb-4 shadow-lg shadow-primary-500/20">
        <Bot size={28} className="text-white" />
      </div>
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
        Asistente IA
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        Consultá precios, stock o pedime que arme un presupuesto.
      </p>
      <div className="mt-5 space-y-2 w-full max-w-xs">
        {[
          '¿Cuánto sale el caño 3/4"?',
          'Stock de cinta teflón',
          'Presupuesto: 10 codos, 5 llaves',
        ].map((example) => (
          <div
            key={example}
            className="px-3 py-2 rounded-xl text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          >
            {example}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AIChatHistory({ messages, onQuoteProduct }: AIChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll cuando llega un mensaje nuevo
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.isThinking])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3 scroll-smooth">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {messages.map((msg) => (
            <AIChatMessage
              key={msg.id}
              message={msg}
              onQuoteProduct={onQuoteProduct}
            />
          ))}
          {/* Ancla para el auto-scroll */}
          <div ref={bottomRef} className="h-1" />
        </>
      )}
    </div>
  )
}
