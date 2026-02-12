/**
 * Modal de progreso de importación.
 * Muestra una barra de progreso mientras se importan los productos.
 */
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { Modal } from '../ui'

interface ImportProgressModalProps {
  isOpen: boolean
  progress: number // 0-100
  currentItem?: number
  totalItems?: number
  status: 'importing' | 'success' | 'error'
  errorMessage?: string
  message?: string
}

export default function ImportProgressModal({
  isOpen,
  progress,
  currentItem = 0,
  totalItems = 0,
  status,
  errorMessage,
  message,
}: ImportProgressModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="" size="sm">
      <div className="space-y-6">
        {/* Icono central */}
        <div className="flex flex-col items-center text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
            status === 'success' 
              ? 'bg-green-100 dark:bg-green-900/30' 
              : status === 'error'
              ? 'bg-red-100 dark:bg-red-900/30'
              : 'bg-blue-100 dark:bg-blue-900/30'
          }`}>
            {status === 'importing' && (
              <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-spin" />
            )}
            {status === 'success' && (
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            )}
            {status === 'error' && (
              <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
            )}
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {status === 'importing' && 'Importando Productos...'}
            {status === 'success' && '¡Importación Completada!'}
            {status === 'error' && 'Error en la Importación'}
          </h2>
          
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {status === 'importing' && (message || (totalItems && totalItems > 0 ? `Procesando ${currentItem} de ${totalItems} productos` : 'Procesando archivo...'))}
            {status === 'success' && (message || (totalItems && totalItems > 0 ? `${totalItems} productos importados correctamente` : 'Operación completada'))}
            {status === 'error' && (errorMessage || message || 'Ocurrió un error')}
          </p>
        </div>

        {/* Barra de progreso */}
        <div className="space-y-2">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                status === 'success'
                  ? 'bg-gradient-to-r from-green-500 to-green-600'
                  : status === 'error'
                  ? 'bg-gradient-to-r from-red-500 to-red-600'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>{Math.round(progress)}%</span>
            <span>{currentItem} / {totalItems}</span>
          </div>
        </div>

        {/* Detalles adicionales */}
        {status === 'importing' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
            <p className="text-xs text-blue-800 dark:text-blue-300 text-center">
              ⏳ Por favor espera mientras procesamos los datos...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
            <p className="text-xs text-green-800 dark:text-green-300 text-center">
              ✅ Todos los productos se importaron correctamente
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
