/**
 * Toast de aprendizaje del Agente IA.
 * Aparece cuando el usuario corrige un match con baja confianza.
 * Pregunta si quiere guardar el término para mejorar futuros matches.
 */
import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import toast from 'react-hot-toast'
import aiService from '../../api/aiService'

interface AILearnToastProps {
  productId: string
  productName: string
  term: string
  onDismiss: () => void
}

export default function AILearnToast({
  productId,
  productName,
  term,
  onDismiss,
}: AILearnToastProps) {
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await aiService.learnTerm(productId, term)
      toast.success(`"${term}" guardado como término de búsqueda`, {
        icon: '🧠',
        duration: 3000,
      })
    } catch {
      toast.error('No se pudo guardar el término.')
    } finally {
      setIsSaving(false)
      onDismiss()
    }
  }

  return (
    // Overlay para el toast
    <div className="absolute bottom-20 left-4 right-4 z-10">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Sparkles size={14} className="text-cyan-500" />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              ¿Guardar este término?
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Mensaje */}
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
          ¿Querés que el sistema recuerde que{' '}
          <span className="font-semibold text-gray-900 dark:text-white">"{term}"</span>{' '}
          corresponde a{' '}
          <span className="font-semibold text-gray-900 dark:text-white">"{productName}"</span>{' '}
          para la próxima vez?
        </p>

        {/* Botones */}
        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="flex-1 py-2 rounded-xl text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            No, gracias
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 transition-all"
          >
            {isSaving ? 'Guardando...' : 'Sí, guardar'}
          </button>
        </div>

        {/* Nota al pie */}
        <p className="text-xs text-center text-gray-400 mt-2">
          Se agregará a los términos del cliente del producto
        </p>
      </div>
    </div>
  )
}
