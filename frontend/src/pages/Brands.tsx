/**
 * Página de Marcas.
 * CRUD completo con diseño mejorado: cards, contador de productos,
 * vista de productos asociados y confirmación de borrado.
 */
import { useState } from 'react'
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Tags,
  Inbox,
  Package,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react'
import { Button, Modal, Input } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import brandsService, {
  Brand,
  BrandCreate,
  BrandUpdate,
  BrandProductItem,
} from '../api/brandsService'
import toast from 'react-hot-toast'

export default function Brands() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showBrandModal, setShowBrandModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<Brand>>({ name: '' })
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null)

  // ── Products panel ──────────────────────────────────────────────────
  const [productsBrand, setProductsBrand] = useState<Brand | null>(null)
  const [productsPage, setProductsPage] = useState(1)

  // ── Queries ──────────────────────────────────────────────────────────

  const { data, isLoading, error } = useQuery({
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

  // ── Mutations ────────────────────────────────────────────────────────

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

  // ── Handlers ─────────────────────────────────────────────────────────

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

  // ── Derived state ────────────────────────────────────────────────────

  const brands = data?.items ?? []
  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(search.toLowerCase()),
  )

  // ── Loading ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 rounded-full bg-red-50 p-4 dark:bg-red-900/20">
          <Tags className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
          Error de Conexión
        </h2>
        <p className="max-w-md text-gray-500 dark:text-gray-400">
          No pudimos cargar las marcas. Intentá nuevamente más tarde.
        </p>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-gradient-to-r from-primary-50 to-white px-4 py-3 shadow-sm dark:border-primary-800 dark:from-primary-900/30 dark:to-gray-800">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold leading-none text-gray-900 dark:text-white">
            <Tags className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Marcas
          </h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {brands.length} marca{brands.length !== 1 ? 's' : ''} registrada{brands.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          onClick={() => handleOpenBrandModal()}
          className="border-none bg-primary-600 text-white shadow-md hover:bg-primary-700"
        >
          <Plus size={18} className="mr-2" />
          Nueva Marca
        </Button>
      </div>

      {/* ── Search ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar marcas..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 transition focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:ring-gray-600"
          />
        </div>
      </div>

      {/* ── Brand grid ──────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {filteredBrands.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-4 py-12 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="text-center">
              <Inbox className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {search ? 'No hay marcas que coincidan' : 'No hay marcas registradas'}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {search
                  ? 'Probá con otro término de búsqueda.'
                  : 'Agregá tu primera marca para empezar a categorizar productos.'}
              </p>
              {!search && (
                <Button
                  onClick={() => handleOpenBrandModal()}
                  variant="outline"
                  className="mt-4"
                >
                  <Plus size={16} className="mr-1.5" />
                  Crear Marca
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBrands.map((brand) => (
              <article
                key={brand.id}
                className="group relative flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-primary-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-primary-700"
              >
                {/* Brand name + icon */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
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

                  {/* Action buttons */}
                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                      onClick={() => handleOpenBrandModal(brand)}
                      title="Editar"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                      onClick={() => handleDeleteClick(brand)}
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Product count — clickable */}
                <button
                  type="button"
                  onClick={() => handleShowProducts(brand)}
                  className="mt-3 flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs transition-colors hover:border-primary-100 hover:bg-primary-50 dark:border-gray-700 dark:bg-gray-700/50 dark:hover:border-primary-800 dark:hover:bg-primary-900/20"
                >
                  <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                    <Package size={14} />
                    Productos asociados
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        brand.product_count > 0
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {brand.product_count}
                    </span>
                    <ChevronRight
                      size={12}
                      className="text-gray-300 dark:text-gray-600"
                    />
                  </span>
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CREATE / EDIT MODAL                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={showBrandModal}
        onClose={() => {
          setShowBrandModal(false)
          resetForm()
        }}
        title={isEditing ? 'Editar Marca' : 'Nueva Marca'}
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
                  ? 'Actualizar Marca'
                  : 'Crear Marca'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* DELETE CONFIRMATION MODAL                                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setBrandToDelete(null)
        }}
        title="Eliminar Marca"
      >
        <div className="space-y-4">
          {brandToDelete && brandToDelete.product_count > 0 ? (
            // ⚠️ Has products — warn and block
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    No se puede eliminar esta marca
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    La marca <strong>"{brandToDelete.name}"</strong> tiene{' '}
                    <strong>{brandToDelete.product_count}</strong> producto
                    {brandToDelete.product_count !== 1 ? 's' : ''} asociado
                    {brandToDelete.product_count !== 1 ? 's' : ''}.
                    Reasigná los productos a otra marca antes de eliminarla.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // ✅ Safe to delete
            <div className="rounded-lg border border-red-100 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-start gap-3">
                <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    ¿Estás seguro de eliminar la marca{' '}
                    <strong>"{brandToDelete?.name}"</strong>?
                  </p>
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    Esta acción no se puede deshacer.
                  </p>
                </div>
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
              {brandToDelete && brandToDelete.product_count > 0
                ? 'Entendido'
                : 'Cancelar'}
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

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PRODUCTS MODAL                                                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!productsBrand}
        onClose={() => setProductsBrand(null)}
        title={`Productos — ${productsBrand?.name ?? ''}`}
        size="lg"
      >
        {productsBrand && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <Package size={14} />
                {productsQuery.data?.total ?? '...'} producto
                {(productsQuery.data?.total ?? 0) !== 1 ? 's' : ''} asociado
                {(productsQuery.data?.total ?? 0) !== 1 ? 's' : ''}
              </span>

              {/* Pagination */}
              {productsQuery.data &&
                productsQuery.data.pages > 1 && (
                  <div className="flex items-center gap-1">
                    {Array.from(
                      { length: productsQuery.data.pages },
                      (_, i) => i + 1,
                    ).map((p) => (
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

            {/* Product list */}
            {productsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary-600" />
              </div>
            ) : productsQuery.data?.items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400 dark:border-gray-600">
                <Inbox className="mx-auto mb-2 h-6 w-6 text-gray-300 dark:text-gray-600" />
                <p>Esta marca no tiene productos asociados.</p>
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
    </div>
  )
}

/**
 * Fila de producto dentro del modal de productos de una marca.
 */
function ProductRow({ product }: { product: BrandProductItem }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className={`rounded-lg border bg-white text-xs transition-colors dark:border-gray-700 dark:bg-gray-800 ${
        !product.is_active ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
              product.is_active
                ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            }`}
          >
            {product.code}
          </span>
          <span className="truncate text-gray-700 dark:text-gray-300">
            {product.description}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="font-medium text-gray-900 dark:text-white">
            ${Number(product.sale_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
          <span
            className={`text-nowrap text-[11px] ${
              product.current_stock <= 0
                ? 'text-red-500'
                : product.current_stock <= 5
                  ? 'text-amber-500'
                  : 'text-gray-500'
            }`}
          >
            Stock: {product.current_stock}
          </span>
          <ChevronRight
            size={14}
            className={`text-gray-300 transition-transform dark:text-gray-600 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>
    </div>
  )
}
