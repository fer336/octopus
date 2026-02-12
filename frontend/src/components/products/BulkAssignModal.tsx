/**
 * Modal para asignar categoría y/o proveedor en lote a productos seleccionados.
 */
import { useState } from 'react'
import { Tag, Package, Check, X } from 'lucide-react'
import { Modal, Button } from '../ui'

interface Category {
  id: string
  name: string
}

interface Supplier {
  id: string
  name: string
}

interface BulkAssignModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (categoryId: string | null, supplierId: string | null) => void
  selectedCount: number
  categories: Category[]
  suppliers: Supplier[]
}

export default function BulkAssignModal({
  isOpen,
  onClose,
  onConfirm,
  selectedCount,
  categories,
  suppliers,
}: BulkAssignModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')

  const handleConfirm = () => {
    onConfirm(
      selectedCategory || null,
      selectedSupplier || null
    )
    handleClose()
  }

  const handleClose = () => {
    setSelectedCategory('')
    setSelectedSupplier('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Asignar en Lote" size="md">
      <div className="space-y-6">
        {/* Información */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center justify-center">
              <Tag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                Asignar a {selectedCount} {selectedCount === 1 ? 'producto' : 'productos'}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Selecciona la categoría y/o proveedor para aplicar
              </p>
            </div>
          </div>
        </div>

        {/* Selectores */}
        <div className="space-y-4">
          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Categoría
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            >
              <option value="">Sin cambios</option>
              <option value="__remove__">🗑️ Quitar categoría</option>
              <optgroup label="Categorías disponibles">
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Selecciona "Sin cambios" para no modificar las categorías existentes
            </p>
          </div>

          {/* Proveedor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Proveedor
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            >
              <option value="">Sin cambios</option>
              <option value="__remove__">🗑️ Quitar proveedor</option>
              <optgroup label="Proveedores disponibles">
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Selecciona "Sin cambios" para no modificar los proveedores existentes
            </p>
          </div>
        </div>

        {/* Preview de cambios */}
        {(selectedCategory || selectedSupplier) && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
            <p className="text-sm font-medium text-green-900 dark:text-green-200 mb-2">
              Cambios a aplicar:
            </p>
            <ul className="text-xs text-green-800 dark:text-green-300 space-y-1">
              {selectedCategory && (
                <li className="flex items-center gap-2">
                  <Check size={14} />
                  Categoría: {
                    selectedCategory === '__remove__' 
                      ? 'Quitar categoría' 
                      : categories.find(c => c.id === selectedCategory)?.name || 'Seleccionada'
                  }
                </li>
              )}
              {selectedSupplier && (
                <li className="flex items-center gap-2">
                  <Check size={14} />
                  Proveedor: {
                    selectedSupplier === '__remove__'
                      ? 'Quitar proveedor'
                      : suppliers.find(s => s.id === selectedSupplier)?.name || 'Seleccionado'
                  }
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            <X size={18} className="mr-2" />
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedCategory && !selectedSupplier}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            <Check size={18} className="mr-2" />
            Aplicar Cambios
          </Button>
        </div>
      </div>
    </Modal>
  )
}
