/**
 * Native mobile "Proveedores" screen (PR7). Self-fetching via
 * `suppliersService.getAll` directly (same raw useQuery shortcut as
 * `MobileCuenta`/`MobileComprobantes`, no dedicated hook file) — full CRUD
 * this time, not read-only.
 *
 * Search is SERVER-SIDE (the backend already supports `?search=`), unlike
 * `MobileCuenta`'s local in-memory filter over a single `has_balance` fetch.
 * It's DEBOUNCED (300ms, same `DEBOUNCE_MS` value as `ClientPickerSheet`)
 * rather than firing on every keystroke like `MobileProducts.tsx`'s search —
 * that screen documents its own choice NOT to debounce; here we deliberately
 * pick the opposite, since a supplier list is typically small/infrequently
 * searched and there's no reason to spam the backend on every keystroke.
 * Both are established, defensible patterns in this codebase.
 *
 * DELIBERATE V1 SCOPE REDUCTION (authorized): desktop's `Suppliers.tsx` form
 * also includes `default_discount_1/2/3` (purchase-discount tiers) and
 * `category_ids` (multi-select linking the supplier to the product
 * categories they supply). Both are OPTIONAL on the backend
 * (`SupplierCreate`/`SupplierUpdate` make them optional), so this mobile V1
 * OMITS them entirely from the create/edit form — only the core contact
 * fields are exposed (`name` required, everything else optional). This is a
 * feature-completeness reduction, not a data-correctness one: omitted
 * optional fields are simply not sent, and the backend's own defaults apply.
 * Mirrors how `MobileSales.tsx` documents its own authorized Acopio
 * mini-form simplification.
 *
 * The create/edit sheet reuses `ClientPickerSheet`'s full-height
 * bottom-sheet shell (header with title + close button, scrollable body) —
 * a tall sheet fits this multi-field form better than a small centered
 * modal. The delete confirmation reuses `MobileComprobantes`' centered/
 * bottom modal shell, but WITHOUT a mandatory reason field: suppliers aren't
 * fiscally sensitive like vouchers, so a plain "¿Estás seguro?" confirm is
 * enough (matches desktop's `handleDelete`/`handleConfirmDelete`,
 * Suppliers.tsx ~156-166, which also has no reason input).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import suppliersService, { type Supplier, type SupplierCreate, type SupplierUpdate } from '../../api/suppliersService'
import toast from 'react-hot-toast'
import { formatErrorMessage } from '../../utils/errorHelpers'

// ─── Pure helpers (exported for direct unit testing) ──────────────────────

/** Core contact fields exposed on this V1 form — see header comment for the omitted-fields rationale. */
export interface SupplierFormState {
  name: string
  cuit: string
  phone: string
  email: string
  contact_name: string
  address: string
  city: string
  province: string
  notes: string
}

export const EMPTY_SUPPLIER_FORM: SupplierFormState = {
  name: '',
  cuit: '',
  phone: '',
  email: '',
  contact_name: '',
  address: '',
  city: '',
  province: '',
  notes: '',
}

/** Pre-fills the form from an existing supplier, falling back to '' for any unset optional field. */
export function supplierToFormState(supplier: Supplier): SupplierFormState {
  return {
    name: supplier.name,
    cuit: supplier.cuit ?? '',
    phone: supplier.phone ?? '',
    email: supplier.email ?? '',
    contact_name: supplier.contact_name ?? '',
    address: supplier.address ?? '',
    city: supplier.city ?? '',
    province: supplier.province ?? '',
    notes: supplier.notes ?? '',
  }
}

const OPTIONAL_FIELDS: (keyof Omit<SupplierFormState, 'name'>)[] = [
  'cuit',
  'phone',
  'email',
  'contact_name',
  'address',
  'city',
  'province',
  'notes',
]

/**
 * Trims every field and only includes optional ones that ended up non-empty
 * — `default_discount_1/2/3`/`category_ids` never appear here at all (see
 * the deliberate V1 scope-reduction note above).
 */
export function buildSupplierPayload(form: SupplierFormState): SupplierCreate {
  const payload: SupplierCreate = { name: form.name.trim() }
  for (const field of OPTIONAL_FIELDS) {
    const trimmed = form[field].trim()
    if (trimmed) payload[field] = trimmed
  }
  return payload
}

/** Joins whichever of phone/contact_name are present with " · ", omitting empty ones. Returns '' if neither is set. */
export function formatSupplierContactLine(supplier: Supplier): string {
  return [supplier.phone, supplier.contact_name].filter(Boolean).join(' · ')
}

const DEBOUNCE_MS = 300

// ─── Main screen ────────────────────────────────────────────────────────────

export default function MobileProveedores() {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(search), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mobile-suppliers', searchQuery],
    queryFn: () => suppliersService.getAll({ search: searchQuery || undefined, per_page: 50 }),
    retry: false,
  })

  const suppliers = data?.items ?? []

  // Create/edit sheet
  const [formOpen, setFormOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierFormState>(EMPTY_SUPPLIER_FORM)

  const openCreateForm = () => {
    setEditingSupplier(null)
    setForm(EMPTY_SUPPLIER_FORM)
    setFormOpen(true)
  }

  const openEditForm = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setForm(supplierToFormState(supplier))
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingSupplier(null)
    setForm(EMPTY_SUPPLIER_FORM)
  }

  const setField = (field: keyof SupplierFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const createMutation = useMutation({
    mutationFn: (payload: SupplierCreate) => suppliersService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-suppliers'] })
      toast.success('Proveedor creado', { icon: '✅' })
      closeForm()
    },
    onError: (createError) => toast.error(formatErrorMessage(createError)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SupplierUpdate }) => suppliersService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-suppliers'] })
      toast.success('Proveedor actualizado', { icon: '✅' })
      closeForm()
    },
    onError: (updateError) => toast.error(formatErrorMessage(updateError)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const payload = buildSupplierPayload(form)
    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  // Delete flow — simple confirm, NO mandatory reason (suppliers aren't
  // fiscally sensitive like vouchers), mirrors desktop's
  // `handleDelete`/`handleConfirmDelete` (Suppliers.tsx ~156-166).
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => suppliersService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-suppliers'] })
      toast.success('Proveedor eliminado', { icon: '✅' })
      setDeleteTarget(null)
    },
    onError: (deleteError) => toast.error(formatErrorMessage(deleteError)),
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
          No pudimos cargar los proveedores.
        </p>
        <p role="alert" className="mt-2 text-[10.5px] font-semibold text-[#c0392b]">
          {formatErrorMessage(error)}
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-[110px] pt-4">
      {/* Búsqueda + nuevo proveedor */}
      <div className="flex gap-[9px]">
        <div className="flex h-[46px] flex-1 items-center gap-2 rounded-[13px] border border-[#ece6f6] bg-white px-3">
          <Search size={18} color="#9089a0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar proveedor"
            aria-label="Buscar proveedor"
            className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          aria-label="Nuevo proveedor"
          className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px]"
          style={{ background: 'linear-gradient(140deg,#5c3a8c,#7c5ca8)', boxShadow: '0 6px 14px rgba(92,58,140,.35)' }}
        >
          <Plus size={22} color="#fff" />
        </button>
      </div>

      {/* Lista de proveedores */}
      <div className="mt-3 flex flex-col gap-[9px]">
        {suppliers.length === 0 ? (
          <div className="rounded-[15px] border border-dashed border-[#d9caeb] bg-white p-[24px_18px] text-center text-[#9089a0]">
            <p className="text-[11.5px]">No hay proveedores para mostrar.</p>
          </div>
        ) : (
          suppliers.map((supplier) => {
            const contactLine = formatSupplierContactLine(supplier)
            return (
              <div
                key={supplier.id}
                data-testid="supplier-card"
                className="flex flex-col gap-1.5 rounded-[15px] border border-[#ece6f6] bg-white p-[13px_14px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#121325]">{supplier.name}</p>
                    {supplier.cuit && (
                      <p className="text-[11.5px] text-[#9089a0]">CUIT: {supplier.cuit}</p>
                    )}
                    {contactLine && <p className="text-[11.5px] text-[#9089a0]">{contactLine}</p>}
                  </div>
                </div>

                {/* Acciones */}
                <div className="mt-1 flex items-center gap-[7px] border-t border-[#ece6f6] pt-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(supplier)}
                    aria-label={`Editar proveedor ${supplier.name}`}
                    className="flex h-7 w-7 items-center justify-center rounded-[9px]"
                    style={{ background: '#ece6f6' }}
                  >
                    <Pencil size={14} color="#7c5ca8" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(supplier)}
                    aria-label={`Eliminar proveedor ${supplier.name}`}
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

      {/* Sheet de creación/edición — shell reutilizado de ClientPickerSheet */}
      {formOpen && (
        <div
          role="dialog"
          aria-label={editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}
          className="fixed inset-x-0 bottom-0 z-[400] flex max-h-[85%] flex-col overflow-hidden rounded-t-[26px] bg-white"
        >
          <div className="flex items-center gap-[10px] px-[18px] pb-3 pt-4" style={{ background: '#f7f4fb' }}>
            <p className="flex-1 text-base font-extrabold text-[#121325]">
              {editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}
            </p>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Cerrar formulario de proveedor"
              className="flex h-8 w-8 items-center justify-center rounded-[9px]"
              style={{ background: '#ece6f6' }}
            >
              <X size={16} color="#5b5570" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-[18px] py-3">
            <label htmlFor="mobile-proveedor-name" className="block text-[11px] font-semibold text-[#5b5570]">
              Nombre *
            </label>
            <input
              id="mobile-proveedor-name"
              value={form.name}
              onChange={setField('name')}
              placeholder="Razón social"
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-proveedor-cuit" className="mt-3 block text-[11px] font-semibold text-[#5b5570]">
              CUIT
            </label>
            <input
              id="mobile-proveedor-cuit"
              value={form.cuit}
              onChange={setField('cuit')}
              placeholder="30-..."
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-proveedor-phone" className="mt-3 block text-[11px] font-semibold text-[#5b5570]">
              Teléfono
            </label>
            <input
              id="mobile-proveedor-phone"
              value={form.phone}
              onChange={setField('phone')}
              placeholder="Teléfono"
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-proveedor-email" className="mt-3 block text-[11px] font-semibold text-[#5b5570]">
              Email
            </label>
            <input
              id="mobile-proveedor-email"
              type="email"
              value={form.email}
              onChange={setField('email')}
              placeholder="email@ejemplo.com"
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-proveedor-contact-name" className="mt-3 block text-[11px] font-semibold text-[#5b5570]">
              Persona de contacto
            </label>
            <input
              id="mobile-proveedor-contact-name"
              value={form.contact_name}
              onChange={setField('contact_name')}
              placeholder="Nombre del vendedor"
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-proveedor-address" className="mt-3 block text-[11px] font-semibold text-[#5b5570]">
              Dirección
            </label>
            <input
              id="mobile-proveedor-address"
              value={form.address}
              onChange={setField('address')}
              placeholder="Calle, número..."
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-proveedor-city" className="mt-3 block text-[11px] font-semibold text-[#5b5570]">
              Ciudad
            </label>
            <input
              id="mobile-proveedor-city"
              value={form.city}
              onChange={setField('city')}
              placeholder="Ciudad"
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-proveedor-province" className="mt-3 block text-[11px] font-semibold text-[#5b5570]">
              Provincia
            </label>
            <input
              id="mobile-proveedor-province"
              value={form.province}
              onChange={setField('province')}
              placeholder="Provincia"
              className="mt-1 h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
            />

            <label htmlFor="mobile-proveedor-notes" className="mt-3 block text-[11px] font-semibold text-[#5b5570]">
              Notas
            </label>
            <textarea
              id="mobile-proveedor-notes"
              value={form.notes}
              onChange={setField('notes')}
              placeholder="Condiciones de pago, días de entrega, etc."
              rows={3}
              className="mt-1 w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 py-2 text-sm text-[#121325] outline-none"
            />

            <div className="mt-4 flex gap-2 pb-2">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 rounded-[11px] border border-[#ece6f6] py-[11px] text-[12.5px] font-bold text-[#5b5570]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 rounded-[11px] bg-[#7c5ca8] py-[11px] text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de confirmación de eliminación — SIN motivo obligatorio, a
          diferencia de MobileComprobantes (los proveedores no son
          fiscalmente sensibles). */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-label="Eliminar proveedor"
          className="fixed inset-0 z-[410] flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div className="w-full max-w-[380px] rounded-t-[20px] bg-white p-5 sm:rounded-[20px]">
            <p className="text-base font-extrabold text-[#121325]">¿Estás seguro?</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#7b6b95]">
              Vas a eliminar al proveedor <strong>{deleteTarget.name}</strong>. Esta acción no se puede deshacer.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
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
