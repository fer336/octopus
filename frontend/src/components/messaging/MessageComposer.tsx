import { useRef, useState } from 'react'
import { Send, Paperclip, X, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { sendText, sendDocument } from '../../api/whatsapp/service'
import { useMessagingStore } from '../../stores/messagingStore'
import type { WhatsAppMessage } from '../../types/whatsapp'

interface Props {
  sessionId: string
  chatId: string
}

interface PendingFile {
  name: string
  base64: string
  mimetype: string
}

export default function MessageComposer({ sessionId, chatId }: Props) {
  const { appendMessage } = useMessagingStore()
  const [text, setText] = useState('')
  const [file, setFile] = useState<PendingFile | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      setFile({ name: selected.name, base64, mimetype: selected.type })
    }
    reader.readAsDataURL(selected)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSend() {
    if (!text.trim() && !file) return
    setSending(true)

    try {
      if (file) {
        const res = await sendDocument(sessionId, chatId, {
          base64: file.base64,
          mimetype: file.mimetype,
          filename: file.name,
          caption: text.trim() || undefined,
        })
        const optimistic: WhatsAppMessage = {
          id: res.messageId,
          chatId,
          fromMe: true,
          body: text.trim() || file.name,
          type: 'document',
          timestamp: res.timestamp,
          filename: file.name,
          mimetype: file.mimetype,
          caption: text.trim() || undefined,
        }
        appendMessage(chatId, optimistic)
        setFile(null)
        setText('')
      } else {
        const res = await sendText(sessionId, chatId, text.trim())
        const optimistic: WhatsAppMessage = {
          id: res.messageId,
          chatId,
          fromMe: true,
          body: text.trim(),
          type: 'text',
          timestamp: res.timestamp,
        }
        appendMessage(chatId, optimistic)
        setText('')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al enviar'
      toast.error(msg)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
      {file && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300">
          <FileText className="w-4 h-4 text-primary-500 flex-shrink-0" />
          <span className="truncate flex-1">{file.name}</span>
          <button
            onClick={() => setFile(null)}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex-shrink-0"
          title="Adjuntar archivo"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.mp4,.mp3"
          onChange={handleFileChange}
          className="hidden"
        />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={file ? 'Agregar caption (opcional)...' : 'Escribí un mensaje...'}
          rows={1}
          className="flex-1 resize-none px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 max-h-32"
          style={{ minHeight: '40px' }}
        />

        <button
          onClick={handleSend}
          disabled={sending || (!text.trim() && !file)}
          className="p-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          title="Enviar"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
