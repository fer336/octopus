/**
 * Modal para asignar un proveedor a todos los productos importados sin proveedor.
 */
import { useState } from 'react'
import { AlertTriangle, PackageCheck, X } from 'lucide-react'
import { Button, Modal } from '../ui'

interface SupplierOption {
  id: string
  name: string
}

export interface SupplierAssignment {
  id?: string
  name: string
}

interface SupplierRequiredModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (supplier: SupplierAssignment) => void
  suppliers: SupplierOption[]
  affectedCount: number
}

export default function SupplierRequiredModal({
  isOpen,
  onClose,
  onConfirm,
  suppliers,
  affectedCount,
}: SupplierRequiredModalProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [newSupplierName, setNewSupplierName] = useState('')

  const handleClose = () => {
    setSelectedSupplierId('')
    setNewSupplierName('')
    onClose()
  }

  const handleConfirm = () => {
    const trimmedName = newSupplierName.trim()

    if (trimmedName) {
      onConfirm({ name: trimmedName })
      handleClose()
      return
    }

    const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId)
    if (!selectedSupplier) return

    onConfirm({ id: selectedSupplier.id, name: selectedSupplier.name })
    handleClose()
  }

  const canConfirm = newSupplierName.trim().length > 0 || selectedSupplierId.length > 0

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Asignar proveedor faltante" size="md">
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <p className="text-sm font-semibold">
              Hay {affectedCount} producto{affectedCount === 1 ? '' : 's'} sin proveedor.
            </p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              El proveedor elegido se aplicará a TODOS los productos sin proveedor de la lista.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Proveedor existente
          </label>
          <select
            value={selectedSupplierId}
            onChange={(event) => {
              setSelectedSupplierId(event.target.value)
              if (event.target.value) setNewSupplierName('')
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          >
            <option value="">Seleccionar proveedor...</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span className="px-3 text-xs font-medium uppercase tracking-wide text-gray-400">o</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nuevo proveedor
          </label>
          <input
            type="text"
            value={newSupplierName}
            onChange={(event) => {
              setNewSupplierName(event.target.value)
              if (event.target.value.trim()) setSelectedSupplierId('')
            }}
            placeholder="Ej: Distribuidora Sanitaria"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Si ingresás un nombre nuevo, se creará al confirmar la importación.
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button variant="outline" onClick={handleClose}>
            <X size={16} className="mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            <PackageCheck size={16} className="mr-2" />
            Aplicar proveedor
          </Button>
        </div>
      </div>
    </Modal>
  )
}
