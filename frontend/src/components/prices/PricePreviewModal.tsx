/**
 * Modal de preview de cambios de precios.
 * Muestra tabla con valores actuales vs nuevos antes de confirmar.
 */
import { useState } from 'react'
import { Check, X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { Modal, Button } from '../ui'

interface PreviewItem {
  id: string
  code: string
  description: string
  category_name?: string
  supplier_name?: string
  current_value: number
  new_value: number
  change_amount: number
  change_percentage: number
}

interface PricePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  previewData: {
    total_products: number
    field_name: string
    update_description: string
    items: PreviewItem[]
  } | null
}

export default function PricePreviewModal({
  isOpen,
  onClose,
  onConfirm,
  previewData,
}: PricePreviewModalProps) {
  const [isConfirming, setIsConfirming] = useState(false)

  if (!previewData) return null

  const handleConfirm = async () => {
    setIsConfirming(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setIsConfirming(false)
    }
  }

  // Calcular estadísticas
  const avgChange = previewData.items.reduce((sum, item) => sum + item.change_percentage, 0) / previewData.items.length
  const totalIncrease = previewData.items.filter(i => i.change_amount > 0).length
  const totalDecrease = previewData.items.filter(i => i.change_amount < 0).length

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Vista Previa de Cambios" size="full">
      <div className="space-y-4">
        {/* Resumen */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <p className="text-xs text-blue-600 dark:text-blue-400">Total Productos</p>
            <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{previewData.total_products}</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
            <p className="text-xs text-orange-600 dark:text-orange-400">Campo a Modificar</p>
            <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{previewData.field_name}</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
            <p className="text-xs text-purple-600 dark:text-purple-400">Tipo de Cambio</p>
            <p className="text-sm font-bold text-purple-700 dark:text-purple-300">{previewData.update_description}</p>
          </div>
          <div className={`${avgChange >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'} p-4 rounded-lg`}>
            <p className={`text-xs ${avgChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              Cambio Promedio
            </p>
            <p className={`text-2xl font-bold ${avgChange >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
            </p>
          </div>
        </div>

        {/* Advertencia si hay decrementos */}
        {totalDecrease > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-900 dark:text-yellow-200">
                  {totalDecrease} {totalDecrease === 1 ? 'producto tendrá' : 'productos tendrán'} una disminución de precio
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  Revisa los cambios antes de confirmar
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tabla de cambios */}
        <div className="overflow-auto max-h-[50vh] border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Producto</th>
                <th className="px-3 py-2 text-left">Categoría</th>
                <th className="px-3 py-2 text-right">Valor Actual</th>
                <th className="px-3 py-2 text-center">→</th>
                <th className="px-3 py-2 text-right">Valor Nuevo</th>
                <th className="px-3 py-2 text-right">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {previewData.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{item.code}</span>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <span className="text-xs truncate block">{item.description}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {item.category_name || '-'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="text-gray-600 dark:text-gray-400">
                      ${item.current_value.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {item.change_amount > 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-600 mx-auto" />
                    ) : item.change_amount < 0 ? (
                      <TrendingDown className="w-4 h-4 text-red-600 mx-auto" />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-bold ${
                      item.change_amount > 0 
                        ? 'text-green-600 dark:text-green-400'
                        : item.change_amount < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      ${item.new_value.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col items-end">
                      <span className={`text-xs font-medium ${
                        item.change_amount > 0 
                          ? 'text-green-600'
                          : item.change_amount < 0
                          ? 'text-red-600'
                          : 'text-gray-400'
                      }`}>
                        {item.change_amount > 0 ? '+' : ''}${item.change_amount.toFixed(2)}
                      </span>
                      <span className={`text-[10px] ${
                        item.change_percentage > 0
                          ? 'text-green-600'
                          : item.change_percentage < 0
                          ? 'text-red-600'
                          : 'text-gray-400'
                      }`}>
                        {item.change_percentage > 0 ? '+' : ''}{item.change_percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isConfirming}>
            <X size={18} className="mr-2" />
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
          >
            {isConfirming ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Aplicando...
              </>
            ) : (
              <>
                <Check size={18} className="mr-2" />
                Confirmar y Aplicar Cambios
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
