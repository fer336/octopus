/**
 * Modal de Nueva Orden de Pedido.
 * Flujo en 3 pasos:
 *   1. Selección de filtros (proveedor/categoría) + descarga planilla de conteo
 *   2. Carga del conteo físico por producto + vista de precios
 *   3. Definición de cantidades a pedir, revisión de costos y bonificaciones
 */
import { useState, useMemo, useEffect } from 'react'
import {
  X,
  FileDown,
  ArrowRight,
  ArrowLeft,
  Save,
  Package,
  BookmarkCheck,
  Pencil,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import productsService, { Product } from '../../api/productsService'
import purchaseOrdersService, {
  calculateUnitCost,
  PurchaseOrderItemCreate,
  PurchaseOrder,
} from '../../api/purchaseOrdersService'

// ─── Tipos locales ─────────────────────────────────────────────────────────────

interface CountRow {
  product: Product
  counted: string          // Input del usuario (string para manejar vacíos)
  quantityToOrder: string  // Input del usuario
  unitCost: string         // Editable manualmente
  selected: boolean        // Marcado para pedir
}

interface Props {
  categories: Array<{ id: string; name: string }>
  suppliers: Array<{ id: string; name: string }>
  onClose: () => void
  onSuccess: () => void
  /** Si se pasa, el modal abre en modo edición de borrador */
  draftOrder?: PurchaseOrder
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value)
}

/** Devuelve "20+10+5" o "—" si no hay bonificaciones */
function formatDiscounts(d1: number, d2: number, d3: number): string {
  const parts = [d1, d2, d3].filter((d) => d > 0).map((d) => `${d}%`)
  return parts.length > 0 ? parts.join(' + ') : '—'
}

// ─── Componente ────────────────────────────────────────────────────────────────

export default function NewPurchaseOrderModal({
  categories,
  suppliers,
  onClose,
  onSuccess,
  draftOrder,
}: Props) {
  // Si viene un borrador, arrancamos en paso 3 directo con sus datos
  const isEditMode = !!draftOrder

  const [step, setStep] = useState<1 | 2 | 3>(isEditMode ? 3 : 1)
  const [selectedSupplier, setSelectedSupplier] = useState(draftOrder?.supplier_id ?? '')
  const [selectedCategory, setSelectedCategory] = useState(draftOrder?.category_id ?? '')
  const [notes, setNotes] = useState(draftOrder?.notes ?? '')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)

  // Filas de conteo (paso 2 y 3)
  // En modo edición, pre-populamos desde los ítems del borrador
  const [countRows, setCountRows] = useState<CountRow[]>(() => {
    if (!draftOrder) return []
    return draftOrder.items.map((item) => ({
      product: {
        id: item.product_id,
        code: item.product_code ?? '',
        description: item.product_description ?? '',
        current_stock: item.system_stock,
        list_price: 0,
        discount_1: 0,
        discount_2: 0,
        discount_3: 0,
        iva_rate: item.iva_rate,
        // Campos requeridos por Product pero no críticos en edición
        business_id: '',
        cost_price: item.unit_cost,
        net_price: item.unit_cost,
        sale_price: item.unit_cost,
        extra_cost: 0,
        minimum_stock: 0,
        unit: '',
        is_active: true,
        created_at: '',
        updated_at: '',
      } as any,
      counted: item.counted_stock != null ? String(item.counted_stock) : '',
      quantityToOrder: String(item.quantity_to_order),
      unitCost: String(item.unit_cost),
      selected: true,
    }))
  })

  // Cargar TODAS las páginas de productos según filtros
  // El backend limita per_page a 100, así que paginamos hasta traer todo
  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products-for-inventory', selectedSupplier, selectedCategory],
    queryFn: async () => {
      const filters = {
        per_page: 100,
        page: 1,
        ...(selectedSupplier ? { supplier_id: selectedSupplier } : {}),
        ...(selectedCategory ? { category_id: selectedCategory } : {}),
      }

      // Primera página
      const first = await productsService.getAll(filters)
      console.log('[Inventario] Filtros usados:', filters)
      console.log('[Inventario] Respuesta backend:', first)
      let allItems = [...first.items]

      // Si hay más páginas, traerlas todas
      for (let p = 2; p <= first.pages; p++) {
        const page = await productsService.getAll({ ...filters, page: p })
        allItems = [...allItems, ...page.items]
      }

      console.log('[Inventario] Total productos cargados:', allItems.length)
      return { ...first, items: allItems }
    },
    enabled: step === 2,
    staleTime: 0,
  })

  // Al pasar al paso 2:
  // — Si ya hay filas cargadas (viene de "Atrás" desde paso 3), las conserva
  // — Si es la primera vez, limpia para forzar fetch fresco
  const goToStep2 = () => {
    if (!selectedSupplier && !selectedCategory) {
      toast.error('Seleccioná al menos un proveedor o una categoría')
      return
    }
    // Solo limpiar si cambió algún filtro (los filtros son readonly desde paso 2 en adelante)
    setStep(2)
  }

  // Cuando lleguen los productos, crear las filas
  const products = productsData?.items ?? []

  // Inicializar countRows SOLO la primera vez que llegan los productos
  // Si ya hay filas (el usuario volvió atrás desde paso 3), NO sobreescribir
  useEffect(() => {
    if (step === 2 && products.length > 0 && countRows.length === 0) {
      setCountRows(
        products.map((p) => ({
          product: p,
          counted: '',
          quantityToOrder: '',
          unitCost: String(
            calculateUnitCost(p.list_price, p.discount_1, p.discount_2, p.discount_3)
          ),
          selected: false,
        }))
      )
    }
  }, [products, step, countRows.length])

  // Actualizar una fila de conteo
  const updateRow = (index: number, field: keyof CountRow, value: string | boolean) => {
    setCountRows((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }

      // Si se edita el conteo, calcular automáticamente la cantidad a pedir
      if (field === 'counted') {
        const counted = Number(value)
        const systemStock = updated[index].product.current_stock
        if (!isNaN(counted)) {
          const diff = systemStock - counted
          if (diff > 0) {
            updated[index].quantityToOrder = String(diff)
            updated[index].selected = true
          } else {
            updated[index].quantityToOrder = '0'
            updated[index].selected = false
          }
        }
      }

      return updated
    })
  }

  // Pasar al paso 3: solo los seleccionados con cantidad > 0
  const selectedRows = useMemo(
    () => countRows.filter((r) => r.selected && Number(r.quantityToOrder) > 0),
    [countRows],
  )

  const goToStep3 = () => {
    if (selectedRows.length === 0) {
      toast.error('Seleccioná al menos un producto para pedir')
      return
    }
    setStep(3)
  }

  // Totales del paso 3
  const totals = useMemo(() => {
    let subtotal = 0
    let totalIva = 0
    for (const row of selectedRows) {
      const qty = Number(row.quantityToOrder) || 0
      const cost = Number(row.unitCost) || 0
      const ivaRate = row.product.iva_rate || 21
      const sub = qty * cost
      const iva = sub * (ivaRate / 100)
      subtotal += sub
      totalIva += iva
    }
    return { subtotal, totalIva, total: subtotal + totalIva }
  }, [selectedRows])

  // Descargar planilla de conteo
  const handleDownloadSheet = async () => {
    setIsDownloading(true)
    try {
      await purchaseOrdersService.downloadCountSheetPdf(
        selectedSupplier || undefined,
        selectedCategory || undefined,
      )
      toast.success('Planilla descargada')
    } catch {
      toast.error('Error al descargar la planilla')
    } finally {
      setIsDownloading(false)
    }
  }

  // Construir items para el request
  const buildItems = (): PurchaseOrderItemCreate[] =>
    selectedRows.map((row) => ({
      product_id: row.product.id,
      system_stock: row.product.current_stock,
      counted_stock: row.counted !== '' ? Number(row.counted) : null,
      quantity_to_order: Number(row.quantityToOrder),
      unit_cost: Number(row.unitCost),
      iva_rate: row.product.iva_rate,
    }))

  // Guardar como borrador (DRAFT) — crea nuevo o actualiza existente
  const handleSaveDraft = async () => {
    if (selectedRows.length === 0) {
      toast.error('Seleccioná al menos un producto para guardar el borrador')
      return
    }
    setIsSavingDraft(true)
    try {
      if (isEditMode && draftOrder) {
        // Actualizar borrador existente
        await purchaseOrdersService.update(draftOrder.id, {
          notes: notes || undefined,
          items: buildItems(),
        })
        toast.success('Borrador actualizado correctamente.')
      } else {
        // Crear nuevo borrador
        await purchaseOrdersService.create({
          supplier_id: selectedSupplier || null,
          category_id: selectedCategory || null,
          notes: notes || undefined,
          items: buildItems(),
        })
        toast.success('Borrador guardado. Podés continuar más tarde.')
      }
      onSuccess()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al guardar el borrador')
    } finally {
      setIsSavingDraft(false)
    }
  }

  // Confirmar orden — crea/actualiza y luego confirma
  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      let orderId: string

      if (isEditMode && draftOrder) {
        // Actualizar borrador existente y confirmar
        await purchaseOrdersService.update(draftOrder.id, {
          notes: notes || undefined,
          items: buildItems(),
        })
        orderId = draftOrder.id
      } else {
        // Crear nuevo y confirmar
        const order = await purchaseOrdersService.create({
          supplier_id: selectedSupplier || null,
          category_id: selectedCategory || null,
          notes: notes || undefined,
          items: buildItems(),
        })
        orderId = order.id
      }

      await purchaseOrdersService.confirm(orderId)
      toast.success('Orden de pedido confirmada correctamente')
      onSuccess()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al crear la orden')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col z-[9999] relative">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isEditMode ? (
                <span className="flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-yellow-500" />
                  Editar Borrador
                </span>
              ) : 'Nueva Orden de Pedido'}
            </h2>
          </div>
          {/* Stepper */}
          <div className="flex items-center gap-2 text-sm">
            {[
              { n: 1, label: 'Filtros' },
              { n: 2, label: 'Conteo' },
              { n: 3, label: 'Orden' },
            ].map(({ n, label }, i) => (
              <div key={n} className="flex items-center gap-2">
                {i > 0 && <div className="w-6 h-px bg-gray-300 dark:bg-gray-600" />}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    step === n
                      ? 'bg-blue-600 text-white'
                      : step > n
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  <span>{n}</span>
                  <span>{label}</span>
                </div>
              </div>
            ))}
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

          {/* ── PASO 1: Filtros ── */}
          {step === 1 && (
            <div className="space-y-6 max-w-lg mx-auto">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Seleccioná el proveedor y/o categoría para filtrar los productos.
                Luego podés descargar la planilla de conteo para llevar al depósito.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Proveedor
                  </label>
                  <select
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todos los proveedores</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Categoría
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todas las categorías</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observaciones (opcional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Notas para esta orden..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>

              {/* Descargar planilla */}
              {(selectedSupplier || selectedCategory) && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                    Descargá la planilla de conteo para llevar al depósito.
                    Anotá el stock físico de cada producto y luego volvé a cargarlos acá.
                  </p>
                  <button
                    onClick={handleDownloadSheet}
                    disabled={isDownloading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <FileDown className="w-4 h-4" />
                    {isDownloading ? 'Descargando...' : 'Descargar Planilla de Conteo'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── PASO 2: Carga de conteo ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Instrucción */}
              <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg px-4 py-3">
                <span className="text-blue-500 text-base mt-0.5">📋</span>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Ingresá el stock físico contado para cada producto (de la planilla impresa).
                  El sistema calcula la diferencia automáticamente y sugiere qué pedir.
                  Los precios de costo ya están cargados con las bonificaciones del proveedor.
                </p>
              </div>

              {/* Estados de carga / vacío */}
              {loadingProducts ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Cargando productos...</p>
                </div>
              ) : countRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400 dark:text-gray-500">
                  <Package className="w-10 h-10 opacity-40" />
                  <p className="text-sm">No se encontraron productos con los filtros seleccionados.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Código</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Descripción</th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Stock sist.</th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Conteo físico</th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Diferencia</th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pedir</th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cant.</th>
                          {/* Columnas de precio */}
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Bonif.</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">P. Costo</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {countRows.map((row, idx) => {
                          const counted = row.counted !== '' ? Number(row.counted) : null
                          const diff = counted !== null ? row.product.current_stock - counted : null
                          const diffPositive = diff !== null && diff < 0  // sobrante
                          const diffNegative = diff !== null && diff > 0  // faltante
                          const unitCost = Number(row.unitCost) || 0
                          const qty = Number(row.quantityToOrder) || 0
                          const rowSubtotal = row.selected && qty > 0 ? unitCost * qty : null

                          return (
                            <tr
                              key={row.product.id}
                              className={`transition-colors ${
                                row.selected
                                  ? 'bg-blue-50/50 dark:bg-blue-900/10'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                              }`}
                            >
                              {/* Código */}
                              <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                {row.product.code}
                              </td>

                              {/* Descripción */}
                              <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[180px]">
                                <div className="truncate text-xs" title={row.product.description}>
                                  {row.product.description}
                                </div>
                              </td>

                              {/* Stock sistema */}
                              <td className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300 tabular-nums text-xs">
                                {row.product.current_stock}
                              </td>

                              {/* Conteo físico */}
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.counted}
                                  onChange={(e) => updateRow(idx, 'counted', e.target.value)}
                                  className="w-16 text-center px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                                  placeholder="—"
                                  autoFocus={idx === 0}
                                />
                              </td>

                              {/* Diferencia */}
                              <td className="px-3 py-2 text-center tabular-nums">
                                {diff !== null ? (
                                  <span
                                    className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                                      diffNegative
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        : diffPositive
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                    }`}
                                  >
                                    {diff > 0 ? `-${diff}` : diff < 0 ? `+${Math.abs(diff)}` : '✓'}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                                )}
                              </td>

                              {/* Checkbox pedir */}
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={(e) => updateRow(idx, 'selected', e.target.checked)}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              </td>

                              {/* Cantidad a pedir */}
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.quantityToOrder}
                                  onChange={(e) => {
                                    updateRow(idx, 'quantityToOrder', e.target.value)
                                    if (Number(e.target.value) > 0) updateRow(idx, 'selected', true)
                                  }}
                                  disabled={!row.selected}
                                  className="w-16 text-center px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  placeholder="0"
                                />
                              </td>

                              {/* Bonificaciones */}
                              <td className="px-3 py-2 text-right">
                                <span className="text-xs text-purple-600 dark:text-purple-400 font-medium whitespace-nowrap">
                                  {formatDiscounts(
                                    row.product.discount_1,
                                    row.product.discount_2,
                                    row.product.discount_3,
                                  )}
                                </span>
                              </td>

                              {/* Precio costo */}
                              <td className="px-3 py-2 text-right font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {formatCurrency(unitCost)}
                              </td>

                              {/* Subtotal fila */}
                              <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
                                {rowSubtotal !== null ? (
                                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                                    {formatCurrency(rowSubtotal)}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-600">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resumen inferior */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400 dark:text-gray-500">
                      {countRows.length} producto{countRows.length !== 1 ? 's' : ''} en total
                    </span>
                    <div className="flex items-center gap-6">
                      {selectedRows.length > 0 && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Subtotal estimado:{' '}
                          <span className="font-semibold text-blue-600 dark:text-blue-400 font-mono">
                            {formatCurrency(
                              selectedRows.reduce(
                                (acc, r) => acc + (Number(r.unitCost) || 0) * (Number(r.quantityToOrder) || 0),
                                0,
                              )
                            )}
                          </span>
                        </span>
                      )}
                      {selectedRows.length > 0 ? (
                        <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                          ✓ {selectedRows.length} producto{selectedRows.length !== 1 ? 's' : ''} seleccionado{selectedRows.length !== 1 ? 's' : ''} para pedir
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500 italic">
                          Ingresá el conteo para que el sistema sugiera qué pedir
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── PASO 3: Revisión y costos ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Revisá las cantidades y los precios de costo. Si el proveedor actualizó precios,
                podés editarlos directamente. Las bonificaciones se muestran para referencia.
              </p>

              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Código</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Descripción</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Cant.</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">P. Lista</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Bonificaciones</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">P. Costo</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">IVA %</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {selectedRows.map((row) => {
                      const idx = countRows.findIndex((r) => r.product.id === row.product.id)
                      const qty = Number(row.quantityToOrder) || 0
                      const cost = Number(row.unitCost) || 0
                      const subtotal = qty * cost

                      return (
                        <tr key={row.product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          {/* Código */}
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {row.product.code}
                          </td>

                          {/* Descripción */}
                          <td className="px-3 py-2.5 text-gray-900 dark:text-white max-w-[200px]">
                            <div className="truncate text-sm" title={row.product.description}>
                              {row.product.description}
                            </div>
                          </td>

                          {/* Cantidad — editable */}
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="number"
                              min="1"
                              value={row.quantityToOrder}
                              onChange={(e) => updateRow(idx, 'quantityToOrder', e.target.value)}
                              className="w-16 text-center px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>

                          {/* Precio lista (readonly, referencia) */}
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {formatCurrency(row.product.list_price)}
                          </td>

                          {/* Bonificaciones */}
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {[row.product.discount_1, row.product.discount_2, row.product.discount_3]
                                .filter((d) => d > 0)
                                .map((d, i) => (
                                  <span
                                    key={i}
                                    className="inline-block px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium rounded"
                                  >
                                    {d}%
                                  </span>
                                ))}
                              {formatDiscounts(
                                row.product.discount_1,
                                row.product.discount_2,
                                row.product.discount_3,
                              ) === '—' && (
                                <span className="text-xs text-gray-400">Sin bonif.</span>
                              )}
                            </div>
                          </td>

                          {/* Precio costo — editable */}
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-gray-400 text-xs">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.unitCost}
                                onChange={(e) => updateRow(idx, 'unitCost', e.target.value)}
                                className="w-28 text-right px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </td>

                          {/* IVA % */}
                          <td className="px-3 py-2.5 text-center text-xs text-gray-500 dark:text-gray-400">
                            {row.product.iva_rate}%
                          </td>

                          {/* Subtotal */}
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                            {formatCurrency(subtotal)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div className="flex justify-end">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 p-4 min-w-72">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Subtotal neto:</span>
                      <span className="font-mono font-medium">{formatCurrency(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>IVA total:</span>
                      <span className="font-mono font-medium">{formatCurrency(totals.totalIva)}</span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between font-bold text-gray-900 dark:text-white text-base">
                      <span>TOTAL DE LA ORDEN:</span>
                      <span className="font-mono">{formatCurrency(totals.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer con botones */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          {/* Botón Atrás */}
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep((step - 1) as 1 | 2 | 3)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Atrás
              </button>
            )}
          </div>

          {/* Botones derecha */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Cancelar
            </button>

            {/* PASO 1 */}
            {step === 1 && (
              <button
                onClick={goToStep2}
                disabled={!selectedSupplier && !selectedCategory}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cargar conteo
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* PASO 2 */}
            {step === 2 && (
              <button
                onClick={goToStep3}
                disabled={selectedRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Revisar orden ({selectedRows.length})
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {/* PASO 3 — Guardar borrador + Confirmar orden */}
            {step === 3 && (
              <>
                {/* Guardar borrador */}
                <button
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isSubmitting || selectedRows.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <BookmarkCheck className="w-4 h-4" />
                  {isSavingDraft ? 'Guardando...' : 'Guardar Borrador'}
                </button>

                {/* Confirmar orden */}
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || isSavingDraft || selectedRows.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSubmitting ? 'Confirmando...' : 'Confirmar Orden'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
