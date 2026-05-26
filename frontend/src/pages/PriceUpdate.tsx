/**
 * Página de Actualización Masiva de Precios.
 * Permite actualizar precios por categoría, proveedor o selección manual.
 * Soporta guardar listas de selección en memoria (localStorage) para continuar después.
 */
import { useState, type MouseEvent } from 'react'
import { TrendingUp, Search, Filter, DollarSign, FolderOpen, Trash2, ChevronUp, Clock, Package, RefreshCw } from 'lucide-react'
import { Button, ConfirmModal, Pagination } from '../components/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import productsService, { Product, ProductBulkUpdateItem } from '../api/productsService'
import categoriesService from '../api/categoriesService'
import suppliersService from '../api/suppliersService'
import priceUpdateDraftsService, { DraftSummary } from '../api/priceUpdateDraftsService'
import exchangeRateService from '../api/exchangeRateService'
import BulkEditProductsModal, { type EditableProduct } from '../components/prices/BulkEditProductsModal'
import ExcelMassPriceUpdateModal from '../components/prices/ExcelMassPriceUpdateModal'
import { buildProductPriceUpdatePayload, formatSourceListPrice, isUsdPricedProduct } from '../utils/productPricing'
import toast from 'react-hot-toast'

const EMPTY_PRODUCTS: Product[] = []

const toNonNegativeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, parsed)
}

const formatMoney = (value: unknown) => `$${toNonNegativeNumber(value).toFixed(2)}`

const formatNumber = (value: unknown) => toNonNegativeNumber(value).toLocaleString('es-AR', {
  maximumFractionDigits: 2,
})

const mergeUpdatedProductsIntoCache = (cachedData: unknown, updatedProducts: Product[]) => {
  if (!cachedData || typeof cachedData !== 'object' || !('items' in cachedData)) {
    return cachedData
  }

  const paginatedData = cachedData as { items?: Product[] }
  if (!Array.isArray(paginatedData.items)) return cachedData

  const updatedById = new Map(updatedProducts.map((product) => [product.id, product]))

  return {
    ...cachedData,
    items: paginatedData.items.map((product) => updatedById.get(product.id) ?? product),
  }
}

const getDiscountDisplay = (product: Product) => {
  if (product.discount_display) return product.discount_display
  const discounts = [product.discount_1, product.discount_2, product.discount_3]
    .map((discount) => Number(discount || 0))
    .filter((discount) => discount > 0)

  return discounts.length > 0 ? discounts.join('+') : '0'
}

// ─── Componente ────────────────────────────────────────────────────────────────

export default function PriceUpdate() {
  const queryClient = useQueryClient()

  // Filtros
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [page, setPage] = useState(1)

  // Selección de productos
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [showExcelMassUpdateModal, setShowExcelMassUpdateModal] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>()
  const [showDeleteAllDraftsModal, setShowDeleteAllDraftsModal] = useState(false)
  const [isDeletingAllDrafts, setIsDeletingAllDrafts] = useState(false)

  // Panel de borradores
  const [showDrafts, setShowDrafts] = useState(false)
  // Productos cargados desde un borrador (sobreescribe la selección de la tabla)
  const [draftProducts, setDraftProducts] = useState<EditableProduct[] | null>(null)

  // Queries
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', page, search, selectedCategory, selectedSupplier],
    queryFn: () => productsService.getAll({
      page,
      per_page: 20,
      search,
      category_id: selectedCategory || undefined,
      supplier_id: selectedSupplier || undefined,
    }),
    retry: false,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesService.getAll(),
  })

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersService.getAll({ per_page: 100 }),
  })

  const { data: draftsData, refetch: refetchDrafts } = useQuery({
    queryKey: ['price-update-drafts'],
    queryFn: () => priceUpdateDraftsService.list(),
    retry: false,
  })

  const { data: exchangeRates } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => exchangeRateService.getRates(),
    staleTime: 10 * 60 * 1000,
  })

  const activeExchangeRate = exchangeRates?.blue.promedio ?? 0

  const products = productsData?.items ?? EMPTY_PRODUCTS
  const categories = Array.isArray(categoriesData) ? categoriesData : []
  const suppliers = Array.isArray(suppliersData?.items) ? suppliersData.items : []

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return null
    return categories.find((c) => c.id === categoryId)?.name || null
  }

  const getSupplierName = (supplierId?: string) => {
    if (!supplierId) return null
    return suppliers.find((s) => s.id === supplierId)?.name || null
  }

  // ─── Handlers de selección ──────────────────────────────────────────────────

  const toggleSelectProduct = (productId: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedProducts.size === products.length && products.length > 0) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)))
    }
  }

  const clearFilters = () => {
    setSelectedCategory('')
    setSelectedSupplier('')
    setSearch('')
    setPage(1)
  }

  // ─── Cargar borrador desde BD ────────────────────────────────────────────────

  const handleLoadDraft = async (draft: DraftSummary) => {
    try {
      const detail = await priceUpdateDraftsService.get(draft.id)
      // Restaurar filtros
      setSearch(detail.filter_search || '')
      setSelectedCategory('')
      setSelectedSupplier('')
      // Abrir modal con los productos del borrador ya cargados
      setActiveDraftId(draft.id)
      setShowDrafts(false)
      // Pequeño delay para que los filtros se apliquen antes de abrir el modal
      setTimeout(() => setShowBulkEditModal(true), 50)
      // Guardamos los productos en un ref temporal para pasarlos al modal
      setDraftProducts(detail.products)
      toast.success(`Borrador "${draft.name}" cargado`)
    } catch {
      toast.error('Error al cargar el borrador')
    }
  }

  const handleDraftSaved = (draftId: string) => {
    setActiveDraftId(draftId)
    void refetchDrafts()
  }

  const handleCloseBulkEdit = (draftId?: string, products?: EditableProduct[]) => {
    setShowBulkEditModal(false)

    if (draftId && products) {
      setActiveDraftId(draftId)
      setDraftProducts(products)
    }
  }

  const handleDeleteDraft = async (draftId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    try {
      await priceUpdateDraftsService.delete(draftId)
      refetchDrafts()
      toast.success('Borrador eliminado')
    } catch {
      toast.error('Error al eliminar el borrador')
    }
  }

  const handleDeleteAllDrafts = async () => {
    const draftCount = draftsData?.length ?? 0
    if (draftCount === 0) return

    setIsDeletingAllDrafts(true)
    try {
      const result = await priceUpdateDraftsService.deleteAll()
      setActiveDraftId(undefined)
      setDraftProducts(null)
      await refetchDrafts()
      setShowDeleteAllDraftsModal(false)
      toast.success(`${result.deleted_count} borradores eliminados`, { icon: '🗑️' })
    } catch {
      toast.error('Error al eliminar los borradores')
    } finally {
      setIsDeletingAllDrafts(false)
    }
  }

  // ─── Guardar cambios ────────────────────────────────────────────────────────

  const handleSaveBulkEdit = async (editedProducts: EditableProduct[], draftId?: string) => {
    try {
      if (editedProducts.some(isUsdPricedProduct) && activeExchangeRate <= 0) {
        throw new Error('No se pudo obtener la cotización blue para convertir precios USD')
      }

      const payload: ProductBulkUpdateItem[] = editedProducts.map((product) => ({
        id: product.id,
        description: product.description,
        ...(product.category_id ? { category_id: product.category_id } : {}),
        ...(product.supplier_id ? { supplier_id: product.supplier_id } : {}),
        ...buildProductPriceUpdatePayload(product, activeExchangeRate),
      }))

      const result = await productsService.bulkUpdate(payload)

      // Si se guardó desde un borrador, eliminarlo — ya no tiene sentido guardarlo
      const draftToDelete = draftId || activeDraftId
      if (draftToDelete) {
        try {
          await priceUpdateDraftsService.delete(draftToDelete)
          refetchDrafts()
        } catch {
          // No bloquear el flujo si falla el delete del borrador
        }
        setActiveDraftId(undefined)
        setDraftProducts(null)
      }

      toast.success(`${result.updated_count} productos actualizados correctamente`, {
        duration: 5000,
        icon: '✅'
      })
      queryClient.setQueriesData(
        { queryKey: ['products'] },
        (cachedData) => mergeUpdatedProductsIntoCache(cachedData, result.products),
      )
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.refetchQueries({ queryKey: ['products'], type: 'active' })
      setSelectedProducts(new Set())
    } catch (error: any) {
      toast.error('Error al guardar cambios: ' + (error.response?.data?.detail || error.message))
      throw error
    }
  }

  const hasActiveFilter = !!(selectedCategory || selectedSupplier || search)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* PASO 1: Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms' }} data-tour-price-filters-panel>
        <div className="mb-4 space-y-3 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-[18px] w-[18px] text-orange-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Paso 1: Filtrar Productos
            </h2>
          </div>

          <div className="grid grid-cols-2 items-center gap-2 lg:flex lg:items-center lg:gap-3 lg:ml-auto">
            <button
              onClick={() => setShowExcelMassUpdateModal(true)}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-200 bg-primary-50 px-3 text-primary-700 transition-colors hover:border-primary-400 hover:bg-primary-100 hover:text-primary-800 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-200 dark:hover:border-primary-600 dark:hover:bg-primary-900/40 lg:w-auto"
            >
              <RefreshCw size={16} className="shrink-0" />
              <span className="text-xs font-medium">Actualización Masiva</span>
            </button>

            <button
              onClick={() => setShowDrafts(v => !v)}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-200 px-3 text-primary-600 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 dark:border-primary-800 dark:text-primary-300 dark:hover:border-primary-600 dark:hover:bg-primary-900/20 lg:w-auto"
              data-tour-price-drafts
            >
              <FolderOpen size={16} className="shrink-0" />
              <span className="text-xs font-medium">Borradores</span>
              {draftsData && draftsData.length > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold leading-none text-white">
                  {draftsData.length}
                </span>
              )}
            </button>

            <div className="flex h-10 min-w-[108px] flex-col items-center justify-center rounded-lg border border-gray-200 px-3 text-center dark:border-gray-700">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Seleccionados</div>
              <div className="text-lg font-bold leading-tight text-gray-900 dark:text-white">{selectedProducts.size}</div>
            </div>
          </div>

          {/* Botón actualizar: visible con filtro activo o selección */}
          {(hasActiveFilter || selectedProducts.size > 0) && (
            <Button
              onClick={() => {
                // Si no hay selección manual, seleccionar todos los filtrados automáticamente
                if (selectedProducts.size === 0 && products.length > 0) {
                  setSelectedProducts(new Set(products.map(p => p.id)))
                }
                setShowBulkEditModal(true)
              }}
              disabled={products.length === 0}
              size="sm"
              className="h-10 w-full whitespace-nowrap bg-gradient-to-r from-orange-500 to-amber-600 px-3 hover:from-orange-600 hover:to-amber-700 text-white disabled:opacity-50 lg:w-auto"
              data-tour-price-update-top
            >
              <TrendingUp size={14} className="mr-1.5" />
              Actualizar Precios
              <span className="ml-2 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {selectedProducts.size > 0 ? selectedProducts.size : products.length}
              </span>
            </Button>
          )}
        </div>

        {/* Panel de borradores (desplegable) */}
        {showDrafts && (
          <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-primary-200 dark:border-primary-800 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-primary-600 dark:text-primary-300" />
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Borradores guardados</h3>
                <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full font-medium">
                  {draftsData?.length ?? 0}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {draftsData && draftsData.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteAllDraftsModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/25 dark:text-primary-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/40"
                  >
                    <Trash2 size={13} />
                    Eliminar todos
                  </button>
                )}
                <button onClick={() => setShowDrafts(false)} className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-300">
                  <ChevronUp size={16} />
                </button>
              </div>
            </div>

            {!draftsData || draftsData.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Package size={30} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No hay borradores guardados</p>
                <p className="text-xs mt-1 opacity-60">Usa "Guardar borrador" en el modal de edición para guardar</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
                {draftsData.map((draft) => {
                  const date = new Date(draft.updated_at)
                  const dateStr = date.toLocaleDateString('es-AR') + ' ' + date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <button
                      key={draft.id}
                      onClick={() => handleLoadDraft(draft)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors group text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{draft.name}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Package size={11} />{draft.product_count} productos
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock size={11} />{dateStr}
                          </span>
                          {draft.filter_category_name && (
                            <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 px-1.5 py-0.5 rounded">{draft.filter_category_name}</span>
                          )}
                          {draft.filter_supplier_name && (
                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 px-1.5 py-0.5 rounded">{draft.filter_supplier_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        <span className="text-xs text-primary-600 dark:text-primary-300 group-hover:underline font-medium">Retomar →</span>
                        <button
                          onClick={(e) => handleDeleteDraft(draft.id, e)}
                          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          title="Eliminar borrador"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
          {/* Categoría */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Categoría
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => { setPage(1); setSelectedCategory(e.target.value) }}
              className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Todas las categorías</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Proveedor */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Proveedor
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => { setPage(1); setSelectedSupplier(e.target.value) }}
              className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>{sup.name}</option>
              ))}
            </select>
          </div>

          {/* Búsqueda */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Buscar
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value) }}
                placeholder="Código o nombre..."
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm text-gray-900 dark:text-white"
                data-tour-price-search
              />
            </div>
          </div>

          {/* Limpiar filtros */}
          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
              Limpiar Filtros
            </Button>
          </div>
        </div>

        {/* Tags de filtros activos */}
        {hasActiveFilter && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-600 dark:text-gray-400">Filtrando:</span>
            {selectedCategory && (
              <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-1 rounded-full">
                {categories.find(c => c.id === selectedCategory)?.name}
              </span>
            )}
            {selectedSupplier && (
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                {suppliers.find(s => s.id === selectedSupplier)?.name}
              </span>
            )}
            {search && (
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded-full">
                "{search}"
              </span>
            )}
          </div>
        )}
      </div>

      {/* PASO 2: Tabla */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms' }} data-tour-price-table-panel>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <DollarSign className="h-[18px] w-[18px] text-orange-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Paso 2: Seleccionar Productos
            </h2>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {productsData?.total ?? products.length} productos encontrados
          </span>
        </div>
        <div className="hidden lg:block max-h-[58vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700" data-tour-price-table>
          {products.length === 0 ? (
            <div className="bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 dark:bg-gray-900/30 dark:text-gray-400">
              No se encontraron productos con los filtros seleccionados
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur dark:bg-gray-900/95">
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedProducts.size === products.length && products.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      data-tour-price-select-all
                    />
                  </th>
                  <th className="px-3 py-2.5">Código</th>
                  <th className="min-w-[220px] px-3 py-2.5">Descripción</th>
                  <th className="px-3 py-2.5">Categoría</th>
                  <th className="px-3 py-2.5">Proveedor</th>
                  <th className="w-28 px-3 py-2.5 text-center">P. Lista</th>
                  <th className="w-24 px-3 py-2.5 text-center">Bonif.</th>
                  <th className="w-24 px-3 py-2.5 text-center">Cargo</th>
                  <th className="w-24 px-3 py-2.5 text-center">Ganancia</th>
                  <th className="w-24 px-3 py-2.5 text-center">Stock</th>
                  <th className="w-28 px-3 py-2.5 text-right">P. Venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-800">
                {products.map((item) => {
                  const categoryName = getCategoryName(item.category_id)
                  const supplierName = getSupplierName(item.supplier_id)
                  const salePrice = Number(item.sale_price || 0)
                  const isSelected = selectedProducts.has(item.id)

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${isSelected ? 'bg-orange-50/70 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-900/30'}`}
                    >
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectProduct(item.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle font-mono text-xs text-gray-600 dark:text-gray-300">{item.code}</td>
                      <td className="px-3 py-2 align-middle">
                        <span className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.description}</span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {categoryName ? (
                          <span className="rounded bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">{categoryName}</span>
                        ) : <span className="text-xs text-gray-400">-</span>}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {supplierName ? <span className="text-xs text-gray-600 dark:text-gray-300">{supplierName}</span> : <span className="text-xs text-gray-400">-</span>}
                      </td>
                      <td className="px-3 py-2 align-middle text-center">
                        <span className="inline-flex flex-col items-center gap-0.5 font-semibold text-gray-900 dark:text-gray-100">
                          <span className="flex items-center gap-1">
                            {formatSourceListPrice(item)}
                            {isUsdPricedProduct(item) && (
                              <span className="rounded bg-blue-100 px-1 text-[9px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">USD</span>
                            )}
                          </span>
                          {isUsdPricedProduct(item) && (
                            <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                              {formatMoney(item.list_price)} calc.
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle text-center text-gray-700 dark:text-gray-300">{getDiscountDisplay(item)}</td>
                      <td className="px-3 py-2 align-middle text-center text-gray-700 dark:text-gray-300">{formatNumber(item.extra_cost)}</td>
                      <td className="px-3 py-2 align-middle text-center text-gray-700 dark:text-gray-300">{formatNumber(item.profit_margin)}</td>
                      <td className="px-3 py-2 align-middle text-center font-medium text-gray-900 dark:text-gray-100">{formatNumber(item.current_stock)}</td>
                      <td className="px-3 py-2 align-middle text-right font-bold text-orange-600 dark:text-orange-300">${salePrice.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="lg:hidden space-y-2" data-tour-price-table>
          {products.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
              No se encontraron productos con los filtros seleccionados
            </div>
          ) : (
            products.map((item) => {
              const categoryName = getCategoryName(item.category_id)
              const supplierName = getSupplierName(item.supplier_id)
              const lowStock = item.current_stock < 10
              const isSelected = selectedProducts.has(item.id)
              const salePrice = Number(item.sale_price || 0)

              return (
                <article
                  key={item.id}
                  className={`rounded-xl border p-3 shadow-sm transition-colors ${
                    isSelected
                      ? 'border-orange-300 bg-orange-50/60 dark:border-orange-700 dark:bg-orange-900/20'
                      : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {item.code}
                        </span>
                        {lowStock && (
                          <span className="inline-flex rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            Stock bajo
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.description}</h3>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectProduct(item.id)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      aria-label={`Seleccionar ${item.description}`}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {categoryName ? (
                      <span className="inline-flex rounded-md bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        {categoryName}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        Sin categoría
                      </span>
                    )}

                    {supplierName ? (
                      <span className="inline-flex rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        {supplierName}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        Sin proveedor
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">P. Lista</p>
                      <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">
                        {formatSourceListPrice(item)}
                        {isUsdPricedProduct(item) && <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400">USD</span>}
                      </p>
                      {isUsdPricedProduct(item) && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          {formatMoney(item.list_price)} calc.
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5 dark:border-orange-800 dark:bg-orange-900/20">
                      <p className="text-[10px] text-orange-700 dark:text-orange-300">P. Venta</p>
                      <p className="mt-1 font-semibold text-orange-700 dark:text-orange-300">${salePrice.toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Bonif.</p>
                      <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{getDiscountDisplay(item)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Cargo</p>
                      <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{formatNumber(item.extra_cost)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Ganancia</p>
                      <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{formatNumber(item.profit_margin)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/30">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Stock</p>
                      <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{formatNumber(item.current_stock)}</p>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>

      {/* Paginación */}
      {productsData && (
        <Pagination
          currentPage={page}
          totalPages={productsData.pages}
          onPageChange={setPage}
          totalItems={productsData.total}
          itemsPerPage={20}
        />
      )}

      {/* Botón flotante — aparece cuando hay selección */}
      {selectedProducts.size > 0 && (
        <div className="fixed bottom-6 right-6 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border-2 border-orange-500 p-3.5 flex flex-col gap-2 min-w-[190px]">
            <div className="text-center">
              <div className="text-xs text-gray-500 dark:text-gray-400">Seleccionados</div>
              <div className="text-2xl font-bold text-orange-600">{selectedProducts.size}</div>
            </div>

            {/* Actualizar */}
            <Button
              onClick={() => setShowBulkEditModal(true)}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg"
              size="md"
              data-tour-price-update-floating
            >
              <TrendingUp size={16} className="mr-2" />
              Actualizar Precios
            </Button>
          </div>
        </div>
      )}

      {/* Modal de edición masiva */}
      <BulkEditProductsModal
        isOpen={showBulkEditModal}
        onClose={handleCloseBulkEdit}
        onSave={handleSaveBulkEdit}
        onDraftSaved={handleDraftSaved}
        products={draftProducts ?? products.filter(p => selectedProducts.has(p.id))}
        exchangeRate={activeExchangeRate}
        categories={categories}
        suppliers={suppliers}
        draftFilters={{
          category_id: selectedCategory || undefined,
          category_name: categories.find(c => c.id === selectedCategory)?.name,
          supplier_id: selectedSupplier || undefined,
          supplier_name: suppliers.find(s => s.id === selectedSupplier)?.name,
          search: search || undefined,
        }}
        existingDraftId={activeDraftId}
      />

      <ExcelMassPriceUpdateModal
        isOpen={showExcelMassUpdateModal}
        onClose={() => setShowExcelMassUpdateModal(false)}
        onCompleted={async () => {
          await queryClient.invalidateQueries({ queryKey: ['products'] })
        }}
      />

      <ConfirmModal
        isOpen={showDeleteAllDraftsModal}
        onClose={() => setShowDeleteAllDraftsModal(false)}
        onConfirm={handleDeleteAllDrafts}
        title="Eliminar todos los borradores"
        description="Vas a eliminar todos los borradores guardados de actualización de precios. Esta acción no se puede deshacer."
        confirmText={isDeletingAllDrafts ? 'Eliminando...' : 'Eliminar todos'}
        cancelText="Cancelar"
        variant="info"
        isLoading={isDeletingAllDrafts}
      >
        <div className="mb-5 w-full rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-left dark:border-primary-800 dark:bg-primary-900/20">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-600 dark:text-primary-300">
            Borradores afectados
          </p>
          <p className="mt-1 text-2xl font-black text-primary-800 dark:text-primary-100">
            {draftsData?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-primary-700/80 dark:text-primary-200/80">
            Se quitarán del listado y no vas a poder retomarlos después.
          </p>
        </div>
      </ConfirmModal>
    </div>
  )
}
