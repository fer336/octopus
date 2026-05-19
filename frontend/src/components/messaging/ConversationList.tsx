import { useEffect, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { listContacts } from '../../api/whatsapp/service'
import { useMessagingStore } from '../../stores/messagingStore'
import type { WhatsAppContact } from '../../types/whatsapp'

interface Props {
  sessionId: string
}

function contactInitials(contact: WhatsAppContact): string {
  const name = contact.name || contact.pushname || contact.number
  return name.slice(0, 2).toUpperCase()
}

function contactDisplayName(contact: WhatsAppContact): string {
  return contact.name || contact.pushname || contact.number
}

export default function ConversationList({ sessionId }: Props) {
  const { contacts, setContacts, activeChat, setActiveChat } = useMessagingStore()
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    listContacts(sessionId)
      .then((data) => {
        setContacts(data)
        setError(null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Error al cargar contactos'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [sessionId, setContacts])

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase()
    return (
      (c.name?.toLowerCase().includes(q) ||
        c.pushname?.toLowerCase().includes(q) ||
        c.number?.includes(q)) ??
      false
    )
  })

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500 text-center">
        <p>{error}</p>
        <button
          onClick={() => listContacts(sessionId).then(setContacts)}
          className="mt-2 text-primary-600 hover:underline text-xs"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contacto..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-none rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
            <Users className="w-8 h-8" />
            <p className="text-sm">No hay contactos</p>
          </div>
        ) : (
          filtered.map((contact) => (
            <button
              key={contact.id}
              onClick={() => setActiveChat(contact.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                activeChat === contact.id
                  ? 'bg-primary-50 dark:bg-primary-900/20 border-r-2 border-primary-600'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                {contact.profilePicUrl ? (
                  <img
                    src={contact.profilePicUrl}
                    alt={contactDisplayName(contact)}
                    className="w-10 h-10 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                    {contactInitials(contact)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {contactDisplayName(contact)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {contact.number}
                  {contact.isGroup && ' · Grupo'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
