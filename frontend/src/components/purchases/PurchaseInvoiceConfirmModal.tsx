/**
 * Modal de confirmación de una Factura de Compra (borrador → confirmada).
 * Deja explícito que la acción impacta stock y/o precios, con toggles
 * independientes para cada efecto.
 */
import { useState } from 'react'
import { AlertTriangle, CheckCircle, DollarSign, PackagePlus } from 'lucide-react'
import { Button, Modal } from '../ui'
import { PurchaseInvoiceListItem } from '../../api/purchaseInvoicesService'

interface Props {
  invoice: PurchaseInvoiceListItem
  isLoading: boolean
  onClose: () => void
  onConfirm: (options: { update_stock: boolean; update_prices: boolean }) => void
}

export default function PurchaseInvoiceConfirmModal({
  invoice,
  isLoading,
  onClose,
  onConfirm,
}: Props) {
  const [updateStock, setUpdateStock] = useState(true)
  const [updatePrices, setUpdatePrices] = useState(false)

  return (
    <Modal isOpen onClose={onClose} title="Confirmar Factura de Compra" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Vas a confirmar la factura <span className="font-semibold">{invoice.invoice_number}</span>.
            Esta acción es la que efectivamente impacta el sistema — elegí qué querés actualizar.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
          <input
            type="checkbox"
            checked={updateStock}
            onChange={(e) => setUpdateStock(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
              <PackagePlus className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              Actualizar stock
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Crea lotes de stock por cada ítem con producto asociado.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
          <input
            type="checkbox"
            checked={updatePrices}
            onChange={(e) => setUpdatePrices(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
              <DollarSign className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              Actualizar precios
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Actualiza el precio de costo de los productos según lo facturado.
            </p>
          </div>
        </label>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="flex-1"
            isLoading={isLoading}
            onClick={() => onConfirm({ update_stock: updateStock, update_prices: updatePrices })}
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Confirmar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
