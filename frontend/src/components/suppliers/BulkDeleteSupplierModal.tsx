/**
 * Modal de confirmación para eliminar múltiples proveedores.
 */
import { useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { Modal, Button } from '../ui'

interface BulkDeleteSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  count: number
}

export default function BulkDeleteSupplierModal({
  isOpen,
  onClose,
  onConfirm,
  count,
}: BulkDeleteSupplierModalProps) {
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
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
            ¿Eliminar proveedores seleccionados?
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Esta acción no se puede deshacer desde la interfaz.
          </p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <p className="mb-1 text-sm font-medium text-red-900 dark:text-red-200">
                Se eliminarán {count} proveedor{count === 1 ? '' : 'es'}.
              </p>
              <p className="text-xs text-red-700 dark:text-red-400">
                Los productos asociados conservarán internamente la referencia al proveedor eliminado,
                igual que en el borrado individual actual.
              </p>
            </div>
          </div>
        </div>

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
            disabled={isDeleting || count === 0}
            className="flex-1 bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 disabled:from-gray-400 disabled:to-gray-500"
          >
            {isDeleting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
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
