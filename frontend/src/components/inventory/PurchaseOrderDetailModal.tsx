/**
 * Modal de detalle de una Orden de Pedido.
 * Muestra todos los ítems, totales y permite confirmar o descargar el PDF.
 */
import { X, FileDown, CheckCircle, Package, Calendar, Pencil } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import purchaseOrdersService, {
  PurchaseOrder,
  PurchaseOrderListItem,
} from '../../api/purchaseOrdersService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orderId: string
  onClose: () => void
  onConfirm: (id: string) => void
  onDownloadPdf: (order: PurchaseOrderListItem) => void
  /** Callback para abrir el modal de edición — solo para borradores */
  onEdit?: (order: PurchaseOrder) => void
}

// ─── Componente ────────────────────────────────────────────────────────────────

export default function PurchaseOrderDetailModal({
  orderId,
  onClose,
  onConfirm,
  onDownloadPdf,
  onEdit,
}: Props) {
  const { data: order, isLoading } = useQuery({
    queryKey: ['purchase-order', orderId],
    queryFn: () => purchaseOrdersService.getById(orderId),
  })

  const handleDownloadPdf = async () => {
    if (!order) return
    try {
      await purchaseOrdersService.downloadPdf(order.id, order.supplier_name)
    } catch {
      // El error se maneja en el padre
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Detalle de Orden de Pedido
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : !order ? (
            <div className="text-center py-16 text-gray-400">
              No se encontró la orden
            </div>
          ) : (
            <div className="space-y-5">

              {/* Info general */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoCard
                  label="Proveedor"
                  value={order.supplier_name ?? '—'}
                />
                <InfoCard
                  label="Categoría"
                  value={order.category_name ?? 'Todas'}
                />
                <InfoCard
                  label="Creada"
                  value={formatDate(order.created_at)}
                  icon={<Calendar className="w-3.5 h-3.5" />}
                />
                <InfoCard
                  label="Estado"
                  value={order.status === 'confirmed' ? 'Confirmada' : 'Borrador'}
                  valueClass={
                    order.status === 'confirmed'
                      ? 'text-green-600 dark:text-green-400 font-semibold'
                      : 'text-yellow-600 dark:text-yellow-400 font-semibold'
                  }
                />
              </div>

              {order.notes && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Observaciones: </span>
                  {order.notes}
                </div>
              )}

              {/* Tabla de ítems */}
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Código</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Stock sist.</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Contado</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Cant. pedir</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Precio costo</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">IVA %</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {order.items.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {item.product_code ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-white max-w-xs">
                          <div className="truncate">{item.product_description ?? '—'}</div>
                          {item.category_name && (
                            <div className="text-xs text-gray-400 mt-0.5">{item.category_name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
                          {item.system_stock}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">
                          {item.counted_stock ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-blue-600 dark:text-blue-400">
                          {item.quantity_to_order}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                          {formatCurrency(item.unit_cost)}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">
                          {item.iva_rate}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div className="flex justify-end">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 p-4 min-w-64">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Subtotal neto:</span>
                      <span className="font-mono">{formatCurrency(order.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>IVA total:</span>
                      <span className="font-mono">{formatCurrency(order.total_iva)}</span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between font-bold text-gray-900 dark:text-white text-base">
                      <span>TOTAL:</span>
                      <span className="font-mono">{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {order && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cerrar
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadPdf}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <FileDown className="w-4 h-4" />
                Descargar PDF
              </button>
              {order.status === 'draft' && onEdit && (
                <button
                  onClick={() => { onEdit(order); onClose() }}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Editar Borrador
                </button>
              )}
              {order.status === 'draft' && (
                <button
                  onClick={() => onConfirm(order.id)}
                  className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Confirmar Orden
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-componente InfoCard ───────────────────────────────────────────────────

function InfoCard({
  label,
  value,
  icon,
  valueClass,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  valueClass?: string
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">
        {label}
      </div>
      <div className={`text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1 ${valueClass ?? ''}`}>
        {icon}
        {value}
      </div>
    </div>
  )
}
