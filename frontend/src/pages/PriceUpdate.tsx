/**
 * Página de Actualización Masiva de Precios.
 * Permite actualizar precios por categoría, proveedor o selección manual.
 * Soporta guardar listas de selección en memoria (localStorage) para continuar después.
 */
import { useState, type MouseEvent } from 'react'
import { TrendingUp, Search, Filter, DollarSign, FolderOpen, Trash2, ChevronUp, Clock, Package } from 'lucide-react'
import { Button, Table } from '../components/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import productsService, { Product } from '../api/productsService'
import categoriesService from '../api/categoriesService'
import suppliersService from '../api/suppliersService'
import priceUpdateDraftsService, { DraftSummary } from '../api/priceUpdateDraftsService'
import BulkEditProductsModal from '../components/prices/BulkEditProductsModal'
import toast from 'react-hot-toast'

// ─── Componente ────────────────────────────────────────────────────────────────

export default function PriceUpdate() {
  const queryClient = useQueryClient()

  // Filtros
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [page] = useState(1)

  // Selección de productos
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>()

  // Panel de borradores
  const [showDrafts, setShowDrafts] = useState(false)
  // Productos cargados desde un borrador (sobreescribe la selección de la tabla)
  const [draftProducts, setDraftProducts] = useState<any[] | null>(null)

  // Queries
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', page, search, selectedCategory, selectedSupplier],
    queryFn: () => productsService.getAll({
      page,
      per_page: 100,
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

  const products = productsData?.items || []
  const categories = Array.isArray(categoriesData) ? categoriesData : []
  const suppliers = Array.isArray(suppliersData?.items) ? suppliersData.items : []

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

  // ─── Guardar cambios ────────────────────────────────────────────────────────

  const handleSaveBulkEdit = async (editedProducts: any[]) => {
    try {
      for (const product of editedProducts) {
        await productsService.update(product.id, {
          description: product.description,
          category_id: product.category_id || null,
          supplier_id: product.supplier_id || null,
          list_price: product.list_price,
          discount_1: product.discount_1,
          discount_2: product.discount_2,
          discount_3: product.discount_3,
          extra_cost: product.extra_cost,
          profit_margin: product.profit_margin,
          current_stock: product.current_stock,
        })
      }

      // Si se guardó desde un borrador, eliminarlo — ya no tiene sentido guardarlo
      if (activeDraftId) {
        try {
          await priceUpdateDraftsService.delete(activeDraftId)
          refetchDrafts()
        } catch {
          // No bloquear el flujo si falla el delete del borrador
        }
        setActiveDraftId(undefined)
        setDraftProducts(null)
      }

      toast.success(`${editedProducts.length} productos actualizados correctamente`, {
        duration: 5000,
        icon: '✅'
      })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setSelectedProducts(new Set())
    } catch (error: any) {
      toast.error('Error al guardar cambios: ' + (error.response?.data?.detail || error.message))
      throw error
    }
  }

  // ─── Columnas de la tabla ────────────────────────────────────────────────────

  const columns: any[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={selectedProducts.size === products.length && products.length > 0}
          onChange={toggleSelectAll}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      ),
      render: (item: Product) => (
        <input
          type="checkbox"
          checked={selectedProducts.has(item.id)}
          onChange={() => toggleSelectProduct(item.id)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      ),
    },
    {
      key: 'code',
      header: 'Código',
      render: (item: Product) => <span className="font-mono text-xs">{item.code}</span>,
    },
    {
      key: 'description',
      header: 'Descripción',
      render: (item: Product) => <span className="text-sm">{item.description}</span>,
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (item: Product) => {
        const category = categories.find(c => c.id === item.category_id)
        return category ? (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
            {category.name}
          </span>
        ) : <span className="text-gray-400 text-xs">-</span>
      },
    },
    {
      key: 'supplier',
      header: 'Proveedor',
      render: (item: Product) => {
        const supplier = suppliers.find(s => s.id === item.supplier_id)
        return supplier ? (
          <span className="text-xs">{supplier.name}</span>
        ) : <span className="text-gray-400 text-xs">-</span>
      },
    },
    {
      key: 'list_price',
      header: 'P. Lista',
      render: (item: Product) => (
        <span className="font-medium text-sm">${Number(item.list_price).toFixed(2)}</span>
      ),
    },
    {
      key: 'discount',
      header: 'Bonif.',
      render: (item: Product) => (
        <span className="text-xs text-green-600 dark:text-green-400">
          {item.discount_display || '-'}
        </span>
      ),
    },
    {
      key: 'sale_price',
      header: 'P. Venta',
      render: (item: Product) => (
        <span className="font-bold text-sm text-blue-600 dark:text-blue-400">
          ${Number(item.sale_price).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (item: Product) => <span className="text-sm">{item.current_stock}</span>,
    },
  ]

  const hasActiveFilter = !!(selectedCategory || selectedSupplier || search)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* PASO 1: Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-[18px] w-[18px] text-orange-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Paso 1: Filtrar Productos
            </h2>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <button
              onClick={() => setShowDrafts(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-gray-500 hover:text-orange-600 dark:text-gray-400 dark:hover:text-orange-400 transition-colors"
            >
              <FolderOpen size={18} className="shrink-0" />
              <span className="text-xs font-medium">Borradores</span>
              {draftsData && draftsData.length > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white">
                  {draftsData.length}
                </span>
              )}
            </button>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Seleccionados</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">{selectedProducts.size}</div>
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
              className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white disabled:opacity-50"
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
          <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-orange-200 dark:border-orange-800 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-orange-500" />
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Borradores guardados</h3>
                <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full font-medium">
                  {draftsData?.length ?? 0}
                </span>
              </div>
              <button onClick={() => setShowDrafts(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <ChevronUp size={16} />
              </button>
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
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors group text-left"
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
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded">{draft.filter_category_name}</span>
                          )}
                          {draft.filter_supplier_name && (
                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 px-1.5 py-0.5 rounded">{draft.filter_supplier_name}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        <span className="text-xs text-orange-500 dark:text-orange-400 group-hover:underline font-medium">Retomar →</span>
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
              onChange={(e) => setSelectedCategory(e.target.value)}
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
              onChange={(e) => setSelectedSupplier(e.target.value)}
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código o nombre..."
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm text-gray-900 dark:text-white"
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
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <DollarSign className="h-[18px] w-[18px] text-orange-600" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Paso 2: Seleccionar Productos
            </h2>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {products.length} productos encontrados
          </span>
        </div>
        <div className="max-h-[58vh] overflow-y-auto rounded-lg">
          <Table columns={columns} data={products} density="compact" emptyMessage="No se encontraron productos con los filtros seleccionados" />
        </div>
      </div>

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
        onClose={() => {
          setShowBulkEditModal(false)
          setActiveDraftId(undefined)
          setDraftProducts(null)
        }}
        onSave={handleSaveBulkEdit}
        onDraftSaved={refetchDrafts}
        products={draftProducts ?? products.filter(p => selectedProducts.has(p.id))}
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
    </div>
  )
}
