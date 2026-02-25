/**
 * Página de Control de Inventario y Órdenes de Pedido.
 * Permite generar planillas de conteo físico, cargar el conteo real
 * y crear órdenes de pedido a proveedores con cálculo de costos.
 */
import { useState } from 'react'
import {
  ClipboardList,
  FileDown,
  Plus,
  Eye,
  Trash2,
  CheckCircle,
  Clock,
  ShoppingCart,
  Package,
  FileText,
} from 'lucide-react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import categoriesService from '../api/categoriesService'
import suppliersService from '../api/suppliersService'
import purchaseOrdersService, {
  PurchaseOrder,
  PurchaseOrderListItem,
  PurchaseOrderStatus,
} from '../api/purchaseOrdersService'
import { Button } from '../components/ui'
import NewPurchaseOrderModal from '../components/inventory/NewPurchaseOrderModal'
import PurchaseOrderDetailModal from '../components/inventory/PurchaseOrderDetailModal'

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
  })
}

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="w-3 h-3" />
        Confirmada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
      <Clock className="w-3 h-3" />
      Borrador
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Inventory() {
  const queryClient = useQueryClient()

  // Filtros de la lista de órdenes
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState<PurchaseOrderStatus | ''>('')

  // Modales
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<PurchaseOrder | null>(null)

  // Queries
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesService.getAll(),
  })

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersService.getAll({ per_page: 100 }),
  })

  const {
    data: ordersData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['purchase-orders', filterSupplier, filterCategory, filterStatus],
    queryFn: () =>
      purchaseOrdersService.list({
        supplier_id: filterSupplier || undefined,
        category_id: filterCategory || undefined,
        status: (filterStatus as PurchaseOrderStatus) || undefined,
        per_page: 50,
      }),
  })

  // Mutación: eliminar
  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchaseOrdersService.delete(id),
    onSuccess: () => {
      toast.success('Orden eliminada')
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: () => toast.error('No se pudo eliminar la orden'),
  })

  // Mutación: confirmar
  const confirmMutation = useMutation({
    mutationFn: (id: string) => purchaseOrdersService.confirm(id),
    onSuccess: () => {
      toast.success('Orden confirmada')
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.detail || 'No se pudo confirmar la orden'),
  })

  const handlePreviewPdf = async (order: PurchaseOrderListItem) => {
    try {
      await purchaseOrdersService.previewPdf(order.id)
    } catch {
      toast.error('Error al abrir el PDF')
    }
  }

  const handleDownloadPdf = async (order: PurchaseOrderListItem) => {
    try {
      await purchaseOrdersService.downloadPdf(order.id, order.supplier_name)
      toast.success('PDF descargado')
    } catch {
      toast.error('Error al descargar el PDF')
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar esta orden de pedido?')) {
      deleteMutation.mutate(id)
    }
  }

  const orders = ordersData?.items ?? []
  // categoriesService retorna array directo; suppliersService retorna paginado
  const categories = Array.isArray(categoriesData) ? categoriesData : (categoriesData as any)?.items ?? []
  const suppliers = suppliersData?.items ?? []

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <ClipboardList className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Control de Inventario
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Generá planillas de conteo y órdenes de pedido a proveedores
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowNewOrderModal(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nueva Orden de Pedido
        </Button>
      </div>

      {/* ── Filtros ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as PurchaseOrderStatus | '')}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="confirmed">Confirmada</option>
          </select>
        </div>
      </div>

      {/* ── Tabla de órdenes ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <ShoppingCart className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-base font-medium">No hay órdenes de pedido</p>
            <p className="text-sm mt-1">
              Hacé clic en "Nueva Orden de Pedido" para empezar
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        N°
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fecha
                      </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Proveedor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ítems
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Subtotal
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    IVA
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {order.sale_point}-{order.number}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {order.supplier_name ?? (
                        <span className="text-gray-400 italic">Sin proveedor</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {order.category_name ?? (
                        <span className="text-gray-400 italic">Todas</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
                        <Package className="w-3.5 h-3.5" />
                        {order.items_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">
                      {formatCurrency(order.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400">
                      {formatCurrency(order.total_iva)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {/* Ver detalle */}
                        <button
                          onClick={() => setSelectedOrderId(order.id)}
                          title="Ver detalle"
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Visualizar PDF en el navegador */}
                        <button
                          onClick={() => handlePreviewPdf(order)}
                          title="Ver PDF"
                          className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/30 transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                        </button>

                        {/* Descargar PDF */}
                        <button
                          onClick={() => handleDownloadPdf(order)}
                          title="Descargar PDF"
                          className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>

                        {/* Confirmar (solo borradores) */}
                        {order.status === 'draft' && (
                          <button
                            onClick={() => confirmMutation.mutate(order.id)}
                            disabled={confirmMutation.isPending}
                            title="Confirmar orden"
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}

                        {/* Eliminar (solo borradores) */}
                        {order.status === 'draft' && (
                          <button
                            onClick={() => handleDelete(order.id)}
                            disabled={deleteMutation.isPending}
                            title="Eliminar"
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modales ── */}
      {showNewOrderModal && (
        <NewPurchaseOrderModal
          categories={categories}
          suppliers={suppliers}
          onClose={() => setShowNewOrderModal(false)}
          onSuccess={() => {
            setShowNewOrderModal(false)
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
            toast.success('Orden de pedido creada')
          }}
        />
      )}

      {selectedOrderId && (
        <PurchaseOrderDetailModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onConfirm={(id) => {
            confirmMutation.mutate(id)
            setSelectedOrderId(null)
          }}
          onDownloadPdf={handleDownloadPdf}
          onEdit={(order) => {
            setSelectedOrderId(null)
            setEditingDraft(order)
          }}
        />
      )}

      {editingDraft && (
        <NewPurchaseOrderModal
          categories={categories}
          suppliers={suppliers}
          draftOrder={editingDraft}
          onClose={() => setEditingDraft(null)}
          onSuccess={() => {
            setEditingDraft(null)
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
            toast.success('Borrador actualizado')
          }}
        />
      )}
    </div>
  )
}
