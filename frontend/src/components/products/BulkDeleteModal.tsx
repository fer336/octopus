/**
 * Modal de confirmación para borrado masivo de productos.
 * Requiere doble confirmación para evitar eliminaciones accidentales.
 */
import { useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { Modal, Button } from '../ui'

interface BulkDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  totalProducts: number
}

export default function BulkDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  totalProducts,
}: BulkDeleteModalProps) {
  // State
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Handlers
  const handleClose = () => {
    setStep(1)
    setConfirmText('')
    onClose()
  }

  const handleFirstConfirm = () => {
    setStep(2)
  }

  const handleFinalConfirm = async () => {
    try {
      setIsDeleting(true)
      await onConfirm()
      handleClose()
    } finally {
      setIsDeleting(false)
    }
  }

  const isConfirmTextValid = confirmText.toUpperCase() === 'ELIMINAR TODO'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" size="md">
      <div className="space-y-6">
        {/* Header con icono de advertencia */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {step === 1 ? '¿Eliminar Todos los Productos?' : 'Confirmación Final'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {step === 1
              ? 'Esta acción afectará a todos los productos de tu inventario'
              : 'Esta acción NO se puede deshacer'}
          </p>
        </div>

        {/* Step 1: Primera advertencia */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Información de productos a eliminar */}
            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 dark:text-red-200 mb-2">
                    Se eliminarán {totalProducts} productos
                  </h3>
                  <ul className="text-sm text-red-800 dark:text-red-300 space-y-1 list-disc list-inside">
                    <li>Todos los productos serán marcados como eliminados</li>
                    <li>Los productos no aparecerán en el inventario</li>
                    <li>Esta acción puede revertirse desde la base de datos</li>
                    <li>Se recomienda hacer un backup antes de continuar</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Recordatorio de backup */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-600 dark:bg-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">i</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-blue-900 dark:text-blue-200 font-medium mb-1">
                    Recomendación
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    Si no has hecho un backup, te recomendamos usar el botón{' '}
                    <span className="font-semibold">"Backup Completo"</span> antes de continuar.
                  </p>
                </div>
              </div>
            </div>

            {/* Botones Step 1 */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                <X size={18} className="mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handleFirstConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Confirmación final con texto */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Advertencia final */}
            <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-2 border-red-300 dark:border-red-600 rounded-lg p-4">
              <h3 className="font-bold text-red-900 dark:text-red-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Última advertencia
              </h3>
              <p className="text-sm text-red-800 dark:text-red-300 mb-4">
                Estás a punto de eliminar{' '}
                <span className="font-bold text-lg">{totalProducts} productos</span> de forma
                permanente. Esta acción marcará todos los productos como eliminados.
              </p>
              <div className="bg-white/50 dark:bg-black/20 rounded p-3 border border-red-200 dark:border-red-700">
                <p className="text-xs text-red-900 dark:text-red-200 font-mono">
                  ⚠️ Los productos eliminados no aparecerán en el inventario
                  <br />
                  ⚠️ Pueden recuperarse desde la base de datos si es necesario
                  <br />
                  ⚠️ Se recomienda tener un backup actualizado
                </p>
              </div>
            </div>

            {/* Input de confirmación */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Para confirmar, escribe{' '}
                <span className="font-bold text-red-600 dark:text-red-400">ELIMINAR TODO</span>
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="ELIMINAR TODO"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-red-500 focus:border-red-500
                         placeholder-gray-400 dark:placeholder-gray-500"
                autoFocus
              />
              {confirmText && !isConfirmTextValid && (
                <p className="text-red-500 text-xs mt-1">
                  El texto debe ser exactamente "ELIMINAR TODO"
                </p>
              )}
            </div>

            {/* Botones Step 2 */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1)
                  setConfirmText('')
                }}
                className="flex-1"
                disabled={isDeleting}
              >
                <X size={18} className="mr-2" />
                Volver
              </Button>
              <Button
                onClick={handleFinalConfirm}
                disabled={!isConfirmTextValid || isDeleting}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 
                         text-white disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} className="mr-2" />
                    Eliminar Todo
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Progress indicator */}
        <div className="flex justify-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              step === 1 ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          />
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              step === 2 ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          />
        </div>
      </div>
    </Modal>
  )
}
