import { FileText, Image, Video, Mic, MapPin, User } from 'lucide-react'
import type { WhatsAppMessage, MessageType } from '../../types/whatsapp'

interface Props {
  message: WhatsAppMessage
}

const typeIcons: Record<MessageType, React.ElementType | null> = {
  document: FileText,
  image: Image,
  video: Video,
  audio: Mic,
  location: MapPin,
  contact: User,
  sticker: null,
  text: null,
  unknown: null,
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function MessageBubble({ message }: Props) {
  const Icon = typeIcons[message.type]
  const isMedia = message.type !== 'text' && message.type !== 'unknown'

  return (
    <div className={`flex ${message.fromMe ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
          message.fromMe
            ? 'bg-primary-600 text-white rounded-tr-sm'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-sm border border-gray-100 dark:border-gray-600'
        }`}
      >
        {isMedia && (
          <div className={`flex items-center gap-2 mb-1 ${message.fromMe ? 'text-primary-100' : 'text-gray-500 dark:text-gray-400'}`}>
            {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
            <span className="text-xs font-medium truncate max-w-[200px]">
              {message.filename || message.type}
            </span>
          </div>
        )}

        {message.body && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {message.caption && message.caption !== message.body && (
          <p className={`text-xs mt-1 ${message.fromMe ? 'text-primary-100' : 'text-gray-500 dark:text-gray-400'}`}>
            {message.caption}
          </p>
        )}

        <p
          className={`text-[10px] mt-1 text-right ${
            message.fromMe ? 'text-primary-200' : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  )
}
