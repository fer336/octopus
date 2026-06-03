import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, List, Plus, RefreshCw, Trash2, Camera } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, ConfirmModal, Input, Modal } from '../components/ui'
import priceListsService, { PriceList } from '../api/priceListsService'
import { formatErrorMessage } from '../utils/errorHelpers'

interface ManualFormState {
  name: string
  snapshot_date: string
  notes: string
  itemsRaw: string
}

function parseItemsRaw(raw: string): Array<{ product_code: string; unit_price: number }> | null {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const result: Array<{ product_code: string; unit_price: number }> = []
  for (const line of lines) {
    const parts = line.split(',')
    if (parts.length < 2) return null
    const code = parts[0].trim()
    const price = parseFloat(parts[1].trim())
    if (!code || isNaN(price) || price < 0) return null
    result.push({ product_code: code, unit_price: price })
  }
  return result
}

function PriceListDetailModal({
  listId,
  listName,
  onClose,
}: {
  listId: string
  listName: string
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['price-lists', listId],
    queryFn: () => priceListsService.getById(listId),
    staleTime: 60_000,
  })

  return (
    <Modal isOpen onClose={onClose} title={listName} size="lg">
      {isLoading ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
          ))}
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No se pudo cargar el detalle.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {data.items.length === 0
              ? 'Esta lista no tiene ítems.'
              : `${data.items.length.toLocaleString('es-AR')} ítems`}
          </p>
          {data.items.length > 0 && (
            <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Código
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Precio
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {data.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">
                        {item.product_code}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-800 dark:text-gray-200">
                        ${Number(item.unit_price).toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ManualCreateModal({
  onClose,
  onSave,
  isSaving,
}: {
  onClose: () => void
  onSave: (form: ManualFormState) => void
  isSaving: boolean
}) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState<ManualFormState>({
    name: '',
    snapshot_date: today,
    notes: '',
    itemsRaw: '',
  })
  const [parseError, setParseError] = useState<string | null>(null)

  const handleSubmit = () => {
    setParseError(null)
    if (!form.name.trim()) {
      setParseError('El nombre es requerido.')
      return
    }
    if (form.itemsRaw.trim()) {
      const parsed = parseItemsRaw(form.itemsRaw)
      if (!parsed) {
        setParseError('Formato inválido. Cada línea debe ser: CODIGO,PRECIO (ej: PROD001,1500.00)')
        return
      }
    }
    onSave(form)
  }

  return (
    <Modal isOpen onClose={onClose} title="Nueva lista manual" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nombre <span className="text-red-500">*</span>
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Lista Junio 2026"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Fecha
          </label>
          <Input
            type="date"
            value={form.snapshot_date}
            onChange={(e) => setForm((f) => ({ ...f, snapshot_date: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Notas
            <span className="ml-1 font-normal text-gray-400">(opcional)</span>
          </label>
          <Input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Descripción de la lista..."
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Ítems
            <span className="ml-1 font-normal text-gray-400">(opcional)</span>
          </label>
          <p className="mb-1.5 text-xs text-gray-400 dark:text-gray-500">
            Una línea por producto: <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">CODIGO,PRECIO</code>
          </p>
          <textarea
            value={form.itemsRaw}
            onChange={(e) => {
              setParseError(null)
              setForm((f) => ({ ...f, itemsRaw: e.target.value }))
            }}
            rows={5}
            placeholder={'PROD001,1500.00\nPROD002,2300.50'}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {parseError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{parseError}</p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSaving}>
            Guardar lista
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function PriceLists() {
  const queryClient = useQueryClient()
  const [showManualModal, setShowManualModal] = useState(false)
  const [viewingList, setViewingList] = useState<PriceList | null>(null)
  const [deletingList, setDeletingList] = useState<PriceList | null>(null)

  const { data: lists = [], isLoading, error, refetch } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => priceListsService.getAll(),
    retry: false,
  })

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
      toast.success('Snapshot creado correctamente')
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

  const createMutation = useMutation({
    mutationFn: (form: ManualFormState) => {
      const items = form.itemsRaw.trim() ? (parseItemsRaw(form.itemsRaw) ?? []) : []
      return priceListsService.create({
        name: form.name.trim(),
        snapshot_date: form.snapshot_date,
        notes: form.notes.trim() || undefined,
        items,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
      toast.success('Lista creada correctamente')
      setShowManualModal(false)
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => priceListsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] })
      toast.success('Lista eliminada')
      setDeletingList(null)
    },
    onError: (err: unknown) => {
      toast.error(formatErrorMessage(err))
      setDeletingList(null)
    },
  })

  const isBusy = snapshotMutation.isPending || createMutation.isPending

  return (
    <div className="w-full max-w-none space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <List className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Listas de Precios
          </h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Snapshots históricos del catálogo de precios
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
          <Button
            size="sm"
            onClick={() => setShowManualModal(true)}
            disabled={isBusy}
          >
            <Plus size={14} className="mr-1" />
            Nueva lista
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {isLoading ? (
          <div className="p-4 space-y-2">
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
                Generá un snapshot del catálogo actual para guardar los precios de hoy como punto de referencia.
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
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Ítems
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Creada
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
                      <span className="font-medium text-gray-900 dark:text-white">
                        {list.name}
                      </span>
                      {list.notes && (
                        <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500 max-w-xs">
                          {list.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-400">
                      {new Date(`${list.snapshot_date}T00:00:00`).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        {list.item_count.toLocaleString('es-AR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {new Date(list.created_at).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
                          onClick={() => setDeletingList(list)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                          title="Eliminar lista"
                        >
                          <Trash2 size={14} />
                        </button>
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
          listId={viewingList.id}
          listName={viewingList.name}
          onClose={() => setViewingList(null)}
        />
      )}

      {/* Manual create modal */}
      {showManualModal && (
        <ManualCreateModal
          onClose={() => setShowManualModal(false)}
          onSave={(form) => createMutation.mutate(form)}
          isSaving={createMutation.isPending}
        />
      )}

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!deletingList}
        onClose={() => setDeletingList(null)}
        onConfirm={() => deletingList && deleteMutation.mutate(deletingList.id)}
        title="¿Eliminar lista?"
        description={`Vas a eliminar "${deletingList?.name}". Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
