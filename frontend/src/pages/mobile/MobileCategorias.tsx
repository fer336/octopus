/**
 * Native mobile "Categorías" screen. Self-fetching via
 * `categoriesService.getAll` directly (same raw useQuery shortcut as
 * `MobileCuenta`/`MobileComprobantes`, no dedicated hook file).
 *
 * Business logic and copy port desktop `Categories.tsx` byte-for-byte:
 *  - Fields: `name` (required), `description` (optional), `parent_id`
 *    (optional — marks the category as a subcategory of another).
 *  - Validation: empty name -> `toast.error('El nombre es obligatorio')`,
 *    same message and mechanism as desktop (no inline field error).
 *  - Success toasts mirror desktop's exact copy/options: "Categoría creada
 *    correctamente" / "Categoría actualizada correctamente" / "Categoría
 *    eliminada correctamente", each with `{ duration: 3000, icon: ... }`.
 *  - Delete is a REAL delete (`categoriesService.delete`, not a status
 *    toggle) with a simple confirm modal — no mandatory reason, unlike
 *    Comprobantes (vouchers are fiscally sensitive, categories aren't).
 *
 * Parent selector: when editing, the category being edited is excluded from
 * its own parent-selector options to prevent a category becoming its own
 * parent (mirrors desktop's same guard). A plain native `<select>` is used
 * (no custom picker sheet) — the option list is short and this matches
 * desktop's `<select>` for the same field.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit, Plus, Search, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import categoriesService, { type Category, type CategoryCreate } from '../../api/categoriesService'
import { formatErrorMessage } from '../../utils/errorHelpers'

// ─── Pure helpers (exported for direct unit testing) ──────────────────────

/**
 * Resolves a category's parent name by looking it up in the already-fetched
 * flat list. Returns `null` when there's no parent, or defensively when the
 * parent id doesn't match anything in the list (shouldn't normally happen).
 */
export function resolveParentCategoryName(
  categories: Category[],
  parentId: string | undefined
): string | null {
  if (!parentId) return null
  return categories.find((c) => c.id === parentId)?.name ?? null
}

/** Local, case-insensitive filter over the already-fetched category list. */
export function filterCategoriesByQuery(categories: Category[], query: string): Category[] {
  const q = query.trim().toLowerCase()
  if (!q) return categories
  return categories.filter((c) => c.name.toLowerCase().includes(q))
}

// ─── Main screen ────────────────────────────────────────────────────────────

const NO_PARENT_VALUE = ''

export default function MobileCategorias() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')

  const { data: categories, isLoading, isError, error } = useQuery({
    queryKey: ['mobile-categories'],
    queryFn: () => categoriesService.getAll(),
    retry: false,
  })

  const allCategories = categories ?? []
  const filteredCategories = useMemo(
    () => filterCategoriesByQuery(allCategories, query),
    [allCategories, query]
  )

  // Create/edit sheet
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState<string>(NO_PARENT_VALUE)

  const parentOptions = useMemo(
    () => allCategories.filter((c) => c.id !== editingCategory?.id),
    [allCategories, editingCategory]
  )

  const openCreateSheet = () => {
    setEditingCategory(null)
    setName('')
    setDescription('')
    setParentId(NO_PARENT_VALUE)
    setSheetOpen(true)
  }

  const openEditSheet = (category: Category) => {
    setEditingCategory(category)
    setName(category.name)
    setDescription(category.description ?? '')
    setParentId(category.parent_id ?? NO_PARENT_VALUE)
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setEditingCategory(null)
  }

  const createMutation = useMutation({
    mutationFn: (data: CategoryCreate) => categoriesService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-categories'] })
      toast.success('Categoría creada correctamente', { duration: 3000, icon: '✅' })
      closeSheet()
    },
    onError: (mutationError) => {
      toast.error(formatErrorMessage(mutationError))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CategoryCreate }) =>
      categoriesService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-categories'] })
      toast.success('Categoría actualizada correctamente', { duration: 3000, icon: '✅' })
      closeSheet()
    },
    onError: (mutationError) => {
      toast.error(formatErrorMessage(mutationError))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const payload: CategoryCreate = {
      name: name.trim(),
      description: description.trim() || undefined,
      parent_id: parentId || undefined,
    }
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  // Delete confirm modal — simple confirm, no reason (categories aren't
  // fiscally sensitive like vouchers).
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

  const closeDeleteModal = () => setDeleteTarget(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-categories'] })
      toast.success('Categoría eliminada correctamente', { duration: 3000, icon: '🗑️' })
      closeDeleteModal()
    },
    onError: (mutationError) => {
      toast.error(formatErrorMessage(mutationError))
    },
  })

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center px-7 py-14 text-center">
        <p className="max-w-[260px] text-sm leading-relaxed text-[#7b6b95]">
          No pudimos cargar las categorías.
        </p>
        <p role="alert" className="mt-2 text-[10.5px] font-semibold text-[#c0392b]">
          {formatErrorMessage(error)}
        </p>
      </div>
    )
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="px-4 pb-[110px] pt-4">
      {/* Búsqueda de categoría */}
      <div className="flex h-[46px] items-center gap-2 rounded-[13px] border border-[#ece6f6] bg-white px-3">
        <Search size={18} color="#9089a0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar categoría"
          aria-label="Buscar categoría"
          className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
        />
      </div>

      {/* Nueva categoría */}
      <button
        type="button"
        onClick={openCreateSheet}
        className="mt-3 flex h-[46px] w-full items-center justify-center gap-2 rounded-[13px] text-sm font-bold text-white"
        style={{ background: '#7c5ca8' }}
      >
        <Plus size={18} />
        Nueva categoría
      </button>

      {/* Lista de categorías */}
      <div className="mt-3 flex flex-col gap-[9px]">
        {filteredCategories.length === 0 ? (
          <div className="rounded-[15px] border border-dashed border-[#d9caeb] bg-white p-[24px_18px] text-center text-[#9089a0]">
            <p className="text-[11.5px]">No hay categorías para mostrar.</p>
          </div>
        ) : (
          filteredCategories.map((category) => {
            const parentName = resolveParentCategoryName(allCategories, category.parent_id)
            return (
              <div
                key={category.id}
                data-testid="categoria-card"
                className="flex items-center gap-3 rounded-[15px] border border-[#ece6f6] bg-white p-[13px_14px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#121325]">{category.name}</p>
                  {parentName && (
                    <p className="text-[11.5px] text-[#9089a0]">Subcategoría de: {parentName}</p>
                  )}
                </div>
                <div className="flex flex-none items-center gap-[7px]">
                  <button
                    type="button"
                    onClick={() => openEditSheet(category)}
                    aria-label={`Editar categoría ${category.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-[9px]"
                    style={{ background: '#ece6f6' }}
                  >
                    <Edit size={14} color="#7c5ca8" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(category)}
                    aria-label={`Eliminar categoría ${category.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-[9px]"
                    style={{ background: '#fdecea' }}
                  >
                    <Trash2 size={14} color="#c0392b" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Sheet de creación/edición */}
      {sheetOpen && (
        <div
          role="dialog"
          aria-label={editingCategory ? 'Editar categoría' : 'Nueva categoría'}
          className="fixed inset-x-0 bottom-0 z-[400] flex max-h-[78%] flex-col overflow-hidden rounded-t-[26px] bg-white"
        >
          <div className="flex items-center gap-[10px] px-[18px] pb-3 pt-4" style={{ background: '#f7f4fb' }}>
            <p className="flex-1 text-base font-extrabold text-[#121325]">
              {editingCategory ? 'Editar categoría' : 'Nueva categoría'}
            </p>
            <button
              type="button"
              onClick={closeSheet}
              aria-label="Cerrar formulario de categoría"
              className="flex h-8 w-8 items-center justify-center rounded-[9px]"
              style={{ background: '#ece6f6' }}
            >
              <X size={16} color="#5b5570" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-[18px] py-4">
            <label htmlFor="mobile-category-name" className="block text-[11px] font-semibold text-[#5b5570]">
              Nombre *
            </label>
            <input
              id="mobile-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Grifería, Herramientas..."
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-category-description" className="mt-4 block text-[11px] font-semibold text-[#5b5570]">
              Descripción
            </label>
            <input
              id="mobile-category-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descripción de la categoría"
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-category-parent" className="mt-4 block text-[11px] font-semibold text-[#5b5570]">
              Categoría padre
            </label>
            <select
              id="mobile-category-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            >
              <option value={NO_PARENT_VALUE}>Sin categoría padre</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={isSaving}
              className="mt-6 h-[46px] w-full rounded-[13px] text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: '#7c5ca8' }}
            >
              {isSaving ? 'Guardando...' : 'Guardar categoría'}
            </button>
          </form>
        </div>
      )}

      {/* Modal de confirmación de eliminación — sin motivo, a diferencia de
          Comprobantes (categorías no son fiscalmente sensibles). */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-label="Eliminar categoría"
          className="fixed inset-0 z-[410] flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div className="w-full max-w-[380px] rounded-t-[20px] bg-white p-5 sm:rounded-[20px]">
            <p className="text-base font-extrabold text-[#121325]">¿Estás seguro?</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#7b6b95]">
              Vas a eliminar la categoría <strong>{deleteTarget.name}</strong>.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="flex-1 rounded-[11px] border border-[#ece6f6] py-[11px] text-[12.5px] font-bold text-[#5b5570]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-[11px] bg-[#c0392b] py-[11px] text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
