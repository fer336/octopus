/**
 * Modal de edición masiva de productos - Estilo Excel.
 * Todos los campos editables en una tabla, con acciones rápidas de precios.
 */
import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { TrendingUp, TrendingDown, RotateCcw, Save, X, Zap, BookmarkCheck, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '../ui'
import toast from 'react-hot-toast'
import priceUpdateDraftsService from '../../api/priceUpdateDraftsService'
import {
  convertSourcePriceToArs,
  getSourceListPrice,
  isUsdPricedProduct,
  PRODUCT_PRICE_CURRENCY,
  type ProductPriceCurrency,
} from '../../utils/productPricing'

interface Category {
  id: string
  name: string
}

interface Supplier {
  id: string
  name: string
}

type EditableNumber = number | ''

export interface EditableProduct {
  id: string
  code: string
  description: string
  category_id?: string
  category_name?: string
  supplier_id?: string
  supplier_name?: string
  list_price: EditableNumber
  price_currency?: ProductPriceCurrency
  list_price_usd?: EditableNumber | null
  discount_1: EditableNumber
  discount_2: EditableNumber
  discount_3: EditableNumber
  discount_display?: string
  extra_cost: EditableNumber
  profit_margin: EditableNumber
  sale_price: number
  current_stock: EditableNumber
  is_pending?: boolean
}

type EnterEditableField = 'list_price' | 'discount_display' | 'extra_cost' | 'profit_margin' | 'current_stock'

type EditScope = 'desktop' | 'mobile'

const enterEditableFields: EnterEditableField[] = ['list_price', 'discount_display', 'extra_cost', 'profit_margin', 'current_stock']

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const parseEditableNumber = (value: string, parser: (raw: string) => number = parseFloat): EditableNumber => {
  if (value === '') return ''

  const parsed = parser(value)
  return Number.isFinite(parsed) ? parsed : ''
}

const toCalculationNumber = (value: EditableNumber | undefined): number => {
  if (value === '' || value === undefined) return 0
  return Number(value) || 0
}

const buildPendingRowsFromProducts = (products: EditableProduct[]): Record<string, boolean> => {
  return Object.fromEntries(
    products
      .filter((product) => product.is_pending)
      .map((product) => [product.id, true])
  )
}

interface DraftFilters {
  category_id?: string
  category_name?: string
  supplier_id?: string
  supplier_name?: string
  search?: string
}

interface BulkEditProductsModalProps {
  isOpen: boolean
  onClose: (draftId?: string, products?: EditableProduct[]) => void
  onSave: (products: EditableProduct[], draftId?: string) => Promise<void>
  onDraftSaved?: (draftId: string) => void  // callback para refrescar la lista de borradores
  products: EditableProduct[]
  categories: Category[]
  suppliers: Supplier[]
  draftFilters?: DraftFilters  // filtros activos al abrir el modal
  existingDraftId?: string     // si se cargó desde un borrador, su ID para actualizarlo
  exchangeRate: number
}

export default function BulkEditProductsModal({
  isOpen,
  onClose,
  onSave,
  onDraftSaved,
  products: initialProducts,
  categories,
  suppliers,
  draftFilters,
  existingDraftId,
  exchangeRate,
}: BulkEditProductsModalProps) {
  const [products, setProducts] = useState<EditableProduct[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [pendingRows, setPendingRows] = useState<Record<string, boolean>>({})
  const [localDraftId, setLocalDraftId] = useState<string | undefined>(existingDraftId)
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressValue, setProgressValue] = useState(0)
  const [progressLabel, setProgressLabel] = useState('Preparando cambios')
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const hasHydratedProducts = useRef(false)
  const lastHydrationKey = useRef('')

  useEffect(() => {
    if (isOpen && initialProducts) {
      const hydrationKey = `${existingDraftId ?? 'selection'}:${initialProducts.map((product) => product.id).join('|')}`

      if (lastHydrationKey.current === hydrationKey) return

      const hydratedProducts = initialProducts.map(p => {
        const priceCurrency = p.price_currency === PRODUCT_PRICE_CURRENCY.USD
          ? PRODUCT_PRICE_CURRENCY.USD
          : PRODUCT_PRICE_CURRENCY.ARS
        const sourceListPrice = getSourceListPrice(p)

        return {
          ...p,
          price_currency: priceCurrency,
          list_price: sourceListPrice,
          list_price_usd: priceCurrency === PRODUCT_PRICE_CURRENCY.USD ? sourceListPrice : null,
          discount_1: Number(p.discount_1),
          discount_2: Number(p.discount_2),
          discount_3: Number(p.discount_3),
          extra_cost: Number(p.extra_cost),
          profit_margin: Number(p.profit_margin ?? 0),
          sale_price: Number(p.sale_price),
          current_stock: Number(p.current_stock),
          is_pending: Boolean(p.is_pending),
        }
      })

      setProducts(hydratedProducts)
      setPendingRows(buildPendingRowsFromProducts(hydratedProducts))
      hasHydratedProducts.current = true
      lastHydrationKey.current = hydrationKey
    }
  }, [initialProducts, existingDraftId, isOpen])

  useEffect(() => {
    setLocalDraftId(existingDraftId)
  }, [existingDraftId])

  // State para acciones rápidas
  const [quickPercentage, setQuickPercentage] = useState('10')
  const [quickCategory, setQuickCategory] = useState('')
  const [quickSupplier, setQuickSupplier] = useState('')
  const [quickDiscount, setQuickDiscount] = useState('')
  const [quickCargo, setQuickCargo] = useState('')
  const [quickProfit, setQuickProfit] = useState('')
  const [quickStock, setQuickStock] = useState('')

  const markAllRowsPending = () => {
    setPendingRows(Object.fromEntries(products.map((product) => [product.id, true])))
  }

  // Acciones rápidas de precios
  const applyPriceChange = (type: 'increase' | 'decrease' | 'remove_increase') => {
    const percentage = parseFloat(quickPercentage)
    if (!percentage || percentage <= 0) {
      toast.error('Ingresa un porcentaje válido')
      return
    }

    setProducts(prev => prev.map(p => {
      const currentListPrice = getSourceListPrice(p)
      let newPrice = currentListPrice
      
      if (type === 'increase') {
        newPrice = currentListPrice * (1 + percentage / 100)
      } else if (type === 'decrease') {
        newPrice = currentListPrice * (1 - percentage / 100)
      } else if (type === 'remove_increase') {
        newPrice = currentListPrice / (1 + percentage / 100)
      }
      
      return {
        ...p,
        list_price: Math.round(newPrice * 100) / 100,
        list_price_usd: isUsdPricedProduct(p) ? Math.round(newPrice * 100) / 100 : p.list_price_usd,
      }
    }))
    markAllRowsPending()
    
    toast.success(`Precios ${type === 'increase' ? 'aumentados' : type === 'decrease' ? 'disminuidos' : 'ajustados'} ${percentage}%`, { icon: '💰' })
  }

  // Calcular precio final con IVA (aplicando bonificaciones EN CADENA)
  const calculateFinalPrice = (product: EditableProduct): number => {
    // Precio con bonificaciones aplicadas en cadena
    let price = convertSourcePriceToArs(product, exchangeRate)
    const discount1 = toCalculationNumber(product.discount_1)
    const discount2 = toCalculationNumber(product.discount_2)
    const discount3 = toCalculationNumber(product.discount_3)
    const extraCost = toCalculationNumber(product.extra_cost)
    const profitMargin = toCalculationNumber(product.profit_margin)

    if (discount1 > 0) price = price * (1 - discount1 / 100)
    if (discount2 > 0) price = price * (1 - discount2 / 100)
    if (discount3 > 0) price = price * (1 - discount3 / 100)

    // Aplicar cargo extra
    const netWithExtra = price * (1 + extraCost / 100)

    // Aplicar ganancia/utilidad
    const netWithProfit = netWithExtra * (1 + profitMargin / 100)

    // Aplicar IVA 21%
    const finalPrice = netWithProfit * 1.21

    return Math.round(finalPrice * 100) / 100
  }

  // Aplicar categoría a todos
  const applyBulkCategory = () => {
    if (!quickCategory) return
    
    const category = categories.find(c => c.id === quickCategory)
    setProducts(prev => prev.map(p => ({
      ...p,
      category_id: quickCategory,
      category_name: category?.name,
    })))
    markAllRowsPending()
    
    toast.success(`Categoría "${category?.name}" aplicada a ${products.length} productos`, { icon: '🏷️' })
  }

  // Aplicar proveedor a todos
  const applyBulkSupplier = () => {
    if (!quickSupplier) return
    
    const supplier = suppliers.find(s => s.id === quickSupplier)
    setProducts(prev => prev.map(p => ({
      ...p,
      supplier_id: quickSupplier,
      supplier_name: supplier?.name,
    })))
    markAllRowsPending()
    
    toast.success(`Proveedor "${supplier?.name}" aplicado a ${products.length} productos`, { icon: '📦' })
  }

  // Aplicar descuento a todos
  const applyBulkDiscount = () => {
    if (!quickDiscount) return
    
    const discounts = quickDiscount.split('+').map(d => parseFloat(d.trim()) || 0).filter(d => d > 0)
    
    setProducts(prev => prev.map(p => ({
      ...p,
      discount_1: discounts[0] || 0,
      discount_2: discounts[1] || 0,
      discount_3: discounts[2] || 0,
      discount_display: quickDiscount,
    })))
    markAllRowsPending()
    
    toast.success(`Bonificación "${quickDiscount}" aplicada a ${products.length} productos`, { icon: '💸' })
  }

  // Aplicar cargo a todos
  const applyBulkCargo = () => {
    const cargo = parseFloat(quickCargo)
    if (!cargo && cargo !== 0) return
    
    setProducts(prev => prev.map(p => ({
      ...p,
      extra_cost: cargo,
    })))
    markAllRowsPending()
    
    toast.success(`Cargo ${cargo}% aplicado a ${products.length} productos`, { icon: '📊' })
  }

  // Aplicar ganancia a todos
  const applyBulkProfit = () => {
    const profit = parseFloat(quickProfit)
    if (!profit && profit !== 0) return

    setProducts(prev => prev.map(p => ({
      ...p,
      profit_margin: profit,
    })))
    markAllRowsPending()

    toast.success(`Ganancia ${profit}% aplicada a ${products.length} productos`, { icon: '💹' })
  }

  // Aplicar stock a todos
  const applyBulkStock = () => {
    const stock = parseInt(quickStock)
    if (!stock && stock !== 0) return
    
    setProducts(prev => prev.map(p => ({
      ...p,
      current_stock: stock,
    })))
    markAllRowsPending()
    
    toast.success(`Stock ${stock} aplicado a ${products.length} productos`, { icon: '📦' })
  }

  const updateProduct = (index: number, field: keyof EditableProduct, value: EditableProduct[keyof EditableProduct]) => {
    const productId = products[index]?.id
    if (productId) {
      setPendingRows(prev => ({ ...prev, [productId]: true }))
    }

    setProducts(prev => prev.map((p, i) => {
      if (i !== index) return p
      
      const updated = { ...p, [field]: value }

      if (field === 'list_price' && isUsdPricedProduct(updated)) {
        updated.list_price_usd = value as EditableNumber
      }
      
      // Si cambia bonificaciones, parsear
      if (field === 'discount_display') {
        const discounts = String(value ?? '').split('+').map((d: string) => parseFloat(d.trim()) || 0).filter((d: number) => d > 0)
        updated.discount_1 = discounts[0] || 0
        updated.discount_2 = discounts[1] || 0
        updated.discount_3 = discounts[2] || 0
      }
      
      return updated
    }))
  }

  const focusCell = (rowIndex: number, field: EnterEditableField, scope: EditScope = 'desktop') => {
    const targetProduct = products[rowIndex]
    if (!targetProduct) return

    requestAnimationFrame(() => {
      inputRefs.current[`${targetProduct.id}-${field}-${scope}`]?.focus()
      inputRefs.current[`${targetProduct.id}-${field}-${scope}`]?.select()
    })
  }

  const focusNextProduct = (rowIndex: number, scope: EditScope) => {
    const nextIndex = rowIndex + 1 < products.length ? rowIndex + 1 : rowIndex
    focusCell(nextIndex, 'list_price', scope)
  }

  const focusPreviousCell = (rowIndex: number, field: EnterEditableField, scope: EditScope) => {
    const fieldIndex = enterEditableFields.indexOf(field)
    const previousField = enterEditableFields[fieldIndex - 1]

    if (previousField) {
      focusCell(rowIndex, previousField, scope)
      return
    }

    const previousIndex = rowIndex > 0 ? rowIndex - 1 : rowIndex
    const previousRowField = rowIndex > 0 ? enterEditableFields[enterEditableFields.length - 1] : 'list_price'
    focusCell(previousIndex, previousRowField, scope)
  }

  const handleFieldNavigation = (
    event: KeyboardEvent<HTMLInputElement>,
    product: EditableProduct,
    rowIndex: number,
    field: EnterEditableField,
    scope: EditScope = 'desktop'
  ) => {
    const shouldMoveBackward = (event.key === 'Enter' && event.shiftKey) || event.key === 'Shift'
    const shouldMoveForward = event.key === 'Enter' && !event.shiftKey

    if (!shouldMoveForward && !shouldMoveBackward) return

    event.preventDefault()

    if (shouldMoveBackward) {
      if (event.repeat) return
      focusPreviousCell(rowIndex, field, scope)
      return
    }

    const fieldIndex = enterEditableFields.indexOf(field)
    const nextField = enterEditableFields[fieldIndex + 1]

    if (nextField) {
      focusCell(rowIndex, nextField, scope)
      return
    }

    setPendingRows(prev => ({ ...prev, [product.id]: true }))
    focusNextProduct(rowIndex, scope)
  }

  const bindEnterField = (product: EditableProduct, index: number, field: EnterEditableField, scope: EditScope = 'desktop') => ({
    ref: (element: HTMLInputElement | null) => { inputRefs.current[`${product.id}-${field}-${scope}`] = element },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => handleFieldNavigation(event, product, index, field, scope),
  })

  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const renderCalculatedArsPrice = (product: EditableProduct) => {
    if (!isUsdPricedProduct(product)) return null

    if (exchangeRate <= 0) {
      return <span className="text-[10px] text-gray-400 dark:text-gray-500">Cotización pendiente</span>
    }

    return (
      <span className="text-[10px] text-gray-400 dark:text-gray-500">
        ${convertSourcePriceToArs(product, exchangeRate).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} calc.
      </span>
    )
  }

  const getDraftPayload = () => {
    const nameParts = [
      draftFilters?.category_name,
      draftFilters?.supplier_name,
      draftFilters?.search,
    ].filter(Boolean)
    const autoName = nameParts.length > 0
      ? nameParts.join(' · ')
      : `Borrador ${new Date().toLocaleDateString('es-AR')}`

    return {
      name: autoName,
      filters: draftFilters,
      products: products.map((product) => ({
        ...product,
        is_pending: Boolean(pendingRows[product.id]),
      })),
    }
  }

  const persistDraft = async () => {
    const payload = getDraftPayload()

    setIsSavingDraft(true)

    try {
      const savedDraft = localDraftId
        ? await priceUpdateDraftsService.update(localDraftId, payload)
        : await priceUpdateDraftsService.save(payload)

      setLocalDraftId(savedDraft.id)
      onDraftSaved?.(savedDraft.id)

      toast.success(`Borrador "${payload.name}" guardado (${products.length} productos)`, { icon: '💾' })

      return savedDraft.id
    } catch (error: any) {
      const draftWasDeleted = error.response?.status === 404 && localDraftId

      if (draftWasDeleted) {
        try {
          const savedDraft = await priceUpdateDraftsService.save(payload)
          setLocalDraftId(savedDraft.id)
          onDraftSaved?.(savedDraft.id)

          toast.success(`Borrador "${payload.name}" creado nuevamente (${products.length} productos)`, { icon: '💾' })

          return savedDraft.id
        } catch (fallbackError: any) {
          toast.error('Error al crear un nuevo borrador: ' + (fallbackError.response?.data?.detail || fallbackError.message))

          return undefined
        }
      }

      toast.error('Error al guardar el borrador: ' + (error.response?.data?.detail || error.message))
      return localDraftId
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setProgressOpen(true)
    setProgressValue(0)
    setProgressLabel('Preparando cambios')

    try {
      await sleep(250)
      setProgressValue(18)
      setProgressLabel('Validando productos')

      await sleep(250)
      setProgressValue(72)
      setProgressLabel('Actualizando base de datos')
      await onSave(products, localDraftId)

      setProgressValue(92)
      setProgressLabel('Refrescando listado')
      await sleep(300)

      setPendingRows({})
      setProgressValue(100)
      setProgressLabel('Actualización completada')
      await sleep(450)
      onClose()
    } finally {
      setIsSaving(false)
      setProgressOpen(false)
    }
  }

  const handleSaveDraft = async () => {
    await persistDraft()
  }

  const handleClose = () => {
    onClose()
  }

  if (!isOpen) return null

  return (
    // Overlay fullscreen propio — NO usa <Modal> para tener control del layout
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50 animate-fadeIn">
      {/* Panel central — flex-col, ocupa toda la pantalla */}
      <div className="relative flex flex-col w-full h-full bg-white dark:bg-gray-900">

        {progressOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/55 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-primary-200 bg-white shadow-2xl dark:border-primary-900/60 dark:bg-gray-900">
              <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-5 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/75">Actualización en proceso</p>
                    <h4 className="mt-1 text-xl font-black">Aplicando cambios</h4>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-lg font-black ring-4 ring-primary-200/35">
                    {progressValue}%
                  </div>
                </div>
              </div>

              <div className="space-y-5 bg-primary-50/70 px-6 py-6 dark:bg-primary-950/20">
                <div className="flex items-center gap-3">
                  {progressValue >= 100 ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin text-primary-600 dark:text-primary-400" />
                  )}
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{progressLabel}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">No cierres esta ventana. Estamos actualizando los productos seleccionados.</p>
                  </div>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-primary-100 shadow-inner dark:bg-primary-950">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-700 transition-all duration-500 ease-out"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Header fijo ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Editar {products.length} Productos
          </h3>
          {Object.keys(pendingRows).length > 0 && (
            <span className="ml-3 hidden rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/25 dark:text-red-300 sm:inline-flex">
              {Object.keys(pendingRows).length} pendientes
            </span>
          )}
          <button
            onClick={() => void handleClose()}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Contenido scrollable ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">

          {/* Acciones Rápidas */}
          <div
            className="rounded-xl border border-primary-200 dark:border-primary-800 bg-gradient-to-r from-primary-50/80 to-primary-100/70 dark:from-primary-900/20 dark:to-primary-800/20 p-3 md:p-3.5 space-y-3"
            data-tour-price-modal-quick-actions
          >
            <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary-600" />
                <h3 className="font-semibold text-[15px] text-gray-900 dark:text-white">Acciones rápidas · aplicar en bloque</h3>
              </div>
              <span
                className="inline-flex items-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 px-2 py-0.5 text-[10px] font-semibold"
                data-tour-price-modal-scope
              >
                Impacta sobre los {products.length} productos cargados en este modal
              </span>
            </div>

            <p className="text-[11px] text-primary-800/90 dark:text-primary-200/90 leading-snug">
              Si filtraste por <strong>categoría</strong> o <strong>proveedor</strong> antes de abrir este modal, estos cambios se van a aplicar sobre ese conjunto filtrado.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {/* Precios */}
              <div className="rounded-lg border border-primary-200/80 dark:border-primary-700 bg-white/85 dark:bg-gray-900/35 p-2.5 space-y-1.5" data-tour-price-modal-price-actions>
                <label className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Precios %</label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">Aumentar, disminuir o deshacer aumento sobre P. Lista.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={quickPercentage}
                    onChange={(e) => setQuickPercentage(e.target.value)}
                    placeholder="%"
                    className="w-14 px-2 py-1 text-center font-bold border border-primary-300 dark:border-primary-700 rounded-lg dark:bg-gray-700 text-sm"
                    step="0.1"
                  />
                  <div className="flex gap-1">
                    <button onClick={() => applyPriceChange('increase')} className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md text-xs font-medium" title="Aumentar">
                      <TrendingUp size={14} />
                    </button>
                    <button onClick={() => applyPriceChange('decrease')} className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-md text-xs font-medium" title="Disminuir">
                      <TrendingDown size={14} />
                    </button>
                    <button onClick={() => applyPriceChange('remove_increase')} className="px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-md text-xs font-medium" title="Quitar Aumento">
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Categoría */}
              <div className="rounded-lg border border-primary-200/80 dark:border-primary-700 bg-white/85 dark:bg-gray-900/35 p-2.5 space-y-1.5" data-tour-price-modal-category>
                <label className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Categoría</label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">Reasigna la categoría a todos los productos del modal.</p>
                <div className="flex gap-2">
                  <select value={quickCategory} onChange={(e) => setQuickCategory(e.target.value)} className="flex-1 px-2.5 py-1 text-xs border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="">Seleccionar...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={applyBulkCategory} disabled={!quickCategory} className="px-3 py-1 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg text-xs font-semibold">Aplicar</button>
                </div>
              </div>

              {/* Proveedor */}
              <div className="rounded-lg border border-primary-200/80 dark:border-primary-700 bg-white/85 dark:bg-gray-900/35 p-2.5 space-y-1.5" data-tour-price-modal-supplier>
                <label className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Proveedor</label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">Reasigna el proveedor para todos los productos editados.</p>
                <div className="flex gap-2">
                  <select value={quickSupplier} onChange={(e) => setQuickSupplier(e.target.value)} className="flex-1 px-2.5 py-1 text-xs border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600">
                    <option value="">Seleccionar...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={applyBulkSupplier} disabled={!quickSupplier} className="px-3 py-1 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg text-xs font-semibold">Aplicar</button>
                </div>
              </div>

              {/* Bonificaciones */}
              <div className="rounded-lg border border-primary-200/80 dark:border-primary-700 bg-white/85 dark:bg-gray-900/35 p-2.5 space-y-1.5" data-tour-price-modal-discount>
                <label className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Bonificaciones</label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">Formato en cadena: <strong>10+5+2</strong>.</p>
                <div className="flex min-w-0 items-center gap-1">
                  <input type="text" value={quickDiscount} onChange={(e) => setQuickDiscount(e.target.value)} placeholder="10+5+2" className="min-w-0 flex-1 px-2 py-1 text-[11px] text-center border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600" />
                  <button onClick={applyBulkDiscount} disabled={!quickDiscount} className="shrink-0 whitespace-nowrap rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-400">Aplicar</button>
                </div>
              </div>

              {/* Cargo Extra */}
              <div className="rounded-lg border border-primary-200/80 dark:border-primary-700 bg-white/85 dark:bg-gray-900/35 p-2.5 space-y-1.5" data-tour-price-modal-extra-cost>
                <label className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Cargo extra %</label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">Suma costo antes de ganancia e IVA.</p>
                <div className="flex min-w-0 items-center gap-1">
                  <input type="number" value={quickCargo} onChange={(e) => setQuickCargo(e.target.value)} placeholder="5" className="min-w-0 flex-1 px-2 py-1 text-[11px] text-center border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.1" />
                  <button onClick={applyBulkCargo} disabled={!quickCargo && quickCargo !== '0'} className="shrink-0 whitespace-nowrap rounded-lg bg-primary-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:bg-gray-400">Aplicar</button>
                </div>
              </div>

              {/* Ganancia */}
              <div className="rounded-lg border border-primary-200/80 dark:border-primary-700 bg-white/85 dark:bg-gray-900/35 p-2.5 space-y-1.5" data-tour-price-modal-profit>
                <label className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Ganancia %</label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">Margen comercial agregado al neto.</p>
                <div className="flex min-w-0 items-center gap-1">
                  <input type="number" value={quickProfit} onChange={(e) => setQuickProfit(e.target.value)} placeholder="30" className="min-w-0 flex-1 px-2 py-1 text-[11px] text-center border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600" step="0.1" />
                  <button onClick={applyBulkProfit} disabled={!quickProfit && quickProfit !== '0'} className="shrink-0 whitespace-nowrap rounded-lg bg-primary-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:bg-gray-400">Aplicar</button>
                </div>
              </div>

              {/* Stock */}
              <div className="rounded-lg border border-primary-200/80 dark:border-primary-700 bg-white/85 dark:bg-gray-900/35 p-2.5 space-y-1.5" data-tour-price-modal-stock>
                <label className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Stock</label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">Actualiza stock base para todos los productos cargados.</p>
                <div className="flex min-w-0 items-center gap-1">
                  <input type="number" value={quickStock} onChange={(e) => setQuickStock(e.target.value)} placeholder="100" className="min-w-0 flex-1 px-2 py-1 text-[11px] text-center border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600" />
                  <button onClick={applyBulkStock} disabled={!quickStock && quickStock !== '0'} className="shrink-0 whitespace-nowrap rounded-lg bg-primary-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:bg-gray-400">Aplicar</button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla Editable Desktop */}
          <div className="hidden lg:block overflow-auto border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm" data-tour-price-modal-table>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-20">
                <tr>
                  <th className="px-3 py-3 text-left sticky left-0 bg-gray-50 dark:bg-gray-800 z-30 w-28">Código</th>
                  <th className="px-3 py-3 text-center w-16">Estado</th>
                  <th className="px-3 py-3 text-left w-64">Nombre</th>
                  <th className="px-3 py-3 text-left w-40">Categoría</th>
                  <th className="px-3 py-3 text-left w-40">Proveedor</th>
                  <th className="px-3 py-3 text-center w-28">P. Lista</th>
                  <th className="px-3 py-3 text-center w-24">Bonif.</th>
                  <th className="px-3 py-3 text-center w-24">Cargo %</th>
                  <th className="px-3 py-3 text-center w-24">Ganancia %</th>
                  <th className="px-3 py-3 text-center w-20">Stock</th>
                  <th className="px-3 py-3 text-center bg-primary-100 dark:bg-primary-900/30 w-28">P. Final</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, index) => (
                  <tr key={product.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-3 py-2.5 sticky left-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{product.code}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-black transition-all ${
                        pendingRows[product.id]
                          ? 'border-red-400 bg-red-100 text-red-700 shadow-sm shadow-red-200 dark:border-red-700 dark:bg-red-900/40 dark:text-red-300 dark:shadow-none'
                          : 'border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-600'
                      }`} title={pendingRows[product.id] ? 'Pendiente de guardar' : 'Sin cambios pendientes'}>
                        {pendingRows[product.id] ? 'P' : '·'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input type="text" value={product.description} onChange={(e) => updateProduct(index, 'description', e.target.value)} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </td>
                    <td className="px-3 py-2.5">
                      <select value={product.category_id || ''} onChange={(e) => { const c = categories.find(x => x.id === e.target.value); updateProduct(index, 'category_id', e.target.value); updateProduct(index, 'category_name', c?.name) }} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600">
                        <option value="">Sin categoría</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <select value={product.supplier_id || ''} onChange={(e) => { const s = suppliers.find(x => x.id === e.target.value); updateProduct(index, 'supplier_id', e.target.value); updateProduct(index, 'supplier_name', s?.name) }} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600">
                        <option value="">Sin proveedor</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1">
                          {isUsdPricedProduct(product) && (
                            <span className="rounded bg-blue-100 px-1 text-[9px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">USD</span>
                          )}
                          <input {...bindEnterField(product, index, 'list_price')} type="number" value={product.list_price} onChange={(e) => updateProduct(index, 'list_price', parseEditableNumber(e.target.value))} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center font-medium" step="0.01" />
                        </div>
                        {renderCalculatedArsPrice(product)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input {...bindEnterField(product, index, 'discount_display')} type="text" value={product.discount_display || ''} onChange={(e) => updateProduct(index, 'discount_display', e.target.value)} placeholder="10+5" className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center" />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input {...bindEnterField(product, index, 'extra_cost')} type="number" value={product.extra_cost} onChange={(e) => updateProduct(index, 'extra_cost', parseEditableNumber(e.target.value))} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center" step="0.1" />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input {...bindEnterField(product, index, 'profit_margin')} type="number" value={product.profit_margin} onChange={(e) => updateProduct(index, 'profit_margin', parseEditableNumber(e.target.value))} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center" step="0.1" />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input {...bindEnterField(product, index, 'current_stock')} type="number" value={product.current_stock} onChange={(e) => updateProduct(index, 'current_stock', parseEditableNumber(e.target.value, parseInt))} className="w-full px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 text-center" />
                    </td>
                    <td className="px-3 py-2.5 bg-primary-50 dark:bg-primary-900/20 text-center">
                      <span className="font-bold text-sm text-primary-700 dark:text-primary-300">${calculateFinalPrice(product).toFixed(2)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards Editable Mobile */}
          <div className="lg:hidden space-y-2" data-tour-price-modal-table>
            {products.map((product, index) => (
              <article key={product.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {product.code}
                    </span>
                    <span className={`ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border align-middle text-[10px] font-black ${
                      pendingRows[product.id]
                        ? 'border-red-400 bg-red-100 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-600'
                    }`} title={pendingRows[product.id] ? 'Pendiente de guardar' : 'Sin cambios pendientes'}>
                      {pendingRows[product.id] ? 'P' : '·'}
                    </span>
                    <input
                      type="text"
                      value={product.description}
                      onChange={(e) => updateProduct(index, 'description', e.target.value)}
                      className="mt-1.5 w-full rounded-lg border px-2.5 py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                    />
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-600 dark:text-gray-300">Categoría</label>
                    <select value={product.category_id || ''} onChange={(e) => { const c = categories.find(x => x.id === e.target.value); updateProduct(index, 'category_id', e.target.value); updateProduct(index, 'category_name', c?.name) }} className="w-full rounded-lg border px-2 py-1.5 text-xs dark:bg-gray-700 dark:border-gray-600">
                      <option value="">Sin categoría</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-600 dark:text-gray-300">Proveedor</label>
                    <select value={product.supplier_id || ''} onChange={(e) => { const s = suppliers.find(x => x.id === e.target.value); updateProduct(index, 'supplier_id', e.target.value); updateProduct(index, 'supplier_name', s?.name) }} className="w-full rounded-lg border px-2 py-1.5 text-xs dark:bg-gray-700 dark:border-gray-600">
                      <option value="">Sin proveedor</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-600 dark:text-gray-300">
                      P. Lista {isUsdPricedProduct(product) && <span className="text-blue-600 dark:text-blue-400">(USD)</span>}
                    </label>
                    <input {...bindEnterField(product, index, 'list_price', 'mobile')} type="number" value={product.list_price} onChange={(e) => updateProduct(index, 'list_price', parseEditableNumber(e.target.value))} className="w-full rounded-lg border px-2 py-1.5 text-xs text-center font-medium dark:bg-gray-700 dark:border-gray-600" step="0.01" />
                    {renderCalculatedArsPrice(product)}
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-600 dark:text-gray-300">Bonif.</label>
                    <input {...bindEnterField(product, index, 'discount_display', 'mobile')} type="text" value={product.discount_display || ''} onChange={(e) => updateProduct(index, 'discount_display', e.target.value)} placeholder="10+5" className="w-full rounded-lg border px-2 py-1.5 text-xs text-center dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-600 dark:text-gray-300">Cargo %</label>
                    <input {...bindEnterField(product, index, 'extra_cost', 'mobile')} type="number" value={product.extra_cost} onChange={(e) => updateProduct(index, 'extra_cost', parseEditableNumber(e.target.value))} className="w-full rounded-lg border px-2 py-1.5 text-xs text-center dark:bg-gray-700 dark:border-gray-600" step="0.1" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-600 dark:text-gray-300">Ganancia %</label>
                    <input {...bindEnterField(product, index, 'profit_margin', 'mobile')} type="number" value={product.profit_margin} onChange={(e) => updateProduct(index, 'profit_margin', parseEditableNumber(e.target.value))} className="w-full rounded-lg border px-2 py-1.5 text-xs text-center dark:bg-gray-700 dark:border-gray-600" step="0.1" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-600 dark:text-gray-300">Stock</label>
                    <input {...bindEnterField(product, index, 'current_stock', 'mobile')} type="number" value={product.current_stock} onChange={(e) => updateProduct(index, 'current_stock', parseEditableNumber(e.target.value, parseInt))} className="w-full rounded-lg border px-2 py-1.5 text-xs text-center dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-primary-700 dark:text-primary-300">P. Final</label>
                    <div className="flex h-[34px] items-center justify-center rounded-lg border border-primary-200 bg-primary-50 px-2 text-sm font-bold text-primary-700 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
                      <TrendingUp size={12} className="mr-1" />
                      ${calculateFinalPrice(product).toFixed(2)}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Info */}
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-xl p-3" data-tour-price-modal-formula>
            <p className="text-xs text-primary-800 dark:text-primary-300">
              💡 Fórmula de precio final: <span className="font-bold">Lista → Bonificaciones en cadena → Cargo Extra → Ganancia → IVA 21%</span>.
              Las Acciones Rápidas aplican sobre el precio fuente mostrado ({products.some(isUsdPricedProduct) ? 'USD para productos dolarizados, ARS para el resto' : 'ARS'}).
            </p>
          </div>
        </div>

        {/* ── Footer fijo — SIEMPRE VISIBLE ────────────────────────────── */}
        <div className="shrink-0 px-4 lg:px-6 py-3 lg:py-4 border-t-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          {/* Cancelar */}
          <Button
            variant="outline"
            onClick={() => void handleClose()}
            disabled={isSaving}
            className="w-full lg:flex-1"
          >
            <span className="inline-flex w-full items-center justify-center gap-2">
              <X size={16} />
              Cancelar
            </span>
          </Button>

          {/* Guardar borrador */}
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSaving || isSavingDraft}
            className="w-full lg:flex-1 border-amber-400 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-900/20"
          >
            {isSavingDraft ? (
              <span className="inline-flex w-full items-center justify-center gap-2"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600" />Guardando...</span>
            ) : (
              <span className="inline-flex w-full items-center justify-center gap-2"><BookmarkCheck size={16} />{existingDraftId ? 'Actualizar borrador' : 'Guardar borrador'}</span>
            )}
          </Button>

          {/* Guardar cambios */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full lg:flex-[2] bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
            data-tour-price-modal-save
          >
            {isSaving ? (
              <span className="inline-flex w-full items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Guardando...
              </span>
            ) : (
              <span className="inline-flex w-full items-center justify-center gap-2">
                <Save size={16} />
                Guardar {Object.keys(pendingRows).length || products.length} Cambios
              </span>
            )}
          </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
