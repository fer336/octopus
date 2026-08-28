/**
 * Página de Facturas de Compra (Compras — carga manual e IA).
 * Listado con filtros/paginación + flujo completo: alta manual, carga por
 * IA (con revisión humana obligatoria antes de confirmar), edición de
 * borrador, confirmación (impacta stock/precio) y edición post-confirmación
 * (reversión, con manejo de conflictos por consumo de lote).
 */
import { useState } from 'react'
import {
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Pencil,
  Plus,
  Receipt,
  Sparkles,
  User,
} from 'lucide-react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import toast from 'react-hot-toast'
import suppliersService from '../api/suppliersService'
import purchaseInvoicesService, {
  PurchaseInvoice,
  PurchaseInvoiceListItem,
  PurchaseInvoiceSource,
  PurchaseInvoiceStatus,
} from '../api/purchaseInvoicesService'
import { Pagination, SearchBar, Select } from '../components/ui'
import PurchaseInvoiceFormModal, { FormMode } from '../components/purchases/PurchaseInvoiceFormModal'
import PurchaseInvoiceDetailModal from '../components/purchases/PurchaseInvoiceDetailModal'
import PurchaseInvoiceConfirmModal from '../components/purchases/PurchaseInvoiceConfirmModal'
import PurchaseInvoiceAIUploadModal from '../components/purchases/PurchaseInvoiceAIUploadModal'

// ─── Helpers ──────────────────────────────────────────────────────────────

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

function StatusBadge({ status }: { status: PurchaseInvoiceStatus }) {
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

function SourceBadge({ source }: { source: PurchaseInvoiceSource }) {
  if (source === 'ai') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
        <Sparkles className="w-3 h-3" />
        IA
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
      <User className="w-3 h-3" />
      Manual
    </span>
  )
}

// ─── Componente principal ───────────────────────────────────────────────────

export default function PurchaseInvoices() {
  const queryClient = useQueryClient()

  // Filtros
  const [filterStatus, setFilterStatus] = useState<PurchaseInvoiceStatus | ''>('')
  const [filterSource, setFilterSource] = useState<PurchaseInvoiceSource | ''>('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Modales
  const [formModal, setFormModal] = useState<{ mode: FormMode; invoice?: PurchaseInvoice } | null>(null)
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)
  const [confirmingInvoice, setConfirmingInvoice] = useState<PurchaseInvoiceListItem | null>(null)
  const [showAIModal, setShowAIModal] = useState(false)

  // Queries
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersService.getAll({ per_page: 100 }),
  })
  const suppliers = suppliersData?.items ?? []

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ['purchase-invoices', filterStatus, filterSource, filterSupplier, search, page],
    queryFn: () =>
      purchaseInvoicesService.list({
        status: filterStatus || undefined,
        source: filterSource || undefined,
        supplier_id: filterSupplier || undefined,
        search: search || undefined,
        page,
        per_page: 20,
      }),
  })

  const invoices = invoicesData?.items ?? []

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['purchase-invoice'] })
  }

  // Mutación: confirmar
  const confirmMutation = useMutation({
    mutationFn: ({ id, update_stock, update_prices }: { id: string; update_stock: boolean; update_prices: boolean }) =>
      purchaseInvoicesService.confirm(id, { update_stock, update_prices }),
    onSuccess: () => {
      toast.success('Factura confirmada')
      invalidateAll()
      setConfirmingInvoice(null)
    },
    onError: (err: unknown) => {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      toast.error(typeof detail === 'string' ? detail : 'No se pudo confirmar la factura')
    },
  })

  const openCreateModal = () => setFormModal({ mode: 'create' })

  const openEditModal = (invoice: PurchaseInvoice) => {
    setDetailInvoiceId(null)
    setFormModal({ mode: invoice.status === 'draft' ? 'edit-draft' : 'edit-confirmed', invoice })
  }

  const openConfirmFromDetail = (invoice: PurchaseInvoice) => {
    setDetailInvoiceId(null)
    setConfirmingInvoice({
      id: invoice.id,
      supplier_id: invoice.supplier_id,
      purchase_order_id: invoice.purchase_order_id,
      status: invoice.status,
      source: invoice.source,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      total: invoice.total,
      is_duplicate_ack: invoice.is_duplicate_ack,
      confirmed_at: invoice.confirmed_at,
      items_count: invoice.items.length,
      supplier_name: invoice.supplier_name,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
    })
  }

  const handleAIExtracted = (invoice: PurchaseInvoice) => {
    setShowAIModal(false)
    invalidateAll()
    setFormModal({ mode: 'edit-draft', invoice })
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary-600" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Compras</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAIModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/35 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Cargar por IA
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva Factura
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 shrink-0">
        <SearchBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(1) }}
          placeholder="Buscar por N° de factura..."
        />
        <Select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value as PurchaseInvoiceStatus | ''); setPage(1) }}
          options={[
            { value: 'draft', label: 'Borrador' },
            { value: 'confirmed', label: 'Confirmada' },
          ]}
          placeholder="Estado"
        />
        <Select
          value={filterSource}
          onChange={(e) => { setFilterSource(e.target.value as PurchaseInvoiceSource | ''); setPage(1) }}
          options={[
            { value: 'manual', label: 'Manual' },
            { value: 'ai', label: 'IA' },
          ]}
          placeholder="Origen"
        />
        <Select
          value={filterSupplier}
          onChange={(e) => { setFilterSupplier(e.target.value); setPage(1) }}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Proveedor"
        />
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <Receipt className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-base font-medium">No hay facturas de compra</p>
            <p className="text-sm mt-1">Cargá una manualmente o subí un PDF para extraerla con IA</p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">N°</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proveedor</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Origen</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ítems</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatDate(invoice.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                        {invoice.supplier_name ?? <span className="text-gray-400 italic">Sin proveedor</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SourceBadge source={invoice.source} />
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                        {invoice.items_count}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setDetailInvoiceId(invoice.id)}
                            title="Ver detalle"
                            className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/30 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {invoice.status === 'draft' && (
                            <button
                              onClick={() => setConfirmingInvoice(invoice)}
                              title="Confirmar factura"
                              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={async () => {
                              const full = await purchaseInvoicesService.getById(invoice.id)
                              openEditModal(full)
                            }}
                            title={invoice.status === 'draft' ? 'Editar borrador' : 'Editar factura confirmada'}
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards mobile */}
            <div className="lg:hidden space-y-2 p-2">
              {invoices.map((invoice) => (
                <article key={invoice.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-gray-600 dark:text-gray-300">{invoice.invoice_number}</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {invoice.supplier_name ?? 'Sin proveedor'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(invoice.invoice_date)}</p>
                    </div>
                    <StatusBadge status={invoice.status} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <SourceBadge source={invoice.source} />
                    <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                      <FileText className="w-3 h-3" />
                      {invoice.items_count} ítems
                    </span>
                  </div>

                  <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-2 py-1.5 text-right dark:border-green-800 dark:bg-green-900/20">
                    <p className="text-[10px] text-green-700 dark:text-green-300">Total</p>
                    <p className="font-mono text-sm font-bold text-green-700 dark:text-green-300">{formatCurrency(invoice.total)}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setDetailInvoiceId(invoice.id)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2 py-1.5 text-[11px] font-medium text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button
                      onClick={async () => {
                        const full = await purchaseInvoicesService.getById(invoice.id)
                        openEditModal(full)
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    {invoice.status === 'draft' && (
                      <button
                        onClick={() => setConfirmingInvoice(invoice)}
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-1.5 text-[11px] font-medium text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Confirmar
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {invoicesData && (
        <Pagination
          currentPage={page}
          totalPages={invoicesData.pages}
          onPageChange={setPage}
          totalItems={invoicesData.total}
          itemsPerPage={20}
        />
      )}

      {/* ── Modales ── */}
      {formModal && (
        <PurchaseInvoiceFormModal
          mode={formModal.mode}
          invoice={formModal.invoice}
          suppliers={suppliers}
          onClose={() => setFormModal(null)}
          onSuccess={() => {
            setFormModal(null)
            invalidateAll()
          }}
        />
      )}

      {detailInvoiceId && (
        <PurchaseInvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          onEdit={openEditModal}
          onConfirm={openConfirmFromDetail}
        />
      )}

      {confirmingInvoice && (
        <PurchaseInvoiceConfirmModal
          invoice={confirmingInvoice}
          isLoading={confirmMutation.isPending}
          onClose={() => setConfirmingInvoice(null)}
          onConfirm={(options) => confirmMutation.mutate({ id: confirmingInvoice.id, ...options })}
        />
      )}

      {showAIModal && (
        <PurchaseInvoiceAIUploadModal
          onClose={() => setShowAIModal(false)}
          onExtracted={handleAIExtracted}
        />
      )}
    </div>
  )
}
