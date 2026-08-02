/**
 * Modal de detalle de una Factura de Compra.
 * Muestra ítems y totales, y da acceso a las acciones según el estado:
 *   - Borrador: editar / confirmar
 *   - Confirmada: editar (reversión + recálculo)
 */
import { CheckCircle, Clock, Package, Pencil, Sparkles, User, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import purchaseInvoicesService, { PurchaseInvoice } from '../../api/purchaseInvoicesService'

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
  })
}

interface Props {
  invoiceId: string
  onClose: () => void
  onEdit: (invoice: PurchaseInvoice) => void
  onConfirm: (invoice: PurchaseInvoice) => void
}

export default function PurchaseInvoiceDetailModal({ invoiceId, onClose, onEdit, onConfirm }: Props) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['purchase-invoice', invoiceId],
    queryFn: () => purchaseInvoicesService.getById(invoiceId),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-4 lg:px-6 py-3 lg:py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <Package className="w-4 h-4 lg:w-5 lg:h-5 text-primary-600 dark:text-primary-400" />
            <h2 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white leading-tight">
              Factura de Compra
              {invoice && (
                <span className="ml-2 font-mono text-sm lg:text-base text-primary-600 dark:text-primary-400">
                  #{invoice.invoice_number}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 lg:p-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-700/60 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4 lg:w-5 lg:h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 lg:py-5 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : !invoice ? (
            <div className="text-center py-16 text-gray-400">No se encontró la factura</div>
          ) : (
            <div className="space-y-5">

              {/* Info general */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
                <InfoCard label="Proveedor" value={invoice.supplier_name ?? '—'} />
                <InfoCard label="Fecha" value={formatDate(invoice.invoice_date)} />
                <InfoCard
                  label="Origen"
                  value={invoice.source === 'ai' ? 'IA' : 'Manual'}
                  icon={invoice.source === 'ai' ? <Sparkles className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                />
                <InfoCard
                  label="Estado"
                  value={invoice.status === 'confirmed' ? 'Confirmada' : 'Borrador'}
                  icon={invoice.status === 'confirmed' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  valueClass={
                    invoice.status === 'confirmed'
                      ? 'text-green-600 dark:text-green-400 font-semibold'
                      : 'text-yellow-600 dark:text-yellow-400 font-semibold'
                  }
                />
              </div>

              {/* Tabla de ítems */}
              <div className="hidden lg:block overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Cant.</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Costo unit.</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">IVA %</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {invoice.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-3 py-2 text-gray-900 dark:text-white max-w-xs">
                          <div className="truncate">{item.product_description ?? item.description}</div>
                          {item.product_code && (
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{item.product_code}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{item.quantity}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                          {formatCurrency(item.unit_cost)}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">{item.iva_rate}%</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards mobile */}
              <div className="lg:hidden space-y-2">
                {invoice.items.map((item) => (
                  <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {item.product_description ?? item.description}
                    </p>
                    {item.product_code && (
                      <p className="text-xs text-gray-400 font-mono">{item.product_code}</p>
                    )}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <DataPill label="Cant." value={String(item.quantity)} />
                      <DataPill label="Costo" value={formatCurrency(item.unit_cost)} mono />
                      <DataPill label="Subtotal" value={formatCurrency(item.subtotal)} mono valueClass="font-semibold text-primary-700 dark:text-primary-300" />
                    </div>
                  </article>
                ))}
              </div>

              {/* Totales */}
              <div className="flex justify-end">
                <div className="w-full lg:w-auto bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 p-3 lg:p-4 min-w-0 lg:min-w-64">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Subtotal neto:</span>
                      <span className="font-mono">{formatCurrency(invoice.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>IVA total:</span>
                      <span className="font-mono">{formatCurrency(invoice.iva_amount)}</span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between font-bold text-gray-900 dark:text-white text-base">
                      <span>TOTAL:</span>
                      <span className="font-mono">{formatCurrency(invoice.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {invoice.status === 'confirmed' && (
                <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                  {invoice.confirmed_at && <span>Confirmada el {formatDate(invoice.confirmed_at)}</span>}
                  <span>Stock: {invoice.update_stock ? 'actualizado' : 'no actualizado'}</span>
                  <span>Precios: {invoice.update_prices ? 'actualizados' : 'no actualizados'}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {invoice && (
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 lg:gap-3 px-4 lg:px-6 py-3 lg:py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-full lg:w-auto px-3 py-1.5 text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Cerrar
            </button>
            <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-stretch lg:items-center gap-2 lg:gap-3">
              <button
                onClick={() => onEdit(invoice)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs lg:text-sm font-medium border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/35 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                {invoice.status === 'draft' ? 'Editar Borrador' : 'Editar (revertir/recalcular)'}
              </button>
              {invoice.status === 'draft' && (
                <button
                  onClick={() => onConfirm(invoice)}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 lg:px-4 py-1.5 text-xs lg:text-sm font-semibold border border-emerald-600 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 hover:border-emerald-700 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  Confirmar Factura
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium mb-1">{label}</div>
      <div className={`text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1 ${valueClass ?? ''}`}>
        {icon}
        {value}
      </div>
    </div>
  )
}

function DataPill({
  label,
  value,
  valueClass,
  mono = false,
}: {
  label: string
  value: string
  valueClass?: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
      <p className="text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-xs text-gray-800 dark:text-gray-200 ${mono ? 'font-mono' : ''} ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}
