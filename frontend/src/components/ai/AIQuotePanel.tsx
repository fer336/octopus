/**
 * Panel del Agente IA de Presupuestos.
 * Se abre como un bottom sheet desde el botón IA del Header.
 * Permite ingresar el presupuesto en cualquier formato:
 * imagen, audio, PDF, DOCX o texto libre.
 */
import { useState, useRef, useCallback } from 'react'
import {
  Camera,
  Mic,
  FileText,
  Keyboard,
  Sparkles,
  X,
  Upload,
  Square,
  Loader2,
} from 'lucide-react'
import { AIParseQuoteResponse } from '../../types'
import aiService from '../../api/aiService'
import AIQuoteReview from './AIQuoteReview'

interface AIQuotePanelProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 'input' | 'loading' | 'review'

// Pasos del procesamiento para mostrar progreso
const PROCESSING_STEPS = [
  { key: 'ingesta', label: 'Ingesta' },
  { key: 'extraccion', label: 'Extracción' },
  { key: 'matching', label: 'Matching' },
  { key: 'validacion', label: 'Validación' },
]

export default function AIQuotePanel({ isOpen, onClose }: AIQuotePanelProps) {
  const [step, setStep] = useState<Step>('input')
  const [textInput, setTextInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [currentProcessingStep, setCurrentProcessingStep] = useState(0)
  const [result, setResult] = useState<AIParseQuoteResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // ── Grabación de audio ─────────────────────────────────────────
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
        const audioFile = new File([audioBlob], 'grabacion.webm', { type: 'audio/webm' })
        setSelectedFile(audioFile)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch {
      setError('No se pudo acceder al micrófono. Verificá los permisos del navegador.')
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  // ── Envío al agente IA ────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!selectedFile && !textInput.trim()) {
      setError('Seleccioná un archivo o escribí el texto del presupuesto.')
      return
    }

    setError(null)
    setStep('loading')
    setCurrentProcessingStep(0)

    // Simular progreso de los pasos del grafo (el backend no emite SSE aún)
    const stepInterval = setInterval(() => {
      setCurrentProcessingStep((prev) => {
        if (prev < PROCESSING_STEPS.length - 1) return prev + 1
        clearInterval(stepInterval)
        return prev
      })
    }, 2500)

    try {
      const response = await aiService.parseQuote(selectedFile, textInput)
      clearInterval(stepInterval)
      setCurrentProcessingStep(PROCESSING_STEPS.length - 1)
      setResult(response)
      setStep('review')
    } catch (err: unknown) {
      clearInterval(stepInterval)
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Error al conectar con el agente de IA.'
      setError(msg)
      setStep('input')
    }
  }, [selectedFile, textInput])

  // ── Reset del panel ────────────────────────────────────────────
  const handleReset = () => {
    setStep('input')
    setSelectedFile(null)
    setTextInput('')
    setResult(null)
    setError(null)
    setCurrentProcessingStep(0)
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Panel — bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Handle drag indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header del panel */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Sparkles size={18} className="text-cyan-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Agente de Presupuestos IA
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Subí tu presupuesto en cualquier formato
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido según el paso actual */}
        <div className="overflow-y-auto flex-1">
          {step === 'input' && (
            <InputStep
              textInput={textInput}
              setTextInput={setTextInput}
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              isRecording={isRecording}
              startRecording={startRecording}
              stopRecording={stopRecording}
              fileInputRef={fileInputRef}
              imageInputRef={imageInputRef}
              error={error}
              onAnalyze={handleAnalyze}
            />
          )}

          {step === 'loading' && (
            <LoadingStep currentStep={currentProcessingStep} />
          )}

          {step === 'review' && result && (
            <AIQuoteReview
              result={result}
              onBack={handleReset}
              onClose={handleClose}
            />
          )}
        </div>
      </div>

      {/* Inputs de archivo ocultos */}
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
    </>
  )
}

// ── Sub-componente: Pantalla de entrada ───────────────────────
interface InputStepProps {
  textInput: string
  setTextInput: (v: string) => void
  selectedFile: File | null
  setSelectedFile: (f: File | null) => void
  isRecording: boolean
  startRecording: () => void
  stopRecording: () => void
  fileInputRef: React.RefObject<HTMLInputElement>
  imageInputRef: React.RefObject<HTMLInputElement>
  error: string | null
  onAnalyze: () => void
}

function InputStep({
  textInput,
  setTextInput,
  selectedFile,
  setSelectedFile,
  isRecording,
  startRecording,
  stopRecording,
  fileInputRef,
  imageInputRef,
  error,
  onAnalyze,
}: InputStepProps) {
  const inputCards = [
    {
      icon: <Camera size={28} className="text-cyan-500" />,
      title: 'Foto / Imagen',
      subtitle: 'JPG, PNG desde la cámara',
      onClick: () => imageInputRef.current?.click(),
    },
    {
      icon: isRecording ? (
        <Square size={28} className="text-red-500 animate-pulse" />
      ) : (
        <Mic size={28} className="text-cyan-500" />
      ),
      title: isRecording ? 'Grabando...' : 'Audio',
      subtitle: isRecording ? 'Tocá para detener' : 'Grabá tu voz',
      onClick: isRecording ? stopRecording : startRecording,
      active: isRecording,
    },
    {
      icon: <FileText size={28} className="text-cyan-500" />,
      title: 'PDF / Doc',
      subtitle: 'Subí un archivo',
      onClick: () => fileInputRef.current?.click(),
    },
    {
      icon: <Keyboard size={28} className="text-cyan-500" />,
      title: 'Texto libre',
      subtitle: 'Escribí el pedido',
      onClick: () => {
        const textarea = document.getElementById('ai-text-input')
        textarea?.focus()
      },
    },
  ]

  const hasInput = selectedFile || textInput.trim()

  return (
    <div className="p-5 space-y-5">
      {/* Cards de entrada — grilla 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        {inputCards.map((card) => (
          <button
            key={card.title}
            onClick={card.onClick}
            className={`
              flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center
              ${card.active
                ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/10'
              }
            `}
          >
            {card.icon}
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {card.title}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {card.subtitle}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Archivo seleccionado */}
      {selectedFile && (
        <div className="flex items-center gap-2 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
          <Upload size={16} className="text-cyan-500 flex-shrink-0" />
          <span className="text-sm text-cyan-700 dark:text-cyan-300 truncate flex-1">
            {selectedFile.name}
          </span>
          <button
            onClick={() => setSelectedFile(null)}
            className="text-cyan-500 hover:text-cyan-700 flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Textarea de texto libre */}
      <div>
        <textarea
          id="ai-text-input"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="O escribí directamente: ej. 5 roscas PP 3/4, 2 caños blancos 1/2, 1 llave paso 1/2..."
          rows={4}
          className="w-full px-3 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Botón principal */}
      <button
        onClick={onAnalyze}
        disabled={!hasInput}
        className={`
          w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all
          ${hasInput
            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg shadow-cyan-500/30'
            : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
          }
        `}
      >
        <Sparkles size={18} />
        Analizar con IA
      </button>

      <p className="text-xs text-center text-gray-400">
        El agente detectará los productos automáticamente y los comparará con tu catálogo
      </p>
    </div>
  )
}

// ── Sub-componente: Pantalla de carga ─────────────────────────
function LoadingStep({ currentStep }: { currentStep: number }) {
  return (
    <div className="p-8 flex flex-col items-center gap-8">
      {/* Ícono animado */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
          <Sparkles size={36} className="text-cyan-500 animate-pulse" />
        </div>
        <div className="absolute inset-0 rounded-full border-2 border-cyan-400 animate-ping opacity-30" />
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Analizando presupuesto...
        </h3>
        <p className="text-sm text-gray-500">El agente IA está procesando tu archivo</p>
      </div>

      {/* Barra de pasos */}
      <div className="w-full space-y-3">
        {PROCESSING_STEPS.map((s, idx) => {
          const isDone = idx < currentStep
          const isActive = idx === currentStep

          return (
            <div key={s.key} className="flex items-center gap-3">
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                  ${isDone ? 'bg-cyan-500' : isActive ? 'bg-cyan-100 dark:bg-cyan-900/40' : 'bg-gray-100 dark:bg-gray-800'}
                `}
              >
                {isDone ? (
                  <span className="text-white text-xs font-bold">✓</span>
                ) : isActive ? (
                  <Loader2 size={14} className="text-cyan-500 animate-spin" />
                ) : (
                  <span className="text-gray-400 text-xs">{idx + 1}</span>
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  isDone
                    ? 'text-cyan-600 dark:text-cyan-400'
                    : isActive
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
