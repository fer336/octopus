/**
 * Página de Acopios (Stockpiles).
 * Vista de solo consulta - la creación es exclusivamente desde Ventas.
 */
import { useState } from 'react'
import { Search, Package, ChevronRight, ChevronDown, FileText, Trash2, Eye, Download, Mail } from 'lucide-react'
import { Button, Modal, ConfirmModal } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import stockpileService, { type StockpileResponse, type StockpileItemResponse, type StockpileTreeItem } from '../api/stockpileService'
import WhatsAppSendPdfButton from '../components/messaging/WhatsAppSendPdfButton'

// Estados del acopio
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Abierto', color: 'text-green-700', bg: 'bg-green-100' },
  partial: { label: 'Parcial', color: 'text-orange-700', bg: 'bg-orange-100' },
  completed: { label: 'Completado', color: 'text-gray-700', bg: 'bg-gray-100' },
  cancelled: { label: 'Cancelado', color: 'text-red-700', bg: 'bg-red-100' },
  archived: { label: 'Archivado', color: 'text-gray-100', bg: 'bg-gray-700' },
}

function getStatusStyle(status: string) {
  return STATUS_LABELS[status] || STATUS_LABELS.open
}

export default function Stockpiles() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  
  // Estados para modal
  const [selectedStockpile, setSelectedStockpile] = useState<StockpileResponse | null>(null)
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [stockpileToDelete, setStockpileToDelete] = useState<{ id: string; name: string } | null>(null)
  const [voucherToCancel, setVoucherToCancel] = useState<{ id: string; number: string; stockpileId: string; stockpileName: string } | null>(null)
  const [confirmArchiveCancelled, setConfirmArchiveCancelled] = useState(false)
  const [downloadingSnapshotId, setDownloadingSnapshotId] = useState<string | null>(null)

  const archiveCancelledMutation = useMutation({
    mutationFn: () => stockpileService.archiveCancelledStockpiles(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['stockpiles-tree'] })
      toast.success(`Archivados ${res.count} acopio(s) cancelado(s)`, { duration: 2500, icon: '✅' })
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Query
  const { data: stockpilesTreeData, isLoading } = useQuery({
    queryKey: ['stockpiles-tree', statusFilter],
    queryFn: () => stockpileService.getTree({ status: statusFilter || undefined }),
    retry: false,
  })

  // Filtrar por búsqueda
  const filteredItems = (() => {
    if (!stockpilesTreeData?.items) return []
    if (!search) return stockpilesTreeData.items
    
    const searchLower = search.toLowerCase()
    return stockpilesTreeData.items.filter(item => 
      (item.stockpile_number || '').toLowerCase().includes(searchLower) ||
      item.client_name.toLowerCase().includes(searchLower) ||
      (item.name || '').toLowerCase().includes(searchLower) ||
      (item.description || '').toLowerCase().includes(searchLower)
    )
  })()

  const sendPriceSnapshotEmailMutation = useMutation({
    mutationFn: (stockpileId: string) => stockpileService.sendPriceSnapshotEmail(stockpileId),
    onSuccess: (result) => {
      if (result.sent) {
        toast.success('Email enviado', { duration: 2500, icon: '✅' })
        return
      }

      toast.error(result.reason ? `No se pudo enviar: ${result.reason}` : 'No se pudo enviar el email')
    },
    onError: (error: unknown) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Ver detalle
  const handleViewStockpile = async (item: any) => {
    try {
      const detail = await stockpileService.getById(item.id)
      setSelectedStockpile(detail)
    } catch {
      toast.error('Error al cargar detalle')
    }
  }

  // Delete mutation
  const cancelMutation = useMutation({
    mutationFn: (id: string) => stockpileService.cancelStockpileExplicit(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['stockpiles-tree'] })
      const previous = queryClient.getQueriesData({ queryKey: ['stockpiles-tree'] })

      previous.forEach(([key, data]: any) => {
        if (!data?.items) return
        queryClient.setQueryData(key, {
          ...data,
          items: data.items.filter((sp: any) => sp.id !== id),
          total: Math.max(0, (data.total || 0) - 1),
        })
      })

      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockpiles-tree'] })
      toast.success('Acopio cancelado', { duration: 3000, icon: '✅' })
      setStockpileToDelete(null)
    },
    onError: (error: any, _id, context: any) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]: any) => {
          queryClient.setQueryData(key, data)
        })
      }
      toast.error(formatErrorMessage(error))
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ name: string; description: string; notes: string }> }) =>
      stockpileService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockpiles-tree'] })
      toast.success('Acopio actualizado', { duration: 3000, icon: '✅' })
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Ver remito hijo - abre el PDF directamente
  const handleViewVoucher = async (voucherId: string) => {
    if (!voucherId) return toast.error('ID de remito inválido')
    try {
      const blob = await stockpileService.getVoucherById(voucherId)
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => window.URL.revokeObjectURL(url), 30_000)
    } catch {
      toast.error('Error al abrir remito')
    }
  }

  // Descargar PDF del remito hijo
  const handleDownloadVoucher = async (voucherId: string) => {
    try {
      const blob = await stockpileService.downloadVoucherPdf(voucherId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `remito-${voucherId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('PDF descargado', { duration: 2000, icon: '✅' })
    } catch {
      toast.error('Error al descargar PDF')
    }
  }

  const getSnapshotFilename = (item: StockpileTreeItem) => {
    const identifier = item.stockpile_number || item.id
    return `precios-congelados-${identifier.replace(/[^a-zA-Z0-9_-]/g, '-')}.xlsx`
  }

  const handleDownloadPriceSnapshot = async (item: StockpileTreeItem) => {
    try {
      setDownloadingSnapshotId(item.id)
      const blob = await stockpileService.downloadPriceSnapshot(item.id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = getSnapshotFilename(item)
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Excel descargado', { duration: 2000, icon: '✅' })
    } catch (error: unknown) {
      toast.error(formatErrorMessage(error))
    } finally {
      setDownloadingSnapshotId(null)
    }
  }

  // Eliminar remito hijo mutation
  const deleteChildVoucherMutation = useMutation({
    mutationFn: ({ stockpileId, voucherId }: { stockpileId: string; voucherId: string }) =>
      stockpileService.cancelPartialVoucher(stockpileId, voucherId),
    onMutate: async ({ voucherId }: { stockpileId: string; voucherId: string }) => {
      await queryClient.cancelQueries({ queryKey: ['stockpiles-tree'] })
      const previous = queryClient.getQueriesData({ queryKey: ['stockpiles-tree'] })

      previous.forEach(([key, data]: any) => {
        if (!data?.items) return
        const nextItems = data.items.map((sp: any) => {
          const child = (sp.child_vouchers || []).find((v: any) => v.id === voucherId)
          if (!child) return sp
          const childTotal = Number(child.total || 0)
          const nextWithdrawn = Math.max(0, Number(sp.withdrawn_amount || 0) - childTotal)
          const nextRemaining = Number(sp.remaining_amount || 0) + childTotal
          const activeChildren = (sp.child_vouchers || []).filter((v: any) => v.id !== voucherId && v.status !== 'cancelled')
          let nextStatus = sp.status
          if (nextWithdrawn <= 0) {
            nextStatus = activeChildren.length === 0 ? 'cancelled' : 'open'
          } else if (nextWithdrawn < Number(sp.initial_amount || 0)) {
            nextStatus = 'partial'
          } else {
            nextStatus = 'completed'
          }
          return {
            ...sp,
            child_vouchers: sp.child_vouchers.map((v: any) => (
              v.id === voucherId ? { ...v, status: 'cancelled' } : v
            )),
            withdrawn_amount: nextWithdrawn,
            remaining_amount: nextRemaining,
            status: nextStatus,
          }
        })

        queryClient.setQueryData(key, {
          ...data,
          items: nextItems,
        })
      })

      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockpiles-tree'] })
      toast.success('Remito anulado', { duration: 3000, icon: '✅' })
      setVoucherToCancel(null)
    },
    onError: (error: any, _id, context: any) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]: any) => {
          queryClient.setQueryData(key, data)
        })
      }
      toast.error(formatErrorMessage(error))
    },
  })

  const startEdit = () => {
    setEditName(selectedStockpile?.name || '')
    setEditDescription(selectedStockpile?.description || '')
    setEditNotes(selectedStockpile?.notes || '')
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditName('')
    setEditDescription('')
    setEditNotes('')
  }

  const saveEdit = () => {
    if (!selectedStockpile) return
    updateMutation.mutate({
      id: selectedStockpile.id,
      data: { name: editName.trim(), description: editDescription.trim(), notes: editNotes.trim() },
    })
    setEditMode(false)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Package className="text-primary-600" size={24} />
          <h1 className="text-xl font-semibold">Acopios</h1>
        </div>
        {filteredItems.some((i) => i.status === 'cancelled') && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmArchiveCancelled(true)}
            disabled={archiveCancelledMutation.isPending}
          >
            {archiveCancelledMutation.isPending ? 'Archivando...' : 'Limpiar acopios cancelados'}
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por número, cliente u obra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="">Todos los estados</option>
          <option value="open">Abierto</option>
          <option value="partial">Parcial</option>
          <option value="completed">Completado</option>
          <option value="cancelled">Cancelado</option>
          <option value="archived">Archivado</option>
        </select>
      </div>

      {/* Lista de cards */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No hay acopios para mostrar</div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {filteredItems.map((item) => {
            const isExpanded = expandedRows.has(item.id)
            const statusStyle = getStatusStyle(item.status)
            
            return (
              <div key={item.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                {/* Card principal */}
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  {/* Info izquierda */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown size={18} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={18} className="text-gray-400" />
                        )}
                      </button>
                      <span className="rounded-md bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-200">
                        {item.stockpile_number || 'Sin número'}
                      </span>
                      {item.principal_voucher_number && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          Remito {item.principal_voucher_number}
                          {item.principal_voucher_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewVoucher(item.principal_voucher_id as string)
                              }}
                              className="inline-flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-white dark:bg-gray-900/60 dark:text-blue-300"
                              title="Ver detalle del remito principal"
                            >
                              <Eye size={12} />
                              Ver detalle
                            </button>
                          )}
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyle.color} ${statusStyle.bg}`}>
                        {STATUS_LABELS[item.status]?.label || item.status}
                      </span>
                    </div>
                    
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {item.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Cliente: {item.client_name} · {new Date(item.created_at).toLocaleDateString('es-AR')}
                    </p>
                    {item.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Montos derecha */}
                  <div className="flex gap-6 text-sm lg:text-right">
                    <div>
                      <p className="text-xs text-gray-500">Inicial</p>
                      <p className="font-semibold">${item.initial_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Retirado</p>
                      <p className="font-semibold text-orange-600">${item.withdrawn_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Saldo</p>
                      <p className="font-semibold text-green-600">${item.remaining_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {item.has_price_snapshot && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDownloadPriceSnapshot(item) }}
                          disabled={downloadingSnapshotId === item.id}
                        >
                          <Download size={14} />
                          {downloadingSnapshotId === item.id ? 'Descargando...' : 'Descargar Excel'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); sendPriceSnapshotEmailMutation.mutate(item.id) }}
                          disabled={sendPriceSnapshotEmailMutation.isPending && sendPriceSnapshotEmailMutation.variables === item.id}
                        >
                          <Mail size={14} />
                          {sendPriceSnapshotEmailMutation.isPending && sendPriceSnapshotEmailMutation.variables === item.id
                            ? 'Enviando...'
                            : 'Enviar por Email'}
                        </Button>
                      </>
                    )}
                    {item.status === 'open' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setStockpileToDelete({ id: item.id, name: item.name }) }}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Cancelar"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleViewStockpile(item) }}
                      className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                      title="Ver detalle"
                    >
                      <FileText size={18} />
                    </button>
                  </div>
                </div>

                {/* Sección expandida */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    {item.principal_voucher_number && item.principal_voucher_id && (
                      <div className="mb-3">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Remito principal</h4>
                        <div className="bg-white dark:bg-gray-800 rounded-lg border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 dark:bg-gray-700">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Remito</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Fecha</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Estado</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="px-3 py-2 font-medium">{item.principal_voucher_number}</td>
                                <td className="px-3 py-2">{new Date(item.created_at).toLocaleDateString('es-AR')}</td>
                                <td className="px-3 py-2 text-right">${item.initial_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Confirmado</span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleViewVoucher(item.principal_voucher_id as string)}
                                      className="p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                      title="Ver remito principal"
                                    >
                                      <Eye size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleDownloadVoucher(item.principal_voucher_id as string)}
                                      className="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                                      title="Descargar PDF"
                                    >
                                      <Download size={16} />
                                    </button>
                                    <WhatsAppSendPdfButton
                                      defaultClientId={item.billing_client_id || item.client_id || ''}
                                      getPdfBlob={() => stockpileService.downloadVoucherPdf(item.principal_voucher_id as string)}
                                      filename={`remito-${item.principal_voucher_number}.pdf`}
                                      caption={`Remito ${item.principal_voucher_number}`}
                                      size={14}
                                    />
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {item.child_vouchers && item.child_vouchers.length > 0 ? (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Remitos Parciales</h4>
                        <div className="bg-white dark:bg-gray-800 rounded-lg border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 dark:bg-gray-700">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Remito</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Fecha</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Estado</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {item.child_vouchers.map((voucher) => (
                                <tr key={voucher.id} className={voucher.status === 'cancelled' ? 'opacity-70' : ''}>
                                  <td className={`px-3 py-2 font-medium ${voucher.status === 'cancelled' ? 'line-through text-gray-500' : ''}`}>{voucher.number}</td>
                                  <td className="px-3 py-2">{new Date(voucher.date).toLocaleDateString('es-AR')}</td>
                                  <td className="px-3 py-2 text-right">${voucher.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      voucher.status === 'cancelled'
                                        ? 'bg-gray-200 text-gray-700'
                                        : voucher.status === 'confirmed'
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                      {voucher.status === 'cancelled' ? 'Anulado' : voucher.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => handleViewVoucher(voucher.id)}
                                        className="p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                        title="Ver remito"
                                      >
                                        <Eye size={16} />
                                      </button>
                                      <button
                                        onClick={() => handleDownloadVoucher(voucher.id)}
                                        className="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                                        title="Descargar PDF"
                                      >
                                        <Download size={16} />
                                      </button>
                                      <WhatsAppSendPdfButton
                                        defaultClientId={item.billing_client_id || item.client_id || ''}
                                        getPdfBlob={() => stockpileService.downloadVoucherPdf(voucher.id)}
                                        filename={`remito-${voucher.number}.pdf`}
                                        caption={`Remito ${voucher.number}`}
                                        size={14}
                                      />
                                      {voucher.status !== 'cancelled' && (
                                        <button
                                          onClick={() => setVoucherToCancel({ id: voucher.id, number: voucher.number, stockpileId: item.id, stockpileName: item.name })}
                                          className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                          title="Anular remito"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Sin remitos parciales todavía</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de detalle */}
      <Modal
        isOpen={!!selectedStockpile}
        onClose={() => { setSelectedStockpile(null); setEditMode(false) }}
        title={editMode ? 'Editar Acopio' : `Acopio: ${selectedStockpile?.name || ''}`}
        size="lg"
      >
        {selectedStockpile && (
          <div className="space-y-4">
            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Nombre / Obra</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Descripción</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Notas internas</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                    rows={2}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Cliente:</span>
                  <div className="font-medium">{selectedStockpile.client_name}</div>
                </div>
                <div>
                  <span className="text-gray-500">Estado:</span>
                  <div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(selectedStockpile.status).color} ${getStatusStyle(selectedStockpile.status).bg}`}>
                      {STATUS_LABELS[selectedStockpile.status]?.label || selectedStockpile.status}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Inicial:</span>
                  <div className="font-medium">${selectedStockpile.initial_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <span className="text-gray-500">Retirado:</span>
                  <div className="font-medium text-orange-600">${selectedStockpile.withdrawn_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <span className="text-gray-500">Saldo:</span>
                  <div className="font-medium text-green-600">${selectedStockpile.remaining_amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                </div>
                {selectedStockpile.description && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Descripción:</span>
                    <div className="font-medium">{selectedStockpile.description}</div>
                  </div>
                )}
              </div>
            )}

            {selectedStockpile.items && selectedStockpile.items.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Productos</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left">Código</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">Retirado</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedStockpile.items.map((item: StockpileItemResponse) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.product_code}</td>
                          <td className="px-3 py-2 text-right">{item.quantity_initial}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{item.quantity_withdrawn}</td>
                          <td className="px-3 py-2 text-right font-medium">{item.quantity_remaining}</td>
                          <td className="px-3 py-2 text-right">${item.frozen_total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              {editMode ? (
                <>
                  <Button variant="secondary" onClick={cancelEdit}>Cancelar</Button>
                  <Button onClick={saveEdit} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={startEdit}>Editar</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ConfirmModal para cancelar */}
      <ConfirmModal
        isOpen={!!stockpileToDelete}
        onClose={() => setStockpileToDelete(null)}
        onConfirm={() => stockpileToDelete && cancelMutation.mutate(stockpileToDelete.id)}
        title="Cancelar Acopio"
        description={`¿Estás seguro de cancelar "${stockpileToDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmText="Sí, cancelar"
        variant="danger"
      />

      {/* Modal para ver remito hijo */}
      <Modal
        isOpen={!!selectedVoucher}
        onClose={() => setSelectedVoucher(null)}
        title={`Remito ${selectedVoucher?.number || ''}`}
        size="lg"
      >
        {selectedVoucher && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Fecha:</span>
                <div className="font-medium">{new Date(selectedVoucher.date).toLocaleDateString('es-AR')}</div>
              </div>
              <div>
                <span className="text-gray-500">Estado:</span>
                <div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    selectedVoucher.status === 'confirmed' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {selectedVoucher.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}
                  </span>
                </div>
              </div>
              {selectedVoucher.client_name && (
                <div>
                  <span className="text-gray-500">Cliente:</span>
                  <div className="font-medium">{selectedVoucher.client_name}</div>
                </div>
              )}
              <div>
                <span className="text-gray-500">Total:</span>
                <div className="font-medium">${selectedVoucher.total?.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            {selectedVoucher.items && selectedVoucher.items.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Productos</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-3 py-2 text-left">Código</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedVoucher.items.map((item: any) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.product_code}</td>
                          <td className="px-3 py-2">{item.product_description}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="secondary" onClick={() => handleDownloadVoucher(selectedVoucher.id)}>
                Descargar PDF
              </Button>
              {selectedVoucher.client_id && (
                <WhatsAppSendPdfButton
                  defaultClientId={selectedVoucher.billing_client_id || selectedVoucher.client_id}
                  getPdfBlob={() => stockpileService.downloadVoucherPdf(selectedVoucher.id)}
                  filename={`remito-${selectedVoucher.number}.pdf`}
                  caption={`Remito ${selectedVoucher.number}`}
                />
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ConfirmModal para eliminar remito hijo */}
      <ConfirmModal
        isOpen={!!voucherToCancel}
        onClose={() => setVoucherToCancel(null)}
        onConfirm={() => voucherToCancel && deleteChildVoucherMutation.mutate({ stockpileId: voucherToCancel.stockpileId, voucherId: voucherToCancel.id })}
        title="Anular Remito"
        description="¿Anular este remito? Se revertirá el stock y el monto al acopio."
        confirmText={deleteChildVoucherMutation.isPending ? "Anulando..." : "Sí, anular"}
        variant="danger"
        isLoading={deleteChildVoucherMutation.isPending}
      />

      <ConfirmModal
        isOpen={confirmArchiveCancelled}
        onClose={() => setConfirmArchiveCancelled(false)}
        onConfirm={() => {
          setConfirmArchiveCancelled(false)
          archiveCancelledMutation.mutate()
        }}
        title="Archivar acopios cancelados"
        description="¿Archivar todos los acopios cancelados? Esta acción los moverá al historial y no aparecerán en el árbol activo."
        confirmText="Sí, archivar"
        variant="danger"
      />
    </div>
  )
}
