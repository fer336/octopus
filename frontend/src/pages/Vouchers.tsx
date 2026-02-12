/**
 * Página de Comprobantes.
 * Visualiza cotizaciones, remitos y facturas generadas.
 */
import { useState } from 'react'
import { FileText, Truck, Receipt, Search, Eye, Download, Trash2, AlertTriangle } from 'lucide-react'
import { Button, Table, Pagination, Select, Modal, Input } from '../components/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import vouchersService from '../api/vouchersService'
import toast from 'react-hot-toast'
import { formatErrorMessage } from '../utils/errorHelpers'

const voucherTypeLabels: Record<string, { label: string; color: string; icon: any }> = {
  quotation: { label: 'Cotización', color: 'blue', icon: FileText },
  receipt: { label: 'Remito', color: 'orange', icon: Truck },
  invoice_a: { label: 'Factura A', color: 'green', icon: Receipt },
  invoice_b: { label: 'Factura B', color: 'green', icon: Receipt },
  invoice_c: { label: 'Factura C', color: 'green', icon: Receipt },
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'gray' },
  confirmed: { label: 'Confirmado', color: 'green' },
  cancelled: { label: 'Anulado', color: 'red' },
}

export default function Vouchers() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [voucherToDelete, setVoucherToDelete] = useState<any>(null)
  const [deleteReason, setDeleteReason] = useState('')

  // Query para comprobantes
  const { data: vouchersData, isLoading, error } = useQuery({
    queryKey: ['vouchers', page, search, filterType, filterStatus],
    queryFn: () => vouchersService.getAll({ 
      page, 
      per_page: 20, 
      search,
      voucher_type: filterType || undefined,
      status: filterStatus || undefined
    }),
    retry: false,
  })

  // Mutation para eliminar comprobante
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => 
      vouchersService.delete(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] })
      toast.success('Comprobante eliminado correctamente', { icon: '✅' })
      setShowDeleteModal(false)
      setVoucherToDelete(null)
      setDeleteReason('')
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const handleViewPdf = async (voucherId: string) => {
    try {
      const pdfBlob = await vouchersService.getPdf(voucherId)
      const pdfUrl = URL.createObjectURL(pdfBlob)
      window.open(pdfUrl, '_blank')
      
      // Limpiar después de 10 segundos
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000)
    } catch (error) {
      console.error('Error al abrir PDF:', error)
      alert('Error al abrir el PDF. Por favor intenta nuevamente.')
    }
  }

  const handleDownloadPdf = async (voucherId: string, voucherNumber: string) => {
    try {
      const pdfBlob = await vouchersService.getPdf(voucherId)
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `comprobante-${voucherNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Limpiar
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000)
    } catch (error) {
      console.error('Error al descargar PDF:', error)
      alert('Error al descargar el PDF. Por favor intenta nuevamente.')
    }
  }

  const columns = [
    {
      key: 'type',
      header: 'Tipo',
      render: (item: any) => {
        const typeInfo = voucherTypeLabels[item.voucher_type] || { label: item.voucher_type, color: 'gray', icon: FileText }
        const Icon = typeInfo.icon
        return (
          <div className="flex items-center gap-2">
            <Icon size={16} className={`text-${typeInfo.color}-600`} />
            <span className={`text-xs font-medium text-${typeInfo.color}-700 dark:text-${typeInfo.color}-400`}>
              {typeInfo.label}
            </span>
          </div>
        )
      },
    },
    {
      key: 'number',
      header: 'Número',
      render: (item: any) => (
        <span className="font-mono text-sm font-medium">
          {item.sale_point}-{item.number}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (item: any) => {
        // Parsear fecha sin conversión de zona horaria
        // Si la fecha viene como "2026-02-06", tratarla como local
        const [year, month, day] = item.date.split('-')
        const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        return (
          <span className="text-sm">
            {localDate.toLocaleDateString('es-AR')}
          </span>
        )
      },
    },
    {
      key: 'client',
      header: 'Cliente',
      render: (item: any) => (
        <span className="text-sm">
          Cliente #{item.client_id.substring(0, 8)}...
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (item: any) => {
        const statusInfo = statusLabels[item.status] || { label: item.status, color: 'gray' }
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${statusInfo.color}-100 text-${statusInfo.color}-700 dark:bg-${statusInfo.color}-900/30 dark:text-${statusInfo.color}-400`}>
            {statusInfo.label}
          </span>
        )
      },
    },
    {
      key: 'total',
      header: 'Total',
      render: (item: any) => (
        <span className="text-sm font-bold text-gray-900 dark:text-white">
          ${item.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (item: any) => {
        const isDeleted = !!item.deleted_at
        return (
          <div className="flex gap-2 justify-end">
            {!isDeleted && (
              <>
                <button
                  onClick={() => handleViewPdf(item.id)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                  title="Ver PDF"
                >
                  <Eye size={18} />
                </button>
                <button
                  onClick={() => handleDownloadPdf(item.id, `${item.sale_point}-${item.number}`)}
                  className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                  title="Descargar PDF"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => {
                    setVoucherToDelete(item)
                    setShowDeleteModal(true)
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
            {isDeleted && (
              <span className="text-xs text-red-600 font-medium">ELIMINADO</span>
            )}
          </div>
        )
      },
    },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    const isUnauthorized = errorMessage.includes('401') || errorMessage.includes('Unauthorized')
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
          <FileText className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {isUnauthorized ? 'Sesión Expirada' : 'Error de Conexión'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          {isUnauthorized 
            ? 'Tu sesión ha caducado. Por favor inicia sesión nuevamente.' 
            : 'No pudimos cargar los comprobantes. Intenta nuevamente más tarde.'}
        </p>
        {isUnauthorized && (
          <Button onClick={() => window.location.href = '/login'}>Ir al Login</Button>
        )}
      </div>
    )
  }

  const vouchers = vouchersData?.items || []

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Comprobantes
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Historial de cotizaciones, remitos y facturas
          </p>
        </div>
        <Button onClick={() => window.location.href = '/sales'}>
          <FileText size={18} className="mr-2" />
          Nueva Venta
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número..."
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          <Select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            options={[
              { value: '', label: 'Todos los Tipos' },
              { value: 'quotation', label: 'Cotizaciones' },
              { value: 'receipt', label: 'Remitos' },
              { value: 'invoice_a', label: 'Facturas A' },
              { value: 'invoice_b', label: 'Facturas B' },
              { value: 'invoice_c', label: 'Facturas C' },
            ]}
          />
          
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: '', label: 'Todos los Estados' },
              { value: 'draft', label: 'Borradores' },
              { value: 'confirmed', label: 'Confirmados' },
              { value: 'cancelled', label: 'Anulados' },
            ]}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Table 
          columns={columns} 
          data={vouchers}
          emptyMessage="No se encontraron comprobantes."
        />
      </div>

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={vouchersData?.pages || 1}
        totalItems={vouchersData?.total || 0}
        onPageChange={setPage}
      />

      {/* Modal de Eliminación */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setVoucherToDelete(null)
          setDeleteReason('')
        }}
        title="Eliminar Comprobante"
      >
        {voucherToDelete && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  ¿Estás seguro?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Vas a eliminar el comprobante <strong>{voucherToDelete.sale_point}-{voucherToDelete.number}</strong>.
                  El registro quedará marcado como eliminado pero visible en el historial.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Motivo de eliminación (opcional)
              </label>
              <Input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Ej: Error en los datos, duplicado, etc."
              />
            </div>

            <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowDeleteModal(false)
                  setVoucherToDelete(null)
                  setDeleteReason('')
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button 
                variant="danger" 
                onClick={() => deleteMutation.mutate({ 
                  id: voucherToDelete.id, 
                  reason: deleteReason 
                })}
                disabled={deleteMutation.isPending}
                className="flex-1"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
