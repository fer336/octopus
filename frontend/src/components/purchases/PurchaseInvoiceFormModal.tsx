/**
 * Modal de alta/edición de Factura de Compra.
 * Un mismo formulario cubre tres casos:
 *   - Alta manual (crea un borrador nuevo)
 *   - Edición de borrador (manual o IA, revisión previa a confirmar)
 *   - Edición post-confirmación (reversión): si el backend detecta lotes ya
 *     consumidos responde 409 con los conflictos — se muestran acá y el
 *     usuario debe confirmar explícitamente el ajuste forzado para reintentar.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, Sparkles, Trash2, X } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Button, Select } from '../ui'
import { Supplier } from '../../api/suppliersService'
import purchaseInvoicesService, {
  PurchaseInvoice,
  PurchaseInvoiceItemInput,
  ReversalConflictError,
} from '../../api/purchaseInvoicesService'
import ProductSearchModal from '../sales/ProductSearchModal'

// ─── Tipos locales ─────────────────────────────────────────────────────────

interface ItemRow {
  key: string
  product_id: string | null
  product_code?: string | null
  description: string
  quantity: string
  unit_cost: string
  iva_rate: string
  expiration_date: string
}

export type FormMode = 'create' | 'edit-draft' | 'edit-confirmed'

interface Props {
  mode: FormMode
  /** Factura existente a editar (borrador o confirmada). Ausente en modo 'create'. */
  invoice?: PurchaseInvoice
  suppliers: Supplier[]
  onClose: () => void
  onSuccess: () => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value)
}

let rowKeySeq = 0
function nextRowKey(): string {
  rowKeySeq += 1
  return `row-${rowKeySeq}`
}

function rowsFromInvoice(invoice?: PurchaseInvoice): ItemRow[] {
  if (!invoice || invoice.items.length === 0) return []
  return invoice.items.map((item) => ({
    key: nextRowKey(),
    product_id: item.product_id,
    product_code: item.product_code,
    description: item.description,
    quantity: String(item.quantity),
    unit_cost: String(item.unit_cost),
    iva_rate: String(item.iva_rate),
    expiration_date: item.expiration_date ?? '',
  }))
}

// ─── Componente ────────────────────────────────────────────────────────────

export default function PurchaseInvoiceFormModal({
  mode,
  invoice,
  suppliers,
  onClose,
  onSuccess,
}: Props) {
  const [supplierId, setSupplierId] = useState(invoice?.supplier_id ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoice_number ?? '')
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoice_date ?? '')
  const [items, setItems] = useState<ItemRow[]>(() => rowsFromInvoice(invoice))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showProductSearch, setShowProductSearch] = useState(false)

  // Conflicto de reversión (edición post-confirmación)
  const [conflict, setConflict] = useState<ReversalConflictError | null>(null)
  const [isForcing, setIsForcing] = useState(false)

  const isReversal = mode === 'edit-confirmed'
  const title =
    mode === 'create'
      ? 'Nueva Factura de Compra'
      : mode === 'edit-draft'
      ? 'Editar Borrador'
      : 'Editar Factura Confirmada'

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        key: nextRowKey(),
        product_id: null,
        description: '',
        quantity: '1',
        unit_cost: '0',
        iva_rate: '21.00',
        expiration_date: '',
      },
    ])
  }

  const removeRow = (key: string) => {
    setItems((prev) => prev.filter((r) => r.key !== key))
  }

  const updateRow = (key: string, field: keyof ItemRow, value: string) => {
    setItems((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    )
  }

  const handleAddProducts = (
    products: Array<{ id: string; code: string; description: string }>,
  ) => {
    setItems((prev) => [
      ...prev,
      ...products.map((p) => ({
        key: nextRowKey(),
        product_id: p.id,
        product_code: p.code,
        description: p.description,
        quantity: '1',
        unit_cost: '0',
        iva_rate: '21.00',
        expiration_date: '',
      })),
    ])
  }

  const totals = useMemo(() => {
    let subtotal = 0
    let ivaAmount = 0
    for (const row of items) {
      const qty = Number(row.quantity) || 0
      const cost = Number(row.unit_cost) || 0
      const ivaRate = Number(row.iva_rate) || 0
      const sub = qty * cost
      subtotal += sub
      ivaAmount += sub * (ivaRate / 100)
    }
    return { subtotal, ivaAmount, total: subtotal + ivaAmount }
  }, [items])

  const buildItemsPayload = (): PurchaseInvoiceItemInput[] =>
    items.map((row) => ({
      product_id: row.product_id,
      description: row.description.trim(),
      quantity: Number(row.quantity) || 0,
      unit_cost: Number(row.unit_cost) || 0,
      iva_rate: Number(row.iva_rate) || 0,
      expiration_date: row.expiration_date || null,
    }))

  const validate = (): string | null => {
    if (!invoiceNumber.trim()) return 'Ingresá el número de factura'
    if (!invoiceDate) return 'Ingresá la fecha de la factura'
    if (items.length === 0) return 'Agregá al menos un ítem'
    for (const row of items) {
      if (!row.description.trim()) return 'Todos los ítems necesitan una descripción'
      if (!(Number(row.quantity) > 0)) return 'La cantidad debe ser mayor a 0 en todos los ítems'
    }
    return null
  }

  const extractConflictError = (err: unknown): ReversalConflictError | null => {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      const detail = err.response.data?.detail
      if (detail && typeof detail === 'object' && Array.isArray(detail.conflicts)) {
        return detail as ReversalConflictError
      }
    }
    return null
  }

  const errorMessage = (err: unknown, fallback: string): string => {
    if (axios.isAxiosError(err)) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') return detail
      if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
        return detail.message
      }
    }
    return fallback
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSubmitting(true)
    setConflict(null)
    try {
      if (mode === 'create') {
        await purchaseInvoicesService.create({
          supplier_id: supplierId || null,
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          items: buildItemsPayload(),
        })
        toast.success('Factura guardada como borrador')
      } else if (mode === 'edit-draft') {
        if (!invoice) return
        await purchaseInvoicesService.update(invoice.id, {
          supplier_id: supplierId || null,
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          items: buildItemsPayload(),
        })
        toast.success('Borrador actualizado')
      } else {
        if (!invoice) return
        await purchaseInvoicesService.editConfirmed(invoice.id, {
          supplier_id: supplierId || null,
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          items: buildItemsPayload(),
          force_adjustment: false,
        })
        toast.success('Factura confirmada editada correctamente')
      }
      onSuccess()
    } catch (err) {
      const conflictError = extractConflictError(err)
      if (conflictError) {
        setConflict(conflictError)
      } else {
        toast.error(errorMessage(err, 'Error al guardar la factura'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForceAdjustment = async () => {
    if (!invoice) return
    setIsForcing(true)
    try {
      await purchaseInvoicesService.editConfirmed(invoice.id, {
        supplier_id: supplierId || null,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        items: buildItemsPayload(),
        force_adjustment: true,
      })
      toast.success('Factura editada con ajuste forzado')
      onSuccess()
    } catch (err) {
      toast.error(errorMessage(err, 'Error al forzar el ajuste'))
    } finally {
      setIsForcing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-2 lg:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col z-[9999] relative">

        {/* Header */}
        <div className="px-4 py-3 lg:px-6 lg:py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {invoice?.source === 'ai' && (
              <Sparkles className="w-4 h-4 text-violet-500" />
            )}
            <h2 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white">
              {title}
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
        <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-5 min-h-0 space-y-4">

          {invoice?.source === 'ai' && mode === 'edit-draft' && (
            <div className="flex items-start gap-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg px-4 py-3">
              <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
              <p className="text-sm text-violet-700 dark:text-violet-300">
                Datos extraídos automáticamente del PDF. Revisá y corregí lo que haga falta antes
                de confirmar — la IA nunca impacta stock ni precios directamente.
              </p>
            </div>
          )}

          {isReversal && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Esta factura ya está confirmada. Guardar cambios revertirá y recalculará los
                lotes/precios generados originalmente.
              </p>
            </div>
          )}

          {/* Cabecera */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Proveedor"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="— Sin proveedor —"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                N° de Factura
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="0001-00012345"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fecha
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Ítems */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ítems</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowProductSearch(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Producto del catálogo
                </Button>
                <Button size="sm" variant="outline" onClick={addRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Ítem libre / servicio
                </Button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-400 dark:text-gray-500">
                <p className="text-sm">No hay ítems cargados todavía.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Descripción</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">Cant.</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-32">Costo unit.</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">IVA %</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-36">Vencimiento</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-28">Subtotal</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {items.map((row) => {
                      const qty = Number(row.quantity) || 0
                      const cost = Number(row.unit_cost) || 0
                      const subtotal = qty * cost
                      return (
                        <tr key={row.key}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => updateRow(row.key, 'description', e.target.value)}
                              placeholder="Descripción del producto o servicio"
                              className="w-full px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                            {row.product_code && (
                              <span className="text-xs text-gray-400 font-mono">{row.product_code}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.quantity}
                              onChange={(e) => updateRow(row.key, 'quantity', e.target.value)}
                              className="w-full text-center px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unit_cost}
                              onChange={(e) => updateRow(row.key, 'unit_cost', e.target.value)}
                              className="w-full text-right px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.iva_rate}
                              onChange={(e) => updateRow(row.key, 'iva_rate', e.target.value)}
                              className="w-full text-center px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={row.expiration_date}
                              onChange={(e) => updateRow(row.key, 'expiration_date', e.target.value)}
                              className="w-full px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                            {formatCurrency(subtotal)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => removeRow(row.key)}
                              className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                              title="Quitar ítem"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Totales */}
          {items.length > 0 && (
            <div className="flex justify-end">
              <div className="w-full lg:w-auto bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 p-3 lg:p-4 min-w-0 lg:min-w-72">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Subtotal neto:</span>
                    <span className="font-mono font-medium">{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>IVA total:</span>
                    <span className="font-mono font-medium">{formatCurrency(totals.ivaAmount)}</span>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between font-bold text-gray-900 dark:text-white text-base">
                    <span>TOTAL:</span>
                    <span className="font-mono">{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Conflicto de reversión */}
          {conflict && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                    No se puede editar sin confirmar el ajuste
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">{conflict.message}</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-red-200 dark:border-red-800 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-red-100/60 dark:bg-red-900/30">
                      <th className="px-2 py-1.5 text-left font-semibold text-red-700 dark:text-red-300">Lote</th>
                      <th className="px-2 py-1.5 text-center font-semibold text-red-700 dark:text-red-300">Cant. inicial</th>
                      <th className="px-2 py-1.5 text-center font-semibold text-red-700 dark:text-red-300">Restante</th>
                      <th className="px-2 py-1.5 text-center font-semibold text-red-700 dark:text-red-300">Consumido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100 dark:divide-red-900/40">
                    {conflict.conflicts.map((c) => (
                      <tr key={c.lot_id}>
                        <td className="px-2 py-1.5 font-mono text-red-800 dark:text-red-300">{c.lot_id.slice(0, 8)}</td>
                        <td className="px-2 py-1.5 text-center text-red-700 dark:text-red-400">{c.initial_quantity}</td>
                        <td className="px-2 py-1.5 text-center text-red-700 dark:text-red-400">{c.remaining_quantity}</td>
                        <td className="px-2 py-1.5 text-center font-semibold text-red-800 dark:text-red-300">{c.consumed_quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-red-700 dark:text-red-400">
                Ya se vendió/consumió stock de estos lotes. Si continuás, el sistema ajustará el
                stock restante de todas formas y podría dejarlo en valores inconsistentes con lo
                ya vendido.
              </p>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConflict(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={isForcing}
                  onClick={handleForceAdjustment}
                >
                  Forzar ajuste de todas formas
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 lg:px-6 lg:py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!!conflict}>
            {mode === 'create'
              ? 'Guardar Borrador'
              : mode === 'edit-draft'
              ? 'Guardar Cambios'
              : 'Guardar y Recalcular'}
          </Button>
        </div>
      </div>

      {showProductSearch && (
        <ProductSearchModal
          isOpen={showProductSearch}
          onClose={() => setShowProductSearch(false)}
          onAddProducts={handleAddProducts}
        />
      )}
    </div>
  )
}
