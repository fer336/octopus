/**
 * Modal para editar campos específicos en lote.
 * Permite cambiar precio, descuentos, stock, etc. en múltiples productos a la vez.
 */
import { useState } from 'react'
import { Edit2, Check, X } from 'lucide-react'
import { Modal, Button } from '../ui'

interface Category {
  id: string
  name: string
}

interface Supplier {
  id: string
  name: string
}

interface BulkEditModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (field: string, value: any, extraData?: any) => void
  selectedCount: number
  categories: Category[]
  suppliers: Supplier[]
}

export default function BulkEditModal({
  isOpen,
  onClose,
  onConfirm,
  selectedCount,
  categories,
  suppliers,
}: BulkEditModalProps) {
  const [selectedField, setSelectedField] = useState('')
  const [fieldValue, setFieldValue] = useState('')

  const fields = [
    { key: 'category_id', label: 'Categoría', type: 'select', options: 'categories' },
    { key: 'supplier_id', label: 'Proveedor', type: 'select', options: 'suppliers' },
    { key: 'list_price', label: 'Precio de Lista', type: 'number', step: '0.01' },
    { key: 'discount_display', label: 'Bonificaciones (10+5)', type: 'text' },
    { key: 'extra_cost', label: 'Cargo Extra %', type: 'number', step: '0.1' },
    { key: 'current_stock', label: 'Stock', type: 'number', step: '1' },
  ]

  const handleConfirm = () => {
    if (!selectedField || !fieldValue) {
      return
    }

    const field = fields.find(f => f.key === selectedField)
    let parsedValue: any = fieldValue
    let extraData: any = {}

    if (field?.type === 'number') {
      parsedValue = parseFloat(fieldValue) || 0
    } else if (field?.type === 'select') {
      // Para selects, también pasar el nombre para display
      if (field.key === 'category_id') {
        const category = categories.find(c => c.id === fieldValue)
        extraData.category_name = category?.name
      } else if (field.key === 'supplier_id') {
        const supplier = suppliers.find(s => s.id === fieldValue)
        extraData.supplier_name = supplier?.name
      }
    }

    onConfirm(selectedField, parsedValue === '__remove__' ? null : parsedValue, extraData)
    handleClose()
  }

  const handleClose = () => {
    setSelectedField('')
    setFieldValue('')
    onClose()
  }

  const selectedFieldConfig = fields.find(f => f.key === selectedField)

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Editar Campo en Lote" size="sm">
      <div className="space-y-6">
        {/* Información */}
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center">
              <Edit2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary-900 dark:text-primary-200">
                Editar {selectedCount} {selectedCount === 1 ? 'producto' : 'productos'}
              </p>
              <p className="text-xs text-primary-700 dark:text-primary-400">
                El mismo valor se aplicará a todos los seleccionados
              </p>
            </div>
          </div>
        </div>

        {/* Selector de campo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Campo a Modificar
          </label>
          <select
            value={selectedField}
            onChange={(e) => {
              setSelectedField(e.target.value)
              setFieldValue('')
            }}
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
          >
            <option value="">Seleccionar campo...</option>
            {fields.map(field => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </select>
        </div>

        {/* Input de valor */}
        {selectedField && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nuevo Valor
            </label>
            
            {selectedFieldConfig?.type === 'select' ? (
              <select
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
                autoFocus
              >
                <option value="">Seleccionar...</option>
                <option value="__remove__">🗑️ Quitar {selectedFieldConfig.label.toLowerCase()}</option>
                <optgroup label={`${selectedFieldConfig.label}s disponibles`}>
                  {selectedFieldConfig.options === 'categories' && categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  {selectedFieldConfig.options === 'suppliers' && suppliers.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </optgroup>
              </select>
            ) : (
              <>
                <input
                  type={selectedFieldConfig?.type || 'text'}
                  step={selectedFieldConfig?.step}
                  value={fieldValue}
                  onChange={(e) => setFieldValue(e.target.value)}
                  placeholder={
                    selectedField === 'discount_display' 
                      ? '10+5+2' 
                      : selectedField === 'list_price'
                      ? '1500.00'
                      : '0'
                  }
                  className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white text-lg font-medium text-center"
                  autoFocus
                />
                {selectedField === 'discount_display' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Formato: 10+5+2 (descuentos en cadena)
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Preview del cambio */}
        {selectedField && fieldValue && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
            <p className="text-sm font-medium text-green-900 dark:text-green-200 mb-1">
              Se aplicará a {selectedCount} productos:
            </p>
            <p className="text-xs text-green-800 dark:text-green-300">
              {selectedFieldConfig?.label}: <span className="font-bold">{fieldValue}</span>
            </p>
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
            disabled={!selectedField || !fieldValue}
            className="flex-1 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
          >
            <Check size={18} className="mr-2" />
            Aplicar Cambios
          </Button>
        </div>
      </div>
    </Modal>
  )
}
