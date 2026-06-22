import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, Camera, Copy, Eye, FileDown, FileSpreadsheet, List, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, ConfirmModal, Modal } from '../components/ui'
import priceListsService, { PriceList, PriceListDetail } from '../api/priceListsService'
import { formatErrorMessage } from '../utils/errorHelpers'
import DuplicatePriceListModal from '../components/price-lists/DuplicatePriceListModal'
import BulkAdjustModal from '../components/price-lists/BulkAdjustModal'
import PriceListSendLogPanel from '../components/price-lists/PriceListSendLogPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    expired: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    archived: 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400',
  }
  const labels: Record<string, string> = {
    draft: 'Borrador',
    active: 'Activa',
    expired: 'Vencida',
    archived: 'Archivada',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

function PriceListDetailModal({
  list,
  onClose,
  onBulkAdjust,
}: {
  list: PriceList
  onClose: () => void
  onBulkAdjust: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['price-lists', list.id],
    queryFn: () => priceListsService.getById(list.id),
    staleTime: 60_000,
  })

  const detail = data as PriceListDetail | undefined

  return (
    <Modal isOpen onClose={onClose} title={list.name} size="lg">
      {isLoading ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
          ))}
        </div>
      ) : !detail ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No se pudo cargar el detalle.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-gray-800/60">
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400">Estado:</span>
              <StatusBadge status={detail.status} />
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400">Moneda:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">{detail.currency}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400">Versión:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">v{detail.version}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400">IVA:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {detail.includes_tax ? 'Incluido' : 'No incluido'}
              </span>
            </div>
            {detail.valid_from && (
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">Desde:</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {new Date(`${detail.valid_from}T00:00:00`).toLocaleDateString('es-AR')}
                </span>
              </div>
            )}
            {detail.valid_until && (
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">Hasta:</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {new Date(`${detail.valid_until}T00:00:00`).toLocaleDateString('es-AR')}
                </span>
              </div>
            )}
            {detail.description && (
              <div className="col-span-2 flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">Descripción:</span>
                <span className="text-gray-800 dark:text-gray-200">{detail.description}</span>
              </div>
            )}
          </div>

          {/* Items table */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {detail.items.length === 0
                  ? 'Esta lista no tiene ítems.'
                  : `${detail.items.length.toLocaleString('es-AR')} ítems`}
              </p>
              {detail.items.length > 0 && (
                <Button size="sm" variant="outline" onClick={onBulkAdjust}>
                  Aplicar aumento
                </Button>
              )}
            </div>
            {detail.items.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Código
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Marca
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Categoría
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Unidad
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Precio base
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Dto %
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Neto
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                        IVA %
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Final
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {detail.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">
                          {item.product_code}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                          {item.brand_name ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                          {item.category_name ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
                          {item.unit ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-800 dark:text-gray-200">
                          {item.base_price != null
                            ? `$${Number(item.base_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-800 dark:text-gray-200">
                          {item.discount_percent}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-800 dark:text-gray-200">
                          {item.net_price != null
                            ? `$${Number(item.net_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-600 dark:text-gray-400">
                          {item.iva_rate != null ? `${item.iva_rate}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {item.final_price != null
                            ? `$${Number(item.final_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Send log panel */}
          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <PriceListSendLogPanel priceListId={list.id} />
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PriceLists() {
  const queryClient = useQueryClient()

  // Modal state
  const [viewingList, setViewingList] = useState<PriceList | null>(null)
  const [duplicatingList, setDuplicatingList] = useState<PriceList | null>(null)
  const [archivingList, setArchivingList] = useState<PriceList | null>(null)
  const [bulkAdjustListId, setBulkAdjustListId] = useState<string | null>(null)

  // List query — snapshot lists only
  const { data: lists = [], isLoading, error, refetch } = useQuery({
    queryKey: ['price-lists', 'snapshot'],
    queryFn: () => priceListsService.getAll('snapshot'),
    retry: false,
  })

  // Snapshot mutation
  const snapshotMutation = useMutation({
    mutationFn: () => {
      const now = new Date()
      const label = now.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      return priceListsService.snapshot(`Lista ${label}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
      toast.success('Snapshot creado correctamente', { duration: 3000 })
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: ({ id, name, validFrom, validUntil }: { id: string; name: string; validFrom: string; validUntil: string }) =>
      priceListsService.duplicate(id, {
        name,
        valid_from: validFrom || undefined,
        valid_until: validUntil || undefined,
      }),
    onSuccess: (newList) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
      toast.success('Lista duplicada correctamente', { duration: 3000 })
      setDuplicatingList(null)
      // Open the new list in detail view
      setViewingList({
        ...newList,
        item_count: newList.items.length,
      })
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: (id: string) => priceListsService.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
      toast.success('Lista archivada', { duration: 3000 })
      setArchivingList(null)
    },
    onError: (err: unknown) => {
      toast.error(formatErrorMessage(err))
      setArchivingList(null)
    },
  })

  // Bulk adjust mutation
  const bulkAdjustMutation = useMutation({
    mutationFn: ({ id, percent }: { id: string; percent: number }) =>
      priceListsService.bulkAdjust(id, { percent }),
    onSuccess: (result) => {
      if (viewingList) {
        queryClient.invalidateQueries({ queryKey: ['price-lists', viewingList.id] })
      }
      toast.success(`Aumento aplicado a ${result.affected} ítem(s)`, { duration: 3000 })
      setBulkAdjustListId(null)
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

  const isBusy = snapshotMutation.isPending

  const handleDownloadPdf = async (list: PriceList) => {
    try {
      await priceListsService.downloadPdf(list.id, list.name)
    } catch (err) {
      toast.error(formatErrorMessage(err))
    }
  }

  const handleDownloadExcel = async (list: PriceList) => {
    try {
      await priceListsService.downloadExcel(list.id, list.name)
    } catch (err) {
      toast.error(formatErrorMessage(err))
    }
  }

  return (
    <div className="w-full max-w-none space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <List className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Listas de Precios — Cuenta Corriente
          </h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Snapshots del catálogo de precios actuales
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => snapshotMutation.mutate()}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            title="Genera un snapshot de los precios actuales del catálogo"
          >
            {snapshotMutation.isPending ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Camera size={14} />
            )}
            Snapshot del catálogo
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="rounded-full bg-red-50 p-3 dark:bg-red-900/20">
              <List className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                Error al cargar las listas
              </p>
              <p className="mt-0.5 text-xs text-red-500 dark:text-red-400">
                {formatErrorMessage(error)}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
            >
              <RefreshCw size={12} />
              Reintentar
            </button>
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <div className="rounded-full bg-primary-50 p-4 dark:bg-primary-900/20">
              <List className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Sin listas guardadas
              </p>
              <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
                Creá una nueva lista o generá un snapshot del catálogo actual.
              </p>
            </div>
            <button
              onClick={() => snapshotMutation.mutate()}
              disabled={snapshotMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 transition hover:bg-primary-100 disabled:opacity-50 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300"
            >
              {snapshotMutation.isPending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
              Crear primer snapshot
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Nombre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Vigencia
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Ítems
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Versión
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {lists.map((list) => (
                  <tr
                    key={list.id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">{list.name}</span>
                      {list.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-gray-400 dark:text-gray-500">
                          {list.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={list.status} />
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {list.valid_from || list.valid_until ? (
                        <>
                          {list.valid_from
                            ? new Date(`${list.valid_from}T00:00:00`).toLocaleDateString('es-AR')
                            : '—'}
                          {' → '}
                          {list.valid_until
                            ? new Date(`${list.valid_until}T00:00:00`).toLocaleDateString('es-AR')
                            : '—'}
                        </>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">Sin vigencia</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {list.item_count.toLocaleString('es-AR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      v{list.version}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setViewingList(list)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-gray-700 dark:hover:text-primary-400"
                          title="Ver detalle"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => setDuplicatingList(list)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                          title="Duplicar lista"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(list)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                          title="Descargar PDF"
                        >
                          <FileDown size={14} />
                        </button>
                        <button
                          onClick={() => handleDownloadExcel(list)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400"
                          title="Descargar Excel"
                        >
                          <FileSpreadsheet size={14} />
                        </button>
                        {list.status !== 'archived' && (
                          <button
                            onClick={() => setArchivingList(list)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/30 dark:hover:text-orange-400"
                            title="Archivar lista"
                          >
                            <Archive size={14} />
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

      {/* Detail modal */}
      {viewingList && (
        <PriceListDetailModal
          list={viewingList}
          onClose={() => setViewingList(null)}
          onBulkAdjust={() => setBulkAdjustListId(viewingList.id)}
        />
      )}

      {/* Duplicate modal */}
      {duplicatingList && (
        <DuplicatePriceListModal
          isOpen
          originalName={duplicatingList.name}
          onClose={() => setDuplicatingList(null)}
          onConfirm={(name, validFrom, validUntil) =>
            duplicateMutation.mutate({ id: duplicatingList.id, name, validFrom, validUntil })
          }
          isPending={duplicateMutation.isPending}
        />
      )}

      {/* Bulk adjust modal */}
      <BulkAdjustModal
        isOpen={!!bulkAdjustListId}
        onClose={() => setBulkAdjustListId(null)}
        onConfirm={(percent) => {
          if (bulkAdjustListId) {
            bulkAdjustMutation.mutate({ id: bulkAdjustListId, percent })
          }
        }}
        isPending={bulkAdjustMutation.isPending}
      />

      {/* Archive confirm */}
      <ConfirmModal
        isOpen={!!archivingList}
        onClose={() => setArchivingList(null)}
        onConfirm={() => archivingList && archiveMutation.mutate(archivingList.id)}
        title="¿Archivar esta lista?"
        description={`Vas a archivar "${archivingList?.name}". La lista seguirá visible pero no podrá editarse.`}
        confirmText="Archivar"
        isLoading={archiveMutation.isPending}
      />
    </div>
  )
}
