/**
 * Bottom sheet for the mobile AI assistant, triggered by the header sparkles
 * button. Calls the real `aiService.chat` (non-streaming variant — same
 * service `AIAssistantPanel.tsx` already uses on desktop, just without the
 * SSE "thinking" progress UI, which isn't part of the mobile hifi handoff).
 * User messages append immediately; the assistant reply appends on
 * resolution; a rejection surfaces a visible error bubble instead of an
 * indefinite pending state.
 */
import { useState } from 'react'
import { Sparkles, X, ArrowUp } from 'lucide-react'
import aiService from '../../api/aiService'

interface AIAssistantSheetProps {
  open: boolean
  onClose: () => void
}

interface AIMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  error?: boolean
}

const SUGGESTED_CHIPS = ['¿Qué productos tienen poco stock?', '¿Cuánto vendí hoy?', 'Buscar un producto']

let nextId = 0

export default function AIAssistantSheet({ open, onClose }: AIAssistantSheetProps) {
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [input, setInput] = useState('')

  if (!open) return null

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const history = messages.map((m) => ({ role: m.role, content: m.text }))
    setMessages((prev) => [...prev, { id: nextId++, role: 'user', text: trimmed }])
    setInput('')

    try {
      const response = await aiService.chat(trimmed, history, undefined)
      setMessages((prev) => [...prev, { id: nextId++, role: 'assistant', text: response.text }])
    } catch (err: unknown) {
      const detail = (err as { message?: string })?.message || 'No pude procesar tu consulta. Probá de nuevo.'
      setMessages((prev) => [...prev, { id: nextId++, role: 'assistant', text: detail, error: true }])
    }
  }

  return (
    <div
      data-testid="ai-sheet-host"
      role="dialog"
      aria-label="Asistente IA"
      className="fixed inset-x-0 bottom-0 z-[400] flex max-h-[78%] flex-col overflow-hidden rounded-t-[26px] bg-[#f5f2fa]"
    >
      <div className="p-[16px_18px_12px] text-white" style={{ background: 'linear-gradient(140deg,#2f1d4d,#5c3a8c)' }}>
        <div className="flex items-center gap-[10px]">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px]" style={{ background: 'rgba(255,255,255,.16)' }}>
            <Sparkles size={19} strokeWidth={1.8} />
          </div>
          <div className="flex-1">
            <p className="font-display text-base font-extrabold">Asistente IA</p>
            <p className="text-[11px] text-white/70">Consultá precios y stock al instante</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
            style={{ background: 'rgba(255,255,255,.14)' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[11px] overflow-y-auto p-[16px_16px_8px]">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.error ? (
              <div
                role="alert"
                className="max-w-[82%] rounded-2xl border border-red-200 bg-red-50 p-[11px_13px] text-[11.5px] leading-relaxed text-red-700"
              >
                {m.text}
              </div>
            ) : (
              <div
                className="max-w-[82%] rounded-2xl p-[11px_13px] text-[11.5px] leading-relaxed"
                style={
                  m.role === 'user'
                    ? { background: '#7c5ca8', color: '#fff' }
                    : { background: '#fff', color: '#121325' }
                }
              >
                {m.text}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto p-[4px_14px_8px]">
        {SUGGESTED_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => send(chip)}
            className="flex-none rounded-full border border-[#ece6f6] bg-white px-3 py-2 text-xs font-semibold text-[#5c3a8c]"
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-[9px] p-[8px_14px_26px]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send(input)
          }}
          placeholder="Escribí tu consulta…"
          className="h-[46px] flex-1 rounded-[14px] border border-[#e7e0f2] bg-white px-[14px] text-[11.5px] text-[#121325] outline-none"
        />
        <button
          type="button"
          onClick={() => send(input)}
          aria-label="Enviar"
          className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px]"
          style={{ background: 'linear-gradient(140deg,#7c5ca8,#5c3a8c)', boxShadow: '0 6px 14px rgba(92,58,140,.35)' }}
        >
          <ArrowUp size={20} color="#fff" />
        </button>
      </div>
    </div>
  )
}
