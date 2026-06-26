import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckSquare, PackagePlus, Search, Square } from 'lucide-react'
import { Button, Input, Modal, Select } from '../../components/ui'
import { productsService, Product, PaginatedResponse } from '../../api/productsService'
import categoriesService from '../../api/categoriesService'
import suppliersService from '../../api/suppliersService'
import brandsService from '../../api/brandsService'
import { PriceListItem } from '../../api/priceListsService'

interface Props {
  isOpen: boolean
  listName: string
  existingItems: PriceListItem[]
  onClose: () => void
  onConfirm: (productIds: string[]) => void
  isPending: boolean
}

interface ImportFilters {
  search: string
  categoryId: string
  supplierId: string
  brandId: string
  onlyActive: boolean
  page: number
}

const PAGE_SIZE = 100

function formatMoney(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  })
}

export default function AddProductsToPriceListModal({
  isOpen,
  listName,
  existingItems,
  onClose,
  onConfirm,
  isPending,
}: Props) {
  const [filters, setFilters] = useState<ImportFilters>({
    search: '',
    categoryId: '',
    supplierId: '',
    brandId: '',
    onlyActive: true,
    page: 1,
  })
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [filters.search])

  useEffect(() => {
    if (!isOpen) {
      setSelectedProductIds([])
      setFilters({
        search: '',
        categoryId: '',
        supplierId: '',
        brandId: '',
        onlyActive: true,
        page: 1,
      })
    }
  }, [isOpen])

  const importedProductIds = new Set(
    existingItems
      .map((item) => item.product_id)
      .filter((id): id is string => Boolean(id)),
  )
  const importedProductCodes = new Set(existingItems.map((item) => item.product_code))

  const categoriesQuery = useQuery({
    queryKey: ['categories', 'price-list-import'],
    queryFn: () => categoriesService.getAll(),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  })

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'price-list-import'],
    queryFn: () => suppliersService.getAll({ page: 1, per_page: 100 }),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  })

  const brandsQuery = useQuery({
    queryKey: ['brands', 'price-list-import'],
    queryFn: () => brandsService.getAll({ page: 1, per_page: 100 }),
    enabled: isOpen,
    staleTime: 5 * 60_000,
  })

  const productsQuery = useQuery<PaginatedResponse<Product>>({
    queryKey: [
      'products',
      'price-list-import',
      debouncedSearch,
      filters.categoryId,
      filters.supplierId,
      filters.brandId,
      filters.onlyActive,
      filters.page,
    ],
    queryFn: () => productsService.getAll({
      page: filters.page,
      per_page: PAGE_SIZE,
      search: debouncedSearch || undefined,
      category_id: filters.categoryId || undefined,
      supplier_id: filters.supplierId || undefined,
      brand_id: filters.brandId || undefined,
      is_active: filters.onlyActive ? true : undefined,
      sort_by: 'description',
      sort_order: 'asc',
    }),
    enabled: isOpen,
  })

  const products = productsQuery.data?.items ?? []
  const pages = productsQuery.data?.pages ?? 1
  const total = productsQuery.data?.total ?? 0
  const selectableProducts = products.filter(
    (product) => !importedProductIds.has(product.id) && !importedProductCodes.has(product.code),
  )
  const selectedOnPage = selectableProducts.filter((product) => selectedProductIds.includes(product.id))
  const allSelectableOnPageSelected = selectableProducts.length > 0 && selectedOnPage.length === selectableProducts.length

  const categoryOptions = [
    { value: '', label: 'Todas las categorías' },
    ...(categoriesQuery.data ?? []).map((category) => ({ value: category.id, label: category.name })),
  ]
  const supplierOptions = [
    { value: '', label: 'Todos los proveedores' },
    ...(suppliersQuery.data?.items ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name })),
  ]
  const brandOptions = [
    { value: '', label: 'Todas las marcas' },
    ...(brandsQuery.data?.items ?? []).map((brand) => ({ value: brand.id, label: brand.name })),
  ]

  const setFilter = <K extends keyof ImportFilters>(key: K, value: ImportFilters[K]) => {
    if (key !== 'page') {
      setSelectedProductIds([])
    }
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === 'page' ? Number(value) : 1,
    }))
  }

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ))
  }

  const toggleCurrentPage = () => {
    const selectableIds = selectableProducts.map((product) => product.id)
    setSelectedProductIds((current) => {
      if (allSelectableOnPageSelected) {
        return current.filter((id) => !selectableIds.includes(id))
      }
      return Array.from(new Set([...current, ...selectableIds]))
    })
  }

  const handleConfirm = () => {
    if (selectedProductIds.length === 0) return
    onConfirm(selectedProductIds)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agregar productos a la lista"
      size="xl"
      containerClassName="flex max-h-[calc(100vh-2rem)] flex-col"
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-900 dark:bg-primary-900/20 dark:text-primary-100">
            <p className="font-medium">{listName}</p>
            <p className="mt-0.5 text-xs text-primary-700 dark:text-primary-200">
              Filtrá productos, revisá la vista previa y marcá explícitamente qué ítems importar.
            </p>
          </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Buscar
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={filters.search}
                onChange={(event) => setFilter('search', event.target.value)}
                placeholder="Código, código proveedor o descripción"
                className="pl-9"
                autoFocus
              />
            </div>
          </div>
          <Select
            label="Categoría"
            options={categoryOptions}
            value={filters.categoryId}
            onChange={(event) => setFilter('categoryId', event.target.value)}
          />
          <Select
            label="Proveedor"
            options={supplierOptions}
            value={filters.supplierId}
            onChange={(event) => setFilter('supplierId', event.target.value)}
          />
          <Select
            label="Marca"
            options={brandOptions}
            value={filters.brandId}
            onChange={(event) => setFilter('brandId', event.target.value)}
          />
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200 md:mt-6">
            <input
              type="checkbox"
              checked={filters.onlyActive}
              onChange={(event) => setFilter('onlyActive', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Solo productos activos
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>
            {total.toLocaleString('es-AR')} candidato(s) encontrados. {selectedProductIds.length.toLocaleString('es-AR')} seleccionado(s).
          </span>
          <button
            type="button"
            onClick={toggleCurrentPage}
            disabled={selectableProducts.length === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-primary-300 dark:hover:bg-primary-900/30"
          >
            {allSelectableOnPageSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {allSelectableOnPageSelected ? 'Quitar selección de esta página' : 'Seleccionar esta página'}
          </button>
        </div>

        <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {productsQuery.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <PackagePlus className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No hay productos para esos filtros.</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Probá con otra categoría, proveedor, marca o búsqueda.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Producto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Marca</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Precio venta</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {products.map((product) => {
                  const alreadyImported = importedProductIds.has(product.id) || importedProductCodes.has(product.code)
                  const checked = selectedProductIds.includes(product.id)
                  return (
                    <tr key={product.id} className={alreadyImported ? 'bg-gray-50 text-gray-400 dark:bg-gray-900/30 dark:text-gray-500' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={alreadyImported}
                          onChange={() => toggleProduct(product.id)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Seleccionar ${product.description}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{product.description}</p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {product.code}{product.supplier_code ? ` · Prov. ${product.supplier_code}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {product.brand_name || product.brand || '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-200">
                        {formatMoney(product.sale_price)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {alreadyImported ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">Ya está</span>
                        ) : product.is_active ? (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">Activo</span>
                        ) : (
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Inactivo</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        </div>

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('page', Math.max(1, filters.page - 1))}
              disabled={filters.page <= 1 || productsQuery.isFetching}
            >
              Anterior
            </Button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Página {filters.page} de {pages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilter('page', Math.min(pages, filters.page + 1))}
              disabled={filters.page >= pages || productsQuery.isFetching}
            >
              Siguiente
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} isLoading={isPending} disabled={selectedProductIds.length === 0}>
              Importar {selectedProductIds.length.toLocaleString('es-AR')} producto(s)
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
