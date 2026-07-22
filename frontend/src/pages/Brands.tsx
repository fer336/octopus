import { useState } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Tags,
  Package,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { Button, Modal, Input, ResponsiveTable, Table } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import brandsService, {
  type Brand,
  type BrandCreate,
  type BrandUpdate,
  type BrandProductItem,
} from '../api/brandsService'
import toast from 'react-hot-toast'
import BulkDeleteBrandModal from '../components/brands/BulkDeleteBrandModal'

export default function Brands() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showBrandModal, setShowBrandModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<Brand>>({ name: '' })
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null)
  const [productsBrand, setProductsBrand] = useState<Brand | null>(null)
  const [productsPage, setProductsPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsService.getAll({ per_page: 100 }),
    retry: false,
  })

  const productsQuery = useQuery({
    queryKey: ['brands', productsBrand?.id, 'products', productsPage],
    queryFn: () =>
      brandsService.getProducts(productsBrand!.id, {
        page: productsPage,
        per_page: 50,
      }),
    enabled: !!productsBrand,
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: (payload: BrandCreate) => brandsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      toast.success('Marca creada correctamente', { duration: 3000 })
      setShowBrandModal(false)
      resetForm()
    },
    onError: (mutationError: unknown) =>
      toast.error(formatErrorMessage(mutationError)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BrandUpdate }) =>
      brandsService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Marca actualizada correctamente', { duration: 3000 })
      setShowBrandModal(false)
      resetForm()
    },
    onError: (mutationError: unknown) =>
      toast.error(formatErrorMessage(mutationError)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => brandsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      toast.success('Marca eliminada correctamente', { duration: 3000 })
      setShowDeleteConfirm(false)
      setBrandToDelete(null)
    },
    onError: (mutationError: unknown) => {
      toast.error(formatErrorMessage(mutationError))
      setShowDeleteConfirm(false)
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => brandsService.bulkDelete(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      setSelectedIds(new Set())
      setShowBulkDeleteConfirm(false)

      const notFoundSuffix = result.not_found > 0
        ? ` (${result.not_found} no se encontraron o ya no estaban disponibles)`
        : ''
      toast.success(`Se eliminaron ${result.deleted} marca${result.deleted === 1 ? '' : 's'}${notFoundSuffix}`, {
        duration: 4000,
        icon: '🗑️',
      })
    },
    onError: (mutationError: unknown) => {
      toast.error(formatErrorMessage(mutationError))
      setShowBulkDeleteConfirm(false)
    },
  })

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setFormData({ name: '' })
  }

  const handleOpenBrandModal = (brand?: Brand) => {
    if (brand) {
      setIsEditing(true)
      setEditingId(brand.id)
      setFormData(brand)
    } else {
      resetForm()
    }
    setShowBrandModal(true)
  }

  const handleDeleteClick = (brand: Brand) => {
    setBrandToDelete(brand)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    if (!brandToDelete) return
    deleteMutation.mutate(brandToDelete.id)
  }

  const toggleSelectBrand = (brandId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(brandId) ? next.delete(brandId) : next.add(brandId)
      return next
    })
  }

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.size === 0) return
    await bulkDeleteMutation.mutateAsync(Array.from(selectedIds))
  }

  const handleShowProducts = (brand: Brand) => {
    setProductsBrand(brand)
    setProductsPage(1)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const name = formData.name?.trim()
    if (!name) {
      toast.error('El nombre es obligatorio')
      return
    }
    const payload = { name }
    if (isEditing && editingId) {
      updateMutation.mutate({ id: editingId, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const brands = data?.items ?? []
  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(search.toLowerCase()),
  )

  const visibleBrandIds = filteredBrands.map((brand) => brand.id)
  const allVisibleSelected = visibleBrandIds.length > 0 && visibleBrandIds.every((id) => selectedIds.has(id))

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set())
      return
    }

    setSelectedIds(new Set(visibleBrandIds))
  }

  const columns = [
    {
      key: 'selection',
      header: (
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={toggleSelectAllVisible}
          disabled={visibleBrandIds.length === 0}
          className="h-4 w-4 cursor-pointer rounded accent-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Seleccionar todas las marcas visibles"
        />
      ),
      className: 'w-10',
      render: (brand: Brand) => (
        <input
          type="checkbox"
          checked={selectedIds.has(brand.id)}
          onChange={() => toggleSelectBrand(brand.id)}
          className="h-4 w-4 cursor-pointer rounded accent-primary-600"
          aria-label={`Seleccionar marca ${brand.name}`}
        />
      ),
    },
    {
      key: 'name',
      header: 'Marca',
      render: (brand: Brand) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 flex items-center justify-center">
            <Tags size={13} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-white truncate">{brand.name}</div>
            <div className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate">{brand.normalized_name}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'products',
      header: 'Productos',
      render: (brand: Brand) => (
        <button
          type="button"
          onClick={() => handleShowProducts(brand)}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300"
        >
          <Package size={12} />
          {brand.product_count}
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (brand: Brand) => (
        <div className="flex gap-2 justify-end">
          <button
            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
            onClick={() => handleOpenBrandModal(brand)}
            title="Editar"
          >
            <Edit2 size={18} />
          </button>
          <button
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            onClick={() => handleDeleteClick(brand)}
            disabled={deleteMutation.isPending}
            title="Eliminar"
          >
            <Trash2 size={18} />
          </button>
        </div>
      ),
    },
  ]

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader onNew={() => handleOpenBrandModal()} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
            />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader onNew={() => handleOpenBrandModal()} />
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-100 bg-red-50 px-6 py-16 text-center dark:border-red-900/30 dark:bg-red-900/10">
          <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/30">
            <Tags className="h-7 w-7 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
              No se pudieron cargar las marcas
            </p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {formatErrorMessage(error)}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm transition hover:bg-red-50 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            <RefreshCw size={12} />
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <PageHeader
        count={brands.length}
        onNew={() => handleOpenBrandModal()}
        selectedCount={selectedIds.size}
        isDeleting={bulkDeleteMutation.isPending}
        onBulkDelete={() => setShowBulkDeleteConfirm(true)}
      />

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setSelectedIds(new Set())
            }}
            placeholder="Buscar marcas..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Tabla desktop + cards mobile */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ResponsiveTable
          data={filteredBrands}
          emptyState={
            <EmptyState
              isFiltered={!!search}
              onNew={() => handleOpenBrandModal()}
              onClear={() => setSearch('')}
            />
          }
          renderDesktop={() => (
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <Table columns={columns} data={filteredBrands} emptyMessage="No se encontraron marcas." density="compact" />
            </div>
          )}
          renderCard={(brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              selected={selectedIds.has(brand.id)}
              onSelect={() => toggleSelectBrand(brand.id)}
              onEdit={() => handleOpenBrandModal(brand)}
              onDelete={() => handleDeleteClick(brand)}
              onViewProducts={() => handleShowProducts(brand)}
            />
          )}
        />
      </div>

      {/* Create / Edit modal */}
      <Modal
        isOpen={showBrandModal}
        onClose={() => {
          setShowBrandModal(false)
          resetForm()
        }}
        title={isEditing ? 'Editar marca' : 'Nueva marca'}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nombre <span className="text-red-500">*</span>
            </label>
            <Input
              value={formData.name || ''}
              onChange={(event) =>
                setFormData({ ...formData, name: event.target.value })
              }
              placeholder="Ej: FV, Ferrum, Peirano..."
              required
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Se normalizará automáticamente para evitar duplicados.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-5 dark:border-gray-700">
            <Button
              variant="outline"
              onClick={() => {
                setShowBrandModal(false)
                resetForm()
              }}
              type="button"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Guardando...'
                : isEditing
                  ? 'Guardar cambios'
                  : 'Crear marca'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setBrandToDelete(null)
        }}
        title="Eliminar marca"
      >
        <div className="space-y-4">
          {brandToDelete && brandToDelete.product_count > 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  No se puede eliminar esta marca
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  <strong>"{brandToDelete.name}"</strong> tiene{' '}
                  <strong>{brandToDelete.product_count}</strong> producto
                  {brandToDelete.product_count !== 1 ? 's' : ''} asociado
                  {brandToDelete.product_count !== 1 ? 's' : ''}.
                  Reasigná los productos antes de eliminarla.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
              <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div>
                <p className="text-sm text-red-700 dark:text-red-300">
                  ¿Eliminar <strong>"{brandToDelete?.name}"</strong>?
                </p>
                <p className="mt-0.5 text-xs text-red-500 dark:text-red-400">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false)
                setBrandToDelete(null)
              }}
              type="button"
            >
              {brandToDelete && brandToDelete.product_count > 0 ? 'Entendido' : 'Cancelar'}
            </Button>
            {(!brandToDelete || brandToDelete.product_count === 0) && (
              <Button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Products modal */}
      <Modal
        isOpen={!!productsBrand}
        onClose={() => setProductsBrand(null)}
        title={`Productos — ${productsBrand?.name ?? ''}`}
        size="lg"
      >
        {productsBrand && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <Package size={14} />
                {productsQuery.data?.total ?? '...'} producto
                {(productsQuery.data?.total ?? 0) !== 1 ? 's' : ''} asociado
                {(productsQuery.data?.total ?? 0) !== 1 ? 's' : ''}
              </span>
              {productsQuery.data && productsQuery.data.pages > 1 && (
                <div className="flex items-center gap-1">
                  {Array.from({ length: productsQuery.data.pages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProductsPage(p)}
                      className={`flex h-6 w-6 items-center justify-center rounded text-xs font-medium transition ${
                        p === productsPage
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-600'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {productsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700" />
                ))}
              </div>
            ) : productsQuery.data?.items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center dark:border-gray-600">
                <Package className="mx-auto mb-2 h-6 w-6 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Sin productos asociados a esta marca.
                </p>
              </div>
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {productsQuery.data?.items.map((product) => (
                  <ProductRow key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <BulkDeleteBrandModal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleConfirmBulkDelete}
        count={selectedIds.size}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageHeader({
  count,
  onNew,
  selectedCount,
  isDeleting,
  onBulkDelete,
}: {
  count?: number
  onNew: () => void
  selectedCount?: number
  isDeleting?: boolean
  onBulkDelete?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary-50 to-primary-50 dark:from-primary-900/20 dark:to-primary-900/20 px-3 py-2.5 rounded-lg border border-primary-200 dark:border-primary-800">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-primary-900 dark:text-primary-100 flex items-center gap-2 leading-none">
          <Tags className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          Marcas
        </h1>
        {count !== undefined && (
          <p className="text-xs text-primary-700 dark:text-primary-300 mt-1 truncate">
            {count} marca{count !== 1 ? 's' : ''} registrada{count !== 1 ? 's' : ''}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {selectedCount ? (
          <Button
            onClick={onBulkDelete}
            disabled={isDeleting}
            className="border-none bg-red-600 text-white shadow-md hover:bg-red-700"
          >
            <Trash2 size={18} className="mr-2" />
            Eliminar {selectedCount} seleccionada{selectedCount === 1 ? '' : 's'}
          </Button>
        ) : null}
        <Button onClick={onNew} className="bg-primary-600 hover:bg-primary-700 text-white border-none shadow-md">
          <Plus size={18} className="mr-2" />
          Nueva marca
        </Button>
      </div>
    </div>
  )
}

function EmptyState({
  isFiltered,
  onNew,
  onClear,
}: {
  isFiltered: boolean
  onNew: () => void
  onClear: () => void
}) {
  if (isFiltered) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center dark:border-gray-700 dark:bg-gray-800/50">
        <Search className="h-8 w-8 text-gray-300 dark:text-gray-600" />
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Sin coincidencias
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            No hay marcas que coincidan con la búsqueda.
          </p>
        </div>
        <button
          onClick={onClear}
          className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          Limpiar búsqueda
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800/50">
      <div className="rounded-full bg-primary-50 p-4 dark:bg-primary-900/20">
        <Tags className="h-8 w-8 text-primary-600 dark:text-primary-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          No hay marcas registradas
        </p>
        <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
          Organizá tus productos por marca para filtrar más rápido y mantener el catálogo ordenado.
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus size={14} className="mr-1.5" />
        Crear primera marca
      </Button>
    </div>
  )
}

function BrandCard({
  brand,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onViewProducts,
}: {
  brand: Brand
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onViewProducts: () => void
}) {
  return (
    <article className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded accent-primary-600"
          aria-label={`Seleccionar marca ${brand.name}`}
        />
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
            <Tags size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {brand.name}
            </h3>
            <p className="truncate font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {brand.normalized_name}
            </p>
          </div>
        </div>

        {/* Action buttons — always visible, not hover-only */}
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            onClick={onEdit}
            title="Editar marca"
          >
            <Edit2 size={13} />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
            onClick={onDelete}
            title="Eliminar marca"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onViewProducts}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs transition-colors hover:border-primary-100 hover:bg-primary-50 dark:border-gray-700 dark:bg-gray-700/50 dark:hover:border-primary-800/60 dark:hover:bg-primary-900/20"
      >
        <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Package size={13} />
          Productos
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              brand.product_count > 0
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {brand.product_count}
          </span>
          <ChevronRight size={11} className="text-gray-300 dark:text-gray-600" />
        </div>
      </button>
    </article>
  )
}

function ProductRow({ product }: { product: BrandProductItem }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs dark:border-gray-700 ${
        !product.is_active ? 'opacity-60' : 'bg-white dark:bg-gray-800'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
            product.is_active
              ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {product.code}
        </span>
        <span className="truncate text-gray-700 dark:text-gray-300">{product.description}</span>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-3">
        <span className="font-medium text-gray-900 dark:text-white">
          ${Number(product.sale_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </span>
        <span
          className={`text-nowrap ${
            product.current_stock <= 0
              ? 'text-red-500'
              : product.current_stock <= 5
                ? 'text-amber-500'
                : 'text-gray-400'
          }`}
        >
          Stock: {product.current_stock}
        </span>
      </div>
    </div>
  )
}
