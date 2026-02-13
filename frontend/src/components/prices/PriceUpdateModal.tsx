/**
 * Modal para configurar actualización masiva de precios.
 * Siguiendo react-modern-ui.md patterns.
 */
import { useState } from 'react'
import { TrendingUp, TrendingDown, RotateCcw, DollarSign, Eye, X } from 'lucide-react'
import { Modal, Button } from '../ui'

interface PriceUpdateModalProps {
  isOpen: boolean
  onClose: () => void
  onPreview: (config: UpdateConfig) => void
  selectedCount: number
}

export interface UpdateConfig {
  field: string
  updateType: 'increase' | 'decrease' | 'remove_increase' | 'set_value'
  value: number
}

export default function PriceUpdateModal({
  isOpen,
  onClose,
  onPreview,
  selectedCount,
}: PriceUpdateModalProps) {
  const [field, setField] = useState('list_price')
  const [updateType, setUpdateType] = useState<UpdateConfig['updateType']>('increase')
  const [value, setValue] = useState('')

  const fields = [
    { key: 'list_price', label: 'Precio de Lista' },
    { key: 'discount_1', label: 'Descuento 1 %' },
    { key: 'discount_2', label: 'Descuento 2 %' },
    { key: 'discount_3', label: 'Descuento 3 %' },
    { key: 'extra_cost', label: 'Cargo Extra %' },
    { key: 'current_stock', label: 'Stock' },
  ]

  const updateTypes = [
    { 
      key: 'increase', 
      label: 'Aumentar %', 
      icon: TrendingUp, 
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-300 dark:border-green-700',
      description: 'Ejemplo: $100 + 10% = $110'
    },
    { 
      key: 'decrease', 
      label: 'Disminuir %', 
      icon: TrendingDown, 
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-300 dark:border-red-700',
      description: 'Ejemplo: $100 - 10% = $90'
    },
    { 
      key: 'remove_increase', 
      label: 'Quitar Aumento %', 
      icon: RotateCcw, 
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      borderColor: 'border-purple-300 dark:border-purple-700',
      description: 'Ejemplo: $110 ÷ 1.10 = $100 (inverso)'
    },
    { 
      key: 'set_value', 
      label: 'Establecer Valor Fijo', 
      icon: DollarSign, 
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-300 dark:border-blue-700',
      description: 'Ejemplo: Establecer todos en $1500'
    },
  ]

  const handlePreview = () => {
    if (!value || parseFloat(value) <= 0) {
      return
    }

    onPreview({
      field,
      updateType,
      value: parseFloat(value),
    })
  }

  const handleClose = () => {
    setField('list_price')
    setUpdateType('increase')
    setValue('')
    onClose()
  }

  const selectedFieldLabel = fields.find(f => f.key === field)?.label || ''
  const selectedTypeConfig = updateTypes.find(t => t.key === updateType)

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Configurar Actualización" size="lg">
      <div className="space-y-6">
        {/* Info de productos seleccionados */}
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/40 rounded-full flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                Actualizar {selectedCount} {selectedCount === 1 ? 'producto' : 'productos'}
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-400">
                Configura el tipo de actualización a aplicar
              </p>
            </div>
          </div>
        </div>

        {/* Campo a modificar */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Campo a Modificar
          </label>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white text-lg"
          >
            {fields.map(f => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Tipo de cambio - Radio buttons con cards */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Tipo de Actualización
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {updateTypes.map(type => {
              const Icon = type.icon
              const isSelected = updateType === type.key
              return (
                <label
                  key={type.key}
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? `${type.bgColor} border-2 ${type.borderColor} shadow-md`
                      : 'bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  } rounded-lg p-4`}
                >
                  <input
                    type="radio"
                    name="updateType"
                    value={type.key}
                    checked={updateType === type.key}
                    onChange={(e) => setUpdateType(e.target.value as UpdateConfig['updateType'])}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 mt-0.5 ${isSelected ? type.color : 'text-gray-400'}`} />
                    <div className="flex-1">
                      <div className={`font-medium text-sm ${isSelected ? type.color : 'text-gray-700 dark:text-gray-300'}`}>
                        {type.label}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {type.description}
                      </div>
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Input de valor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {updateType === 'set_value' ? 'Valor Fijo' : 'Porcentaje'}
          </label>
          <div className="relative">
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={updateType === 'set_value' ? '1500.00' : '10'}
              step={updateType === 'set_value' ? '0.01' : '0.1'}
              className="w-full px-4 py-4 pr-12 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white text-2xl font-bold text-center"
              autoFocus
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400">
              {updateType === 'set_value' ? '$' : '%'}
            </span>
          </div>
          {updateType === 'remove_increase' && (
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 flex items-center gap-1">
              <RotateCcw size={12} />
              Esto revierte un aumento previo aplicando la fórmula inversa
            </p>
          )}
        </div>

        {/* Preview rápido del cálculo */}
        {value && parseFloat(value) > 0 && (
          <div className={`${selectedTypeConfig?.bgColor} border ${selectedTypeConfig?.borderColor} rounded-lg p-4 animate-in fade-in duration-300`}>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              Ejemplo de cálculo:
            </p>
            <div className="space-y-1 text-sm">
              {updateType === 'increase' && (
                <p className="text-gray-700 dark:text-gray-300">
                  $100.00 → <span className="font-bold text-green-600">${(100 * (1 + parseFloat(value) / 100)).toFixed(2)}</span>
                  <span className="text-xs text-green-600 ml-2">(+{value}%)</span>
                </p>
              )}
              {updateType === 'decrease' && (
                <p className="text-gray-700 dark:text-gray-300">
                  $100.00 → <span className="font-bold text-red-600">${(100 * (1 - parseFloat(value) / 100)).toFixed(2)}</span>
                  <span className="text-xs text-red-600 ml-2">(-{value}%)</span>
                </p>
              )}
              {updateType === 'remove_increase' && (
                <p className="text-gray-700 dark:text-gray-300">
                  $110.00 → <span className="font-bold text-purple-600">${(110 / (1 + parseFloat(value) / 100)).toFixed(2)}</span>
                  <span className="text-xs text-purple-600 ml-2">(quitar {value}%)</span>
                </p>
              )}
              {updateType === 'set_value' && (
                <p className="text-gray-700 dark:text-gray-300">
                  Cualquier valor → <span className="font-bold text-blue-600">${parseFloat(value).toFixed(2)}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            <X size={18} className="mr-2" />
            Cancelar
          </Button>
          <Button
            onClick={handlePreview}
            disabled={!value || parseFloat(value) <= 0}
            className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700"
          >
            <Eye size={18} className="mr-2" />
            Vista Previa de Cambios
          </Button>
        </div>
      </div>
    </Modal>
  )
}
