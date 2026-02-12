/**
 * Modal de Preview de Importación de Productos.
 * Muestra los productos parseados del Excel para revisión y edición antes de importar.
 */
import { useState, useEffect } from 'react'
import { AlertCircle, Check, XCircle, Edit2, Save, X } from 'lucide-react'
import { Modal, Button } from '../ui'
import { ProductImportRow } from '../../api/productsService'
import toast from 'react-hot-toast'

interface ImportPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (rows: ProductImportRow[]) => Promise<void>
  previewData: {
    total_rows: number
    valid_rows: number
    rows_with_errors: number
    new_products: number
    existing_products: number
    rows: ProductImportRow[]
  } | null
}

export default function ImportPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  previewData,
}: ImportPreviewModalProps) {
  const [editingRows, setEditingRows] = useState<Set<number>>(new Set())
  const [rows, setRows] = useState<ProductImportRow[]>([])
  const [isConfirming, setIsConfirming] = useState(false)

  // Helper para convertir valores a number de forma segura
  const toNumber = (value: any): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') return parseFloat(value) || 0
    return 0
  }

  // Sincronizar con previewData cuando cambia
  useEffect(() => {
    if (previewData) {
      // Convertir todos los Decimal strings a numbers de forma segura
      const normalizedRows = previewData.rows.map(row => ({
        ...row,
        list_price: toNumber(row.list_price),
        discount_1: toNumber(row.discount_1),
        discount_2: toNumber(row.discount_2),
        discount_3: toNumber(row.discount_3),
        extra_cost: toNumber(row.extra_cost),
        iva_rate: toNumber(row.iva_rate),
        net_price: row.net_price ? toNumber(row.net_price) : 0,
        sale_price: row.sale_price ? toNumber(row.sale_price) : 0,
        current_stock: toNumber(row.current_stock),
        minimum_stock: toNumber(row.minimum_stock),
      }))
      setRows(normalizedRows)
    }
  }, [previewData])

  if (!previewData) return null

  const toggleEdit = (rowNumber: number) => {
    const newEditing = new Set(editingRows)
    if (newEditing.has(rowNumber)) {
      newEditing.delete(rowNumber)
    } else {
      newEditing.add(rowNumber)
    }
    setEditingRows(newEditing)
  }

  const updateRow = (rowNumber: number, field: keyof ProductImportRow, value: any) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.row_number === rowNumber) {
          const updated = { ...row, [field]: value }

          // Recalcular precios si cambió algún campo de precio
          if (['list_price', 'discount_1', 'discount_2', 'discount_3', 'extra_cost', 'iva_rate'].includes(field)) {
            const { net_price, sale_price, discount_display } = calculatePrices(
              updated.list_price,
              updated.discount_1,
              updated.discount_2,
              updated.discount_3,
              updated.extra_cost,
              updated.iva_rate
            )
            updated.net_price = net_price
            updated.sale_price = sale_price
            updated.discount_display = discount_display
          }

          return updated
        }
        return row
      })
    )
  }

  const calculatePrices = (
    listPrice: number,
    d1: number,
    d2: number,
    d3: number,
    extraCost: number,
    ivaRate: number
  ) => {
    const netBase = listPrice * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100)
    const netWithExtra = netBase * (1 + extraCost / 100)
    const sale = netWithExtra * (1 + ivaRate / 100)

    const discounts = [d1, d2, d3].filter((d) => d > 0)
    const discount_display = discounts.length > 0 ? discounts.map((d) => Math.round(d)).join('+') : undefined

    return {
      net_price: Math.round(netWithExtra * 100) / 100,
      sale_price: Math.round(sale * 100) / 100,
      discount_display,
    }
  }

  const handleConfirm = async () => {
    // Verificar que no haya filas con errores sin resolver
    const hasUnresolvedErrors = rows.some((row) => row.has_errors)
    if (hasUnresolvedErrors) {
      toast.error('Hay filas con errores sin resolver. Corrígelas o elimínalas antes de continuar.')
      return
    }

    setIsConfirming(true)
    try {
      await onConfirm(rows)
    } finally {
      setIsConfirming(false)
    }
  }

  const removeRow = (rowNumber: number) => {
    setRows((prev) => prev.filter((row) => row.row_number !== rowNumber))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Preview de Importación" size="full">
      <div className="space-y-4">
        {/* Resumen */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            <p className="text-xs text-blue-600 dark:text-blue-400">Total Filas</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{previewData.total_rows}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
            <p className="text-xs text-green-600 dark:text-green-400">Válidas</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{previewData.valid_rows}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
            <p className="text-xs text-red-600 dark:text-red-400">Con Errores</p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-300">{previewData.rows_with_errors}</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
            <p className="text-xs text-purple-600 dark:text-purple-400">Nuevos</p>
            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{previewData.new_products}</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
            <p className="text-xs text-orange-600 dark:text-orange-400">Actualizar</p>
            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{previewData.existing_products}</p>
          </div>
        </div>

        {/* Tabla de productos */}
        <div className="overflow-auto max-h-[60vh] border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-left">Código</th>
                <th className="px-2 py-2 text-left">Descripción</th>
                <th className="px-2 py-2 text-left">P. Lista</th>
                <th className="px-2 py-2 text-left">Bonif.</th>
                <th className="px-2 py-2 text-left">Cargo %</th>
                <th className="px-2 py-2 text-left">IVA %</th>
                <th className="px-2 py-2 text-left">P. Final</th>
                <th className="px-2 py-2 text-left">Stock</th>
                <th className="px-2 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = editingRows.has(row.row_number)
                return (
                  <tr
                    key={row.row_number}
                    className={`border-t border-gray-200 dark:border-gray-700 ${
                      row.has_errors
                        ? 'bg-red-50 dark:bg-red-900/10'
                        : row.is_new
                        ? 'bg-purple-50 dark:bg-purple-900/10'
                        : 'bg-orange-50 dark:bg-orange-900/10'
                    }`}
                  >
                    <td className="px-2 py-2">{row.row_number}</td>
                    <td className="px-2 py-2">
                      {row.has_errors ? (
                        <div className="flex items-center gap-1 text-red-600">
                          <XCircle size={16} />
                          <span className="text-xs">Error</span>
                        </div>
                      ) : row.is_new ? (
                        <div className="flex items-center gap-1 text-purple-600">
                          <AlertCircle size={16} />
                          <span className="text-xs">Nuevo</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-orange-600">
                          <Edit2 size={16} />
                          <span className="text-xs">Actualizar</span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.code}
                          onChange={(e) => updateRow(row.row_number, 'code', e.target.value)}
                          className="w-full px-1 py-0.5 text-xs border rounded dark:bg-gray-700"
                        />
                      ) : (
                        <span className="font-mono text-xs">{row.code}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 max-w-xs">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateRow(row.row_number, 'description', e.target.value)}
                          className="w-full px-1 py-0.5 text-xs border rounded dark:bg-gray-700"
                        />
                      ) : (
                        <span className="text-xs truncate block">{row.description}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="number"
                          value={row.list_price}
                          onChange={(e) => updateRow(row.row_number, 'list_price', parseFloat(e.target.value) || 0)}
                          className="w-20 px-1 py-0.5 text-xs border rounded dark:bg-gray-700"
                          step="0.01"
                        />
                      ) : (
                        <span className="text-xs">${toNumber(row.list_price).toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className="text-xs text-green-600 dark:text-green-400">{row.discount_display || '-'}</span>
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="number"
                          value={row.extra_cost}
                          onChange={(e) => updateRow(row.row_number, 'extra_cost', parseFloat(e.target.value) || 0)}
                          className="w-16 px-1 py-0.5 text-xs border rounded dark:bg-gray-700"
                          step="0.1"
                        />
                      ) : (
                        <span className="text-xs">{toNumber(row.extra_cost)}%</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className="text-xs">{toNumber(row.iva_rate)}%</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-bold text-xs text-blue-600 dark:text-blue-400">
                        ${toNumber(row.sale_price).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <input
                          type="number"
                          value={row.current_stock}
                          onChange={(e) => updateRow(row.row_number, 'current_stock', parseInt(e.target.value) || 0)}
                          className="w-16 px-1 py-0.5 text-xs border rounded dark:bg-gray-700"
                        />
                      ) : (
                        <span className="text-xs">{row.current_stock}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleEdit(row.row_number)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          title={isEditing ? 'Guardar cambios' : 'Editar fila'}
                        >
                          {isEditing ? <Save size={14} className="text-green-600" /> : <Edit2 size={14} />}
                        </button>
                        <button
                          onClick={() => removeRow(row.row_number)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                          title="Eliminar fila"
                        >
                          <X size={14} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Error messages */}
        {rows.some((r) => r.has_errors) && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <h4 className="font-medium text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
              <AlertCircle size={16} />
              Errores Detectados
            </h4>
            <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
              {rows
                .filter((r) => r.has_errors)
                .map((r) => (
                  <li key={r.row_number}>
                    Fila {r.row_number}: {r.error_message}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Botones */}
        <div className="flex justify-between items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {rows.length} {rows.length === 1 ? 'producto' : 'productos'} para procesar
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} size="sm">
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isConfirming || rows.length === 0 || rows.some((r) => r.has_errors)}
              size="sm"
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              {isConfirming ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Importando...
                </>
              ) : (
                <>
                  <Check size={16} className="mr-2" />
                  Confirmar Importación
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
