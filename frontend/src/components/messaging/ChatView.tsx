import { useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, Phone } from 'lucide-react'
import { getMessages } from '../../api/whatsapp/service'
import { useMessagingStore } from '../../stores/messagingStore'
import MessageBubble from './MessageBubble'
import MessageComposer from './MessageComposer'
import type { WhatsAppContact } from '../../types/whatsapp'

interface Props {
  sessionId: string
  chatId: string
  contact?: WhatsAppContact
  onBack?: () => void
}

const POLL_INTERVAL_MS = 5000

export default function ChatView({ sessionId, chatId, contact, onBack }: Props) {
  const { messages, setMessages, setActiveChat } = useMessagingStore()
  const chatMessages = messages[chatId] ?? []
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const data = await getMessages(sessionId, chatId, 50)
      setMessages(chatId, data)
    } catch {
      // silent — keep showing last known messages
    }
  }, [sessionId, chatId, setMessages])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages.length])

  const displayName = contact?.name || contact?.pushname || contact?.number || chatId

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {onBack && (
          <button
            onClick={() => { onBack(); setActiveChat(null) }}
            className="p-1 -ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 md:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
          {contact?.profilePicUrl ? (
            <img
              src={contact.profilePicUrl}
              alt={displayName}
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {displayName}
          </p>
          {contact?.number && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{contact.number}</p>
          )}
        </div>
        {contact?.number && (
          <a
            href={`tel:${contact.number}`}
            className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
            title="Llamar"
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5 bg-gray-50 dark:bg-gray-900"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(0 0 0 / 0.04) 1px, transparent 0)',
          backgroundSize: '20px 20px',
        }}
      >
        {chatMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">No hay mensajes aún</p>
          </div>
        ) : (
          chatMessages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      <MessageComposer sessionId={sessionId} chatId={chatId} />
    </div>
  )
}
