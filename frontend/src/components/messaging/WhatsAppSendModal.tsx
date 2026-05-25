import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare, Loader2, Search, Phone, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { sendDocument, sendText, listSessions } from '../../api/whatsapp/service'
import { useMessagingStore } from '../../stores/messagingStore'
import clientsService, { type Client } from '../../api/clientsService'

export interface PdfSpec {
  getPdfBlob: () => Promise<Blob>
  filename?: string
  caption?: string
  mimetype?: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  // Single file
  getPdfBlob?: () => Promise<Blob>
  filename?: string
  caption?: string
  mimetype?: string
  // Multiple files (bulk mode) — takes priority if provided
  pdfs?: PdfSpec[]
  defaultClientId?: string
}

type Mode = 'manual' | 'client'

function digitsOnly(s: string) {
  return s.replace(/\D/g, '')
}

function buildWhatsAppId(raw: string): string {
  const d = digitsOnly(raw)
  if (!d) return ''
  if (d.startsWith('549') && d.length >= 12) return `${d}@c.us`
  if (d.startsWith('54') && d.length >= 11) return `549${d.slice(2)}@c.us`
  if (d.startsWith('0') && d.length >= 10) return `549${d.slice(1)}@c.us`
  if (d.length >= 8) return `549${d}@c.us`
  return ''
}

function isValidArgentina(raw: string): boolean {
  const d = digitsOnly(raw)
  if (!d) return false
  if (d.startsWith('549') && d.length === 13) return true
  if (d.startsWith('54') && d.length === 12) return true
  if (d.startsWith('0') && d.length === 10) return true
  if (d.length === 10) return true
  return false
}

function formatDisplay(raw: string): string {
  const d = digitsOnly(raw)
  if (!d) return ''
  let local = d
  if (local.startsWith('549')) local = local.slice(3)
  else if (local.startsWith('54')) local = local.slice(2)
  else if (local.startsWith('0')) local = local.slice(1)
  if (local.length >= 10) {
    const area = local.slice(0, 2)
    const p1 = local.slice(2, 6)
    const p2 = local.slice(6, 10)
    return `+54 9 ${area} ${p1}-${p2}`
  }
  return `+54 9 ${local}`
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function defaultFilename(mimetype?: string): string {
  if (mimetype?.includes('spreadsheet')) return 'reporte.xlsx'
  if (mimetype?.includes('pdf')) return 'documento.pdf'
  return 'archivo.pdf'
}

export default function WhatsAppSendModal({
  isOpen,
  onClose,
  getPdfBlob,
  filename,
  caption,
  mimetype,
  pdfs,
  defaultClientId,
}: Props) {
  const { activeSessionId: storeSessionId, setSessions, setActiveSessionId } = useMessagingStore()
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    if (storeSessionId) {
      setResolvedSessionId(storeSessionId)
      return
    }
    listSessions()
      .then((sessions) => {
        const ready = sessions.find((s) => s.status === 'ready')
        if (ready) {
          setSessions(sessions)
          setActiveSessionId(ready.id)
          setResolvedSessionId(ready.id)
        }
      })
      .catch(() => null)
  }, [isOpen, storeSessionId, setSessions, setActiveSessionId])

  const activeSessionId = resolvedSessionId

  const [mode, setMode] = useState<Mode>('manual')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [loadingClients, setLoadingClients] = useState(false)
  const [sending, setSending] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setPhone('')
      setMessage('')
      setClientSearch('')
      setSelectedClient(null)
      setClients([])
      setShowDropdown(false)
      setSending(false)
      setMode('manual')
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && defaultClientId && mode === 'client') {
      clientsService.getById(defaultClientId).then(setSelectedClient).catch(() => null)
    }
  }, [isOpen, defaultClientId, mode])

  useEffect(() => {
    if (mode !== 'client') return
    if (!clientSearch.trim()) {
      setClients([])
      setShowDropdown(false)
      return
    }
    const timer = setTimeout(async () => {
      setLoadingClients(true)
      try {
        const result = await clientsService.getAll({ search: clientSearch.trim(), per_page: 10 })
        setClients(result.items)
        setShowDropdown(true)
      } catch {
        setClients([])
      } finally {
        setLoadingClients(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [clientSearch, mode])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!isOpen) return null

  function selectClient(c: Client) {
    setSelectedClient(c)
    setClientSearch('')
    setShowDropdown(false)
  }

  function clearClient() {
    setSelectedClient(null)
    setClientSearch('')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function getRecipientPhone(): string {
    if (mode === 'manual') return phone
    return selectedClient?.phone || ''
  }

  const recipientPhone = getRecipientPhone()
  const chatId = buildWhatsAppId(recipientPhone)
  const valid = !!chatId && isValidArgentina(recipientPhone)

  function resolveMimetype(file?: PdfSpec): string {
    return file?.mimetype ?? mimetype ?? 'application/pdf'
  }

  function resolveFilename(file?: PdfSpec): string {
    return file?.filename ?? filename ?? defaultFilename(resolveMimetype(file))
  }

  async function handleSend() {
    if (!activeSessionId) {
      toast.error('No hay sesión de WhatsApp activa. Abrí el CRM y conectá tu cuenta.')
      return
    }
    if (!valid) {
      toast.error('El número no es válido para Argentina (+54)')
      return
    }

    setSending(true)
    try {
      const pdfList: PdfSpec[] = pdfs ?? (getPdfBlob ? [{ getPdfBlob, filename, caption, mimetype }] : [])

      if (message.trim()) {
        await sendText(activeSessionId, chatId, message.trim())
      }

      for (const file of pdfList) {
        const blob = await file.getPdfBlob()
        const base64 = await blobToBase64(blob)
        await sendDocument(activeSessionId, chatId, {
          base64,
          mimetype: resolveMimetype(file),
          filename: resolveFilename(file),
          caption: file.caption,
        })
      }

      const label = mode === 'client' && selectedClient
        ? selectedClient.name
        : formatDisplay(recipientPhone)
      const count = pdfList.length
      toast.success(
        count > 1
          ? `Mensaje y ${count} archivos enviados a ${label} por WhatsApp`
          : `Archivo enviado a ${label} por WhatsApp`,
      )
      onClose()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) toast.error('API key de WhatsApp inválida')
      else toast.error('No se pudo enviar por WhatsApp')
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Enviar por WhatsApp</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Solo números de Argentina (+54)</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === 'manual'
                  ? 'bg-green-50 border-green-400 text-green-700 dark:bg-green-900/20 dark:border-green-600 dark:text-green-300'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Phone className="w-4 h-4" />
              Número manual
            </button>
            <button
              onClick={() => setMode('client')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === 'client'
                  ? 'bg-green-50 border-green-400 text-green-700 dark:bg-green-900/20 dark:border-green-600 dark:text-green-300'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <User className="w-4 h-4" />
              Cliente registrado
            </button>
          </div>

          {/* Manual phone input */}
          {mode === 'manual' && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Número de WhatsApp
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 select-none">
                  +54 9
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="11 1234 5678"
                  autoFocus
                  className={`w-full pl-14 pr-3 py-2.5 text-sm border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-colors ${
                    phone && !valid
                      ? 'border-red-400 focus:ring-red-300 dark:border-red-500'
                      : valid
                      ? 'border-green-400 focus:ring-green-300 dark:border-green-600'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-green-300'
                  }`}
                  onKeyDown={(e) => e.key === 'Enter' && valid && handleSend()}
                />
              </div>
              {phone && (
                <p className={`text-xs ${valid ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {valid ? `Válido → ${formatDisplay(phone)}` : 'Formato inválido — ejemplo: 11 1234 5678'}
                </p>
              )}
            </div>
          )}

          {/* Client selector */}
          {mode === 'client' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Buscar cliente
              </label>

              {selectedClient ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{selectedClient.name}</p>
                    {selectedClient.phone ? (
                      <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">{formatDisplay(selectedClient.phone)}</p>
                    ) : (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">Sin teléfono registrado</p>
                    )}
                  </div>
                  <button
                    onClick={clearClient}
                    className="text-xs text-gray-500 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative" ref={dropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Nombre o CUIT del cliente..."
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-300"
                    />
                    {loadingClients && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
                    )}
                  </div>

                  {showDropdown && clients.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {clients.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => selectClient(c)}
                          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{c.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {c.phone ? formatDisplay(c.phone) : 'Sin teléfono'} · {c.document_number}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {showDropdown && !loadingClients && clients.length === 0 && clientSearch.trim() && (
                    <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg px-3 py-2.5">
                      <p className="text-sm text-gray-500 dark:text-gray-400">No se encontraron clientes</p>
                    </div>
                  )}
                </div>
              )}

              {selectedClient && !selectedClient.phone && (
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Este cliente no tiene teléfono. Editalo en la sección de Clientes primero.
                </p>
              )}
            </div>
          )}

          {/* Message */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Mensaje <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej: Hola! Te mando el comprobante. Cualquier consulta avisame."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
            />
            <p className="text-xs text-gray-400">Se envía primero el mensaje y luego el archivo.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !valid}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 dark:disabled:bg-green-900/50 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
