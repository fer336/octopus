import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, Copy, Eye, FileDown, FileSpreadsheet, Package, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, ConfirmModal, Input, Modal, Select } from '../components/ui'
import priceListsService, { PriceList, PriceListDetail, PaymentCondition } from '../api/priceListsService'
import { formatErrorMessage } from '../utils/errorHelpers'
import DuplicatePriceListModal from '../components/price-lists/DuplicatePriceListModal'
import BulkAdjustModal from '../components/price-lists/BulkAdjustModal'
import PriceListSendLogPanel from '../components/price-lists/PriceListSendLogPanel'
import AddProductsToPriceListModal from '../components/price-lists/AddProductsToPriceListModal'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AVAILABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'product_code', label: 'Código' },
  { key: 'description', label: 'Descripción' },
  { key: 'brand_name', label: 'Marca' },
  { key: 'category_name', label: 'Categoría' },
  { key: 'supplier_code', label: 'Cód. Proveedor' },
  { key: 'unit', label: 'Unidad' },
  { key: 'quantity_per_package', label: 'Unid. x Bulto' },
  { key: 'pack_quantity', label: 'Bulto cerrado' },
  { key: 'min_quantity', label: 'Cant. mínima' },
  { key: 'base_price', label: 'Precio base' },
  { key: 'net_price', label: 'Precio neto' },
  { key: 'iva_rate', label: 'IVA %' },
  { key: 'final_price', label: 'Precio final' },
  { key: 'item_notes', label: 'Notas' },
]

const DEFAULT_COLUMNS = ['product_code', 'description', 'final_price', 'pack_quantity']

const PAYMENT_CONDITIONS_DEFAULTS: Array<{ label: string; surcharge_pct: string; enabled: boolean }> = [
  { label: 'Contado', surcharge_pct: '0', enabled: true },
  { label: '7 días', surcharge_pct: '0', enabled: false },
  { label: '15 días', surcharge_pct: '0', enabled: false },
  { label: '20 días', surcharge_pct: '0', enabled: false },
  { label: '30 días', surcharge_pct: '0', enabled: false },
]

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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.draft}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

interface WholesaleFormState {
  name: string
  description: string
  currency: string
  includes_tax: boolean
  valid_from: string
  valid_until: string
  status: 'draft' | 'active'
  notes: string
  visible_columns: string[]
  conditions: Array<{ label: string; surcharge_pct: string; enabled: boolean }>
}

function CreateWholesaleModal({
  onClose,
  onSave,
  isSaving,
}: {
  onClose: () => void
  onSave: (form: WholesaleFormState) => void
  isSaving: boolean
}) {
  const [form, setForm] = useState<WholesaleFormState>({
    name: '',
    description: '',
    currency: 'ARS',
    includes_tax: false,
    valid_from: '',
    valid_until: '',
    status: 'draft',
    notes: '',
    visible_columns: DEFAULT_COLUMNS,
    conditions: PAYMENT_CONDITIONS_DEFAULTS.map((c) => ({ ...c })),
  })
  const [error, setError] = useState<string | null>(null)

  const toggleColumn = (key: string) => {
    setForm((f) => ({
      ...f,
      visible_columns: f.visible_columns.includes(key)
        ? f.visible_columns.filter((c) => c !== key)
        : [...f.visible_columns, key],
    }))
  }

  const setConditionEnabled = (idx: number, enabled: boolean) => {
    setForm((f) => {
      const conditions = f.conditions.map((c, i) => (i === idx ? { ...c, enabled } : c))
      return { ...f, conditions }
    })
  }

  const setConditionPct = (idx: number, surcharge_pct: string) => {
    setForm((f) => {
      const conditions = f.conditions.map((c, i) => (i === idx ? { ...c, surcharge_pct } : c))
      return { ...f, conditions }
    })
  }

  const handleSubmit = () => {
    setError(null)
    if (!form.name.trim()) {
      setError('El nombre es requerido.')
      return
    }
    if (form.visible_columns.length === 0) {
      setError('Seleccioná al menos una columna para mostrar.')
      return
    }
    onSave(form)
  }

  const currencyOptions = [
    { value: 'ARS', label: 'ARS — Peso argentino' },
    { value: 'USD', label: 'USD — Dólar estadounidense' },
  ]
  const statusOptions = [
    { value: 'draft', label: 'Borrador' },
    { value: 'active', label: 'Activa' },
  ]

  return (
    <Modal isOpen onClose={onClose} title="Nueva lista mayorista" size="lg">
      <div className="space-y-5">
        {/* Basic fields */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nombre <span className="text-red-500">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Lista Mayorista Junio 2026"
              autoFocus
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Descripción <span className="ml-1 font-normal text-gray-400">(opcional)</span>
            </label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descripción de la lista..."
            />
          </div>
          <Select
            label="Moneda"
            options={currencyOptions}
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
          />
          <Select
            label="Estado"
            options={statusOptions}
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'draft' | 'active' }))}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Vigencia desde
            </label>
            <Input
              type="date"
              value={form.valid_from}
              onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Vigencia hasta
            </label>
            <Input
              type="date"
              value={form.valid_until}
              onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="wl_includes_tax"
            type="checkbox"
            checked={form.includes_tax}
            onChange={(e) => setForm((f) => ({ ...f, includes_tax: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="wl_includes_tax" className="text-sm text-gray-700 dark:text-gray-300">
            Incluye IVA
          </label>
        </div>

        {/* Column selector */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Columnas a mostrar
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {AVAILABLE_COLUMNS.map((col) => (
              <label key={col.key} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.visible_columns.includes(col.key)}
                  onChange={() => toggleColumn(col.key)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>

        {/* Payment conditions */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Condiciones de pago
          </p>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-600">
            {form.conditions.map((cond, idx) => (
              <div key={cond.label} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  id={`cond-${idx}`}
                  checked={cond.enabled}
                  onChange={(e) => setConditionEnabled(idx, e.target.checked)}
                  className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label
                  htmlFor={`cond-${idx}`}
                  className="w-20 flex-shrink-0 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {cond.label}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="999"
                    step="0.01"
                    value={cond.surcharge_pct}
                    onChange={(e) => setConditionPct(idx, e.target.value)}
                    disabled={!cond.enabled}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">% recargo</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            El recargo se aplica sobre el precio final al exportar PDF/Excel.
          </p>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSaving}>
            Crear lista
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

function WholesaleDetailModal({
  list,
  onClose,
  onBulkAdjust,
  onAddProducts,
}: {
  list: PriceList
  onClose: () => void
  onBulkAdjust: () => void
  onAddProducts: (detail: PriceListDetail) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['price-lists', list.id],
    queryFn: () => priceListsService.getById(list.id),
    staleTime: 60_000,
  })

  const detail = data as PriceListDetail | undefined
  const canEditItems = detail?.status === 'draft'
  const visibleColumns: string[] = list.column_config?.visible_columns ?? DEFAULT_COLUMNS
  const conditions: PaymentCondition[] = list.payment_conditions ?? []

  const colLabel = (key: string) => AVAILABLE_COLUMNS.find((c) => c.key === key)?.label ?? key

  return (
    <Modal isOpen onClose={onClose} title={list.name} size="xl">
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
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-gray-800/60 sm:grid-cols-3">
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
            {detail.valid_from && (
              <div className="flex gap-2 sm:col-span-2">
                <span className="text-gray-500 dark:text-gray-400">Vigencia:</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {new Date(`${detail.valid_from}T00:00:00`).toLocaleDateString('es-AR')}
                  {detail.valid_until && ` → ${new Date(`${detail.valid_until}T00:00:00`).toLocaleDateString('es-AR')}`}
                </span>
              </div>
            )}
            {conditions.length > 0 && (
              <div className="flex gap-2 sm:col-span-3">
                <span className="text-gray-500 dark:text-gray-400">Condiciones:</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {conditions.map((c) => `${c.label} +${c.surcharge_pct}%`).join(' · ')}
                </span>
              </div>
            )}
          </div>

          {/* Items table */}
          {detail.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Esta lista no tiene ítems.{' '}
              {canEditItems ? (
                <button
                  onClick={() => onAddProducts(detail)}
                  className="text-primary-600 underline hover:text-primary-700 dark:text-primary-400"
                >
                  Agregar productos
                </button>
              ) : null}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    {visibleColumns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        {colLabel(col)}
                      </th>
                    ))}
                    {conditions.map((cond) => (
                      <th
                        key={cond.label}
                        className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400"
                      >
                        {cond.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {detail.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      {visibleColumns.map((col) => {
                        const raw = (item as unknown as Record<string, unknown>)[col]
                        return (
                          <td key={col} className="px-3 py-2 text-gray-800 dark:text-gray-200">
                            {raw !== null && raw !== undefined ? String(raw) : '—'}
                          </td>
                        )
                      })}
                      {conditions.map((cond) => {
                        const base = item.final_price ?? item.unit_price
                        const price = base * (1 + cond.surcharge_pct / 100)
                        return (
                          <td key={cond.label} className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">
                            {price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Send log */}
          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <PriceListSendLogPanel priceListId={list.id} />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {canEditItems && (
              <>
                <Button variant="secondary" onClick={() => onAddProducts(detail)}>
                  <Plus size={14} className="mr-1" />
                  Agregar productos
                </Button>
                {detail.items.length > 0 && (
                  <Button variant="ghost" onClick={onBulkAdjust}>
                    <RefreshCw size={14} className="mr-1" />
                    Aplicar aumento
                  </Button>
                )}
              </>
            )}
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

export default function WholesalePriceLists() {
  const queryClient = useQueryClient()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewingList, setViewingList] = useState<PriceList | null>(null)
  const [duplicatingList, setDuplicatingList] = useState<PriceList | null>(null)
  const [archivingList, setArchivingList] = useState<PriceList | null>(null)
  const [bulkAdjustListId, setBulkAdjustListId] = useState<string | null>(null)
  const [addProductsTarget, setAddProductsTarget] = useState<PriceListDetail | null>(null)

  const { data: lists = [], isLoading, error, refetch } = useQuery({
    queryKey: ['price-lists', 'wholesale'],
    queryFn: () => priceListsService.getAll('wholesale'),
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: (form: WholesaleFormState) => {
      const today = new Date().toISOString().split('T')[0]
      const enabledConditions: PaymentCondition[] = form.conditions
        .filter((c) => c.enabled)
        .map((c) => ({
          label: c.label,
          surcharge_pct: parseFloat(c.surcharge_pct) || 0,
        }))
      return priceListsService.create({
        name: form.name.trim(),
        snapshot_date: today,
        description: form.description.trim() || undefined,
        currency: form.currency,
        includes_tax: form.includes_tax,
        valid_from: form.valid_from || undefined,
        valid_until: form.valid_until || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
        list_type: 'wholesale',
        column_config: { visible_columns: form.visible_columns },
        payment_conditions: enabledConditions.length > 0 ? enabledConditions : undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists', 'wholesale'] })
      toast.success('Lista mayorista creada', { duration: 3000 })
      setShowCreateModal(false)
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

  const duplicateMutation = useMutation({
    mutationFn: ({ id, name, validFrom, validUntil }: { id: string; name: string; validFrom: string; validUntil: string }) =>
      priceListsService.duplicate(id, {
        name,
        valid_from: validFrom || undefined,
        valid_until: validUntil || undefined,
      }),
    onSuccess: (newList) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists', 'wholesale'] })
      toast.success('Lista duplicada correctamente', { duration: 3000 })
      setDuplicatingList(null)
      setViewingList({ ...newList, item_count: newList.items.length })
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => priceListsService.archive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-lists', 'wholesale'] })
      toast.success('Lista archivada', { duration: 3000 })
      setArchivingList(null)
    },
    onError: (err: unknown) => {
      toast.error(formatErrorMessage(err))
      setArchivingList(null)
    },
  })

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

  const addProductsMutation = useMutation({
    mutationFn: ({ id, productIds }: { id: string; productIds: string[] }) =>
      priceListsService.addProducts(id, { product_ids: productIds }),
    onSuccess: (items) => {
      if (addProductsTarget) {
        queryClient.invalidateQueries({ queryKey: ['price-lists', addProductsTarget.id] })
      }
      queryClient.invalidateQueries({ queryKey: ['price-lists', 'wholesale'] })
      toast.success(`Se importaron ${items.length} producto(s)`, { duration: 3000 })
      setAddProductsTarget(null)
    },
    onError: (err: unknown) => toast.error(formatErrorMessage(err)),
  })

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
            <Package className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Listas de Precios Mayoristas
          </h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Listas personalizadas con columnas y condiciones de pago configurables
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          <Plus size={14} className="mr-1" />
          Nueva lista mayorista
        </Button>
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
              <Package className="h-6 w-6 text-red-500" />
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
              <Package className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Sin listas mayoristas
              </p>
              <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
                Creá tu primera lista con columnas y condiciones de pago personalizadas.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus size={14} className="mr-1" />
              Nueva lista mayorista
            </Button>
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
                    Condiciones
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
                  <tr key={list.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
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
                    <td className="px-4 py-3">
                      {list.payment_conditions && list.payment_conditions.length > 0 ? (
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {list.payment_conditions.map((c) => c.label).join(' · ')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      )}
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

      {/* Modals */}
      {showCreateModal && (
        <CreateWholesaleModal
          onClose={() => setShowCreateModal(false)}
          onSave={(form) => createMutation.mutate(form)}
          isSaving={createMutation.isPending}
        />
      )}

      {viewingList && (
        <WholesaleDetailModal
          list={viewingList}
          onClose={() => setViewingList(null)}
          onBulkAdjust={() => setBulkAdjustListId(viewingList.id)}
          onAddProducts={(detail) => setAddProductsTarget(detail)}
        />
      )}

      {addProductsTarget && (
        <AddProductsToPriceListModal
          isOpen
          listName={addProductsTarget.name}
          existingItems={addProductsTarget.items}
          onClose={() => setAddProductsTarget(null)}
          onConfirm={(productIds) => addProductsMutation.mutate({ id: addProductsTarget.id, productIds })}
          isPending={addProductsMutation.isPending}
        />
      )}

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
