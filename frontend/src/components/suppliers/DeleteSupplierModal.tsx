/**
 * Modal de confirmación para eliminar proveedor.
 * Diseño profesional siguiendo react-modern-ui patterns.
 */
import { useState } from 'react'
import { AlertTriangle, Trash2, X, Package } from 'lucide-react'
import { Modal, Button } from '../ui'

interface DeleteSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  supplierName: string
}

export default function DeleteSupplierModal({
  isOpen,
  onClose,
  onConfirm,
  supplierName,
}: DeleteSupplierModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    try {
      setIsDeleting(true)
      await onConfirm()
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="sm">
      <div className="space-y-6">
        {/* Icono de advertencia */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            ¿Eliminar Proveedor?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Esta acción no se puede deshacer
          </p>
        </div>

        {/* Información del proveedor */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Package className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-900 dark:text-red-200 font-medium mb-1">
                Se eliminará el proveedor:
              </p>
              <p className="text-base font-bold text-red-800 dark:text-red-300">
                "{supplierName}"
              </p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                Los productos asociados a este proveedor quedarán sin proveedor asignado.
              </p>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1"
          >
            <X size={18} className="mr-2" />
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white disabled:from-gray-400 disabled:to-gray-500"
          >
            {isDeleting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Eliminando...
              </>
            ) : (
              <>
                <Trash2 size={18} className="mr-2" />
                Eliminar
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
