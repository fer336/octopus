/**
 * Modal para crear Notas de Crédito.
 */
import { useState, useEffect } from 'react'
import { Modal, Button } from '../ui'
import { AlertCircle, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import creditNoteService, { CreditNoteItem } from '../../api/creditNoteService'

interface VoucherItem {
  id: string
  product_id: string
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  subtotal: number
  iva_amount: number
  total: number
}

interface Voucher {
  id: string
  voucher_type: string
  full_number: string
  date: string
  subtotal: number
  iva_amount: number
  total: number
  cae?: string
  items: VoucherItem[]
}

interface Props {
  isOpen: boolean
  onClose: () => void
  voucher: Voucher | null
  onSuccess: () => void
}

interface SelectedItem extends VoucherItem {
  selected: boolean
  returnQuantity: number
}

export default function CreditNoteModal({ isOpen, onClose, voucher, onSuccess }: Props) {
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Inicializar items cuando se abre el modal
  useEffect(() => {
    if (isOpen && voucher) {
      setSelectedItems(
        voucher.items.map(item => ({
          ...item,
          selected: false,
          returnQuantity: item.quantity, // Por defecto, cantidad total
        }))
      )
      setReason('')
    }
  }, [isOpen, voucher])

  const toggleItem = (itemId: string) => {
    setSelectedItems(items =>
      items.map(item =>
        item.id === itemId ? { ...item, selected: !item.selected } : item
      )
    )
  }

  const updateReturnQuantity = (itemId: string, quantity: number) => {
    setSelectedItems(items =>
      items.map(item =>
        item.id === itemId ? { ...item, returnQuantity: quantity } : item
      )
    )
  }

  const calculateTotal = () => {
    let subtotal = 0
    selectedItems
      .filter(item => item.selected)
      .forEach(item => {
        const itemSubtotal = item.unit_price * item.returnQuantity
        const discount = itemSubtotal * (item.discount_percent / 100)
        subtotal += itemSubtotal - discount
      })

    const iva = subtotal * 0.21
    const total = subtotal + iva

    return { subtotal, iva, total }
  }

  const handleSubmit = async () => {
    if (!voucher) return

    // Validaciones
    const selected = selectedItems.filter(item => item.selected)
    if (selected.length === 0) {
      toast.error('Debe seleccionar al menos un producto')
      return
    }

    if (!reason.trim()) {
      toast.error('Debe ingresar el motivo de la Nota de Crédito')
      return
    }

    // Validar cantidades
    for (const item of selected) {
      if (item.returnQuantity <= 0) {
        toast.error(`La cantidad de "${item.description}" debe ser mayor a 0`)
        return
      }
      if (item.returnQuantity > item.quantity) {
        toast.error(
          `La cantidad de "${item.description}" no puede superar la cantidad original (${item.quantity})`
        )
        return
      }
    }

    setIsSubmitting(true)

    try {
      // Construir items para la NC
      const ncItems: CreditNoteItem[] = selected.map(item => ({
        product_id: item.product_id,
        quantity: item.returnQuantity,
        unit_price: item.unit_price,
        discount_percent: item.discount_percent,
      }))

      // Crear NC
      await creditNoteService.create(voucher.id, {
        original_voucher_id: voucher.id,
        reason: reason.trim(),
        items: ncItems,
      })

      toast.success('Nota de Crédito emitida correctamente', { icon: '✅', duration: 3000 })
      onSuccess()
      onClose()
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message || 'Error al crear NC'
      toast.error(errorMessage, { duration: 5000 })
    } finally {
      setIsSubmitting(false)
    }
  }

  const totals = calculateTotal()
  const selectedCount = selectedItems.filter(item => item.selected).length

  if (!voucher) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crear Nota de Crédito" size="xl">
      <div className="space-y-4">
        {/* Información de la factura original */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileText className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1 space-y-1 text-sm">
              <p className="font-semibold text-blue-900 dark:text-blue-100">
                Factura Original: {voucher.full_number}
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                Fecha: {new Date(voucher.date).toLocaleDateString()}
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                Total: ${voucher.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              {voucher.cae && (
                <p className="text-blue-700 dark:text-blue-300 text-xs">CAE: {voucher.cae}</p>
              )}
            </div>
          </div>
        </div>

        {/* Advertencia */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <div className="flex gap-2">
            <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0" size={18} />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              La Nota de Crédito se emitirá electrónicamente en ARCA/AFIP. Esta acción es
              <strong> irreversible</strong>.
            </p>
          </div>
        </div>

        {/* Tabla de items */}
        <div className="border rounded-lg dark:border-gray-600 overflow-hidden">
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">
                    Producto
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">
                    Cant. Original
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">
                    Cant. a Devolver
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">
                    Precio Unit.
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {selectedItems.map(item => {
                  const itemSubtotal = item.unit_price * item.returnQuantity
                  const discount = itemSubtotal * (item.discount_percent / 100)
                  const total = itemSubtotal - discount

                  return (
                    <tr
                      key={item.id}
                      className={`${
                        item.selected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      } hover:bg-gray-50 dark:hover:bg-gray-700`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleItem(item.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{item.description}</p>
                        {item.discount_percent > 0 && (
                          <p className="text-xs text-gray-500">Desc: {item.discount_percent}%</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={item.returnQuantity}
                          onChange={e =>
                            updateReturnQuantity(item.id, parseInt(e.target.value) || 0)
                          }
                          disabled={!item.selected}
                          min={1}
                          max={item.quantity}
                          className="w-20 text-right px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        ${item.unit_price.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resumen */}
        {selectedCount > 0 && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Productos seleccionados:</span>
              <span className="font-medium">{selectedCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Subtotal NC:</span>
              <span className="font-medium">
                ${totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">IVA (21%):</span>
              <span className="font-medium">
                ${totals.iva.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700">
              <span>Total NC:</span>
              <span className="text-red-600 dark:text-red-400">
                -${totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Motivo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Motivo de la Nota de Crédito <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej: Devolución por producto defectuoso"
            className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 resize-none"
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-gray-500 mt-1">{reason.length}/500 caracteres</p>
        </div>

        {/* Botones */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            className="flex-1 bg-red-600 hover:bg-red-700"
            disabled={isSubmitting || selectedCount === 0 || !reason.trim()}
          >
            {isSubmitting ? 'Emitiendo...' : 'Emitir Nota de Crédito'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
