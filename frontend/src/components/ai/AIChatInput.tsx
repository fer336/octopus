/**
 * Input del chat del Asistente IA.
 * Soporta texto + adjuntos (imagen/camara, audio, PDF/DOCX).
 */
import { useRef, useState, useCallback } from 'react'
import { Camera, Mic, Paperclip, Send, Square, X } from 'lucide-react'

interface AIChatInputProps {
  isThinking: boolean
  onSend: (message: string, file?: File | null) => Promise<void> | void
}

export default function AIChatInput({ isThinking, onSend }: AIChatInputProps) {
  const [message, setMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRecording, setIsRecording] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const hasPayload = !!message.trim() || !!selectedFile

  const handleSend = useCallback(async () => {
    if (!hasPayload || isThinking) return

    const msg = message.trim()
    const file = selectedFile
    setMessage('')
    setSelectedFile(null)

    await onSend(msg, file)
  }, [hasPayload, isThinking, message, onSend, selectedFile])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const audioFile = new File([audioBlob], `audio-${Date.now()}.webm`, {
          type: 'audio/webm',
        })
        setSelectedFile(audioFile)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch {
      setIsRecording(false)
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2">
      {selectedFile && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 px-2.5 py-1.5">
          <span className="text-xs text-cyan-700 dark:text-cyan-300 truncate flex-1">
            {selectedFile.name}
          </span>
          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            className="text-cyan-600 hover:text-cyan-800 dark:hover:text-cyan-200 transition-colors"
            aria-label="Quitar archivo"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
          rows={1}
          placeholder="Escribí tu mensaje..."
          className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="p-2 rounded-lg text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors"
            aria-label="Adjuntar imagen"
          >
            <Camera size={16} />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors"
            aria-label="Adjuntar archivo"
          >
            <Paperclip size={16} />
          </button>

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={
              isRecording
                ? 'p-2 rounded-lg text-red-500 bg-red-50 dark:bg-red-900/20 transition-colors'
                : 'p-2 rounded-lg text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors'
            }
            aria-label={isRecording ? 'Detener grabacion' : 'Grabar audio'}
          >
            {isRecording ? <Square size={16} /> : <Mic size={16} />}
          </button>

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!hasPayload || isThinking}
            className="p-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-600 hover:to-blue-600 transition-all"
            aria-label="Enviar mensaje"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}
