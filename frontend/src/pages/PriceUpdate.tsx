/**
 * Página de Actualización Masiva de Precios.
 * Permite actualizar precios por categoría, proveedor o selección manual.
 */
import { useState } from 'react'
import { TrendingUp, Search, Filter, DollarSign, Check } from 'lucide-react'
import { Button, Table } from '../components/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import productsService, { Product } from '../api/productsService'
import categoriesService from '../api/categoriesService'
import suppliersService from '../api/suppliersService'
import priceUpdateService, { PriceUpdatePreviewResponse, PriceUpdateRequest } from '../api/priceUpdateService'
import BulkEditProductsModal from '../components/prices/BulkEditProductsModal'
import toast from 'react-hot-toast'

export default function PriceUpdate() {
  const queryClient = useQueryClient()
  
  // State - Filtros
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [page, setPage] = useState(1)
  
  // State - Selección
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)

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

  const products = productsData?.items || []
  const categories = Array.isArray(categoriesData) ? categoriesData : []
  const suppliers = Array.isArray(suppliersData?.items) ? suppliersData.items : []

  // Handlers
  const toggleSelectProduct = (productId: string) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
      } else {
        newSet.add(productId)
      }
      return newSet
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

  const handleSaveBulkEdit = async (editedProducts: any[]) => {
    try {
      // Actualizar cada producto
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
          current_stock: product.current_stock,
        })
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

  // Columnas de la tabla
  const columns = [
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header con gradiente */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-600 rounded-2xl p-6 text-white shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
              <TrendingUp className="h-8 w-8" />
              Actualización Masiva de Precios
            </h1>
            <p className="text-orange-100 text-lg">
              Actualiza precios, descuentos y stock de múltiples productos a la vez
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-orange-100">Productos seleccionados</div>
            <div className="text-4xl font-bold">{selectedProducts.size}</div>
          </div>
        </div>
      </div>

      {/* PASO 1: Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-orange-600" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Paso 1: Filtrar Productos
          </h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Categoría */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Categoría
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white"
            >
              <option value="">Todas las categorías</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Proveedor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Proveedor
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map(sup => (
                <option key={sup.id} value={sup.id}>{sup.name}</option>
              ))}
            </select>
          </div>

          {/* Búsqueda */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Buscar
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código o nombre..."
                className="w-full pl-10 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Botón limpiar */}
          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={clearFilters}
              className="w-full"
            >
              Limpiar Filtros
            </Button>
          </div>
        </div>

        {/* Resumen de filtros */}
        {(selectedCategory || selectedSupplier || search) && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600 dark:text-gray-400">Filtrando:</span>
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

      {/* PASO 2: Tabla de Selección */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Paso 2: Seleccionar Productos
            </h2>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {products.length} productos encontrados
          </div>
        </div>

        <Table columns={columns} data={products} emptyMessage="No se encontraron productos con los filtros seleccionados" />
      </div>

      {/* Botón flotante de acción */}
      {selectedProducts.size > 0 && (
        <div className="fixed bottom-8 right-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-orange-500 p-4">
            <div className="text-center mb-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">Productos seleccionados</div>
              <div className="text-3xl font-bold text-orange-600">{selectedProducts.size}</div>
            </div>
            <Button
              onClick={() => setShowBulkEditModal(true)}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg"
              size="lg"
            >
              <TrendingUp size={20} className="mr-2" />
              Editar Seleccionados
            </Button>
          </div>
        </div>
      )}

      {/* Modal de edición masiva tipo Excel */}
      <BulkEditProductsModal
        isOpen={showBulkEditModal}
        onClose={() => setShowBulkEditModal(false)}
        onSave={handleSaveBulkEdit}
        products={products.filter(p => selectedProducts.has(p.id))}
        categories={categories}
        suppliers={suppliers}
      />
    </div>
  )
}
