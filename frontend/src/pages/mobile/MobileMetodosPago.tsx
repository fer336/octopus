/**
 * Native mobile "Métodos de pago" screen (PR7). Self-fetching via
 * `paymentMethodsService.getAll` directly (same raw useQuery shortcut as
 * `MobileCuenta`/`MobileComprobantes`, no dedicated hook file).
 *
 * Fetches ALL payment methods (no `active_only` filter) — unlike desktop's
 * public-facing pickers, this is an admin CRUD screen: inactive methods must
 * stay visible so they can be reactivated. Mirrors desktop's own admin page
 * (`PaymentMethods.tsx`, `usePaymentMethods(false)`), which also fetches the
 * full list, not just active ones.
 *
 * Search is entirely client-side (mirrors desktop's search-by-name-or-code
 * filter) — same reasoning as `MobileCuenta`'s local search: an already-
 * fetched, small, in-memory list doesn't need a debounced server round-trip.
 *
 * Create/edit form fields, validation message, and toast copy/icons are
 * ported byte-for-byte from desktop's `PaymentMethods.tsx` business logic
 * (`handleSubmit`/`handleToggleStatus`) — this screen changes DESIGN only,
 * not behavior. There is no hard-delete action for payment methods on
 * desktop, so none is added here either; `is_active` toggling (via
 * `updateStatus`) is the only way to retire a method.
 *
 * The `is_active` checkbox is only shown in edit mode, mirroring desktop's
 * `initialFormState.is_active = true` default for creation (a brand-new
 * method is always created active; edit exposes the toggle since desktop's
 * edit payload includes `is_active`).
 */
import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Power, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import paymentMethodsService, {
  type PaymentMethod,
  type PaymentMethodCreate,
  type PaymentMethodUpdate,
} from '../../api/paymentMethodsService'
import { formatErrorMessage } from '../../utils/errorHelpers'

// ─── Pure helpers (exported for direct unit testing) ──────────────────────

/** Local, case-insensitive filter over the already-fetched method list, matching either name or code (mirrors desktop's join-and-search). */
export function filterPaymentMethodsByQuery(methods: PaymentMethod[], query: string): PaymentMethod[] {
  const q = query.trim().toLowerCase()
  if (!q) return methods
  return methods.filter((m) => [m.name, m.code].join(' ').toLowerCase().includes(q))
}

// ─── Form state ─────────────────────────────────────────────────────────────

interface PaymentMethodFormState {
  name: string
  code: string
  requires_reference: boolean
  is_active: boolean
}

const INITIAL_FORM_STATE: PaymentMethodFormState = {
  name: '',
  code: '',
  requires_reference: false,
  is_active: true,
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function MobileMetodosPago() {
  const [query, setQuery] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null)
  const [formData, setFormData] = useState<PaymentMethodFormState>(INITIAL_FORM_STATE)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mobile-payment-methods'],
    queryFn: () => paymentMethodsService.getAll(),
    retry: false,
  })

  const methods = data ?? []
  const filteredMethods = useMemo(() => filterPaymentMethodsByQuery(methods, query), [methods, query])

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['mobile-payment-methods'] })

  const createMutation = useMutation({
    mutationFn: (payload: PaymentMethodCreate) => paymentMethodsService.create(payload),
    onSuccess: () => {
      invalidateList()
      toast.success('Método de pago creado', { icon: '✅' })
      closeSheet()
    },
    onError: (mutationError) => {
      toast.error(formatErrorMessage(mutationError))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: payload }: { id: string; data: PaymentMethodUpdate }) =>
      paymentMethodsService.update(id, payload),
    onSuccess: () => {
      invalidateList()
      toast.success('Método de pago actualizado', { icon: '✅' })
      closeSheet()
    },
    onError: (mutationError) => {
      toast.error(formatErrorMessage(mutationError))
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      paymentMethodsService.updateStatus(id, isActive),
    onSuccess: (_result, variables) => {
      invalidateList()
      toast.success(variables.isActive ? 'Método activado' : 'Método desactivado', {
        icon: variables.isActive ? '✅' : '⏸️',
      })
    },
    onError: (mutationError) => {
      toast.error(formatErrorMessage(mutationError))
    },
  })

  const openCreateSheet = () => {
    setEditingMethod(null)
    setFormData(INITIAL_FORM_STATE)
    setSheetOpen(true)
  }

  const openEditSheet = (method: PaymentMethod) => {
    setEditingMethod(method)
    setFormData({
      name: method.name,
      code: method.code,
      requires_reference: method.requires_reference,
      is_active: method.is_active,
    })
    setSheetOpen(true)
  }

  const closeSheet = () => {
    setSheetOpen(false)
    setEditingMethod(null)
    setFormData(INITIAL_FORM_STATE)
  }

  const handleToggleStatus = (method: PaymentMethod) => {
    toggleStatusMutation.mutate({ id: method.id, isActive: !method.is_active })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    const basePayload = {
      name: formData.name.trim(),
      requires_reference: formData.requires_reference,
      code: formData.code.trim() || undefined,
    }

    if (editingMethod) {
      const payload: PaymentMethodUpdate = { ...basePayload, is_active: formData.is_active }
      updateMutation.mutate({ id: editingMethod.id, data: payload })
      return
    }

    const payload: PaymentMethodCreate = { ...basePayload, is_active: formData.is_active }
    createMutation.mutate(payload)
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
          No pudimos cargar los métodos de pago.
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
      {/* Búsqueda + alta */}
      <div className="flex items-center gap-2">
        <div className="flex h-[46px] flex-1 items-center gap-2 rounded-[13px] border border-[#ece6f6] bg-white px-3">
          <Search size={18} color="#9089a0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar método de pago"
            aria-label="Buscar método de pago"
            className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={openCreateSheet}
          className="flex h-[46px] flex-none items-center gap-1.5 rounded-[13px] bg-[#7c5ca8] px-3 text-[12.5px] font-bold text-white"
        >
          <Plus size={18} />
          Nuevo método
        </button>
      </div>

      {/* Lista de métodos */}
      <div className="mt-3 flex flex-col gap-[9px]">
        {filteredMethods.length === 0 ? (
          <div className="rounded-[15px] border border-dashed border-[#d9caeb] bg-white p-[24px_18px] text-center text-[#9089a0]">
            <p className="text-[11.5px]">No hay métodos de pago para mostrar.</p>
          </div>
        ) : (
          filteredMethods.map((method) => (
            <div
              key={method.id}
              data-testid="payment-method-card"
              className="flex flex-col gap-1.5 rounded-[15px] border border-[#ece6f6] bg-white p-[13px_14px]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#121325]">{method.name}</p>
                  <p className="text-[11.5px] text-[#9089a0]">{method.code || '—'}</p>
                </div>
                <span
                  className="flex-none rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white"
                  style={{ background: method.is_active ? '#3d8c47' : '#9089a0' }}
                >
                  {method.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="flex items-center gap-[7px]">
                <span
                  className="flex-none rounded px-1.5 py-0.5 text-[10.5px] font-bold"
                  style={
                    method.requires_reference
                      ? { color: '#b45309', background: '#fef3c7' }
                      : { color: '#7c5ca8', background: '#ece6f6' }
                  }
                >
                  {method.requires_reference ? 'Requiere referencia' : 'Sin referencia'}
                </span>
              </div>

              {/* Acciones */}
              <div className="mt-1 flex items-center gap-[7px] border-t border-[#ece6f6] pt-2">
                <button
                  type="button"
                  onClick={() => openEditSheet(method)}
                  aria-label={`Editar ${method.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-[9px]"
                  style={{ background: '#ece6f6' }}
                >
                  <Pencil size={14} color="#7c5ca8" />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleStatus(method)}
                  disabled={toggleStatusMutation.isPending}
                  aria-label={`${method.is_active ? 'Desactivar' : 'Activar'} ${method.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-[9px] disabled:opacity-50"
                  style={{ background: method.is_active ? '#fdecea' : '#e8f5ea' }}
                >
                  <Power size={14} color={method.is_active ? '#c0392b' : '#3d8c47'} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Alta / edición — mirrors MobileComprobantes' bottom-sheet-style
          confirm modal shell (`role="dialog"`, `fixed inset-0 z-[410]`). */}
      {sheetOpen && (
        <div
          role="dialog"
          aria-label={editingMethod ? 'Editar método de pago' : 'Nuevo método de pago'}
          className="fixed inset-0 z-[410] flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div className="w-full max-w-[380px] rounded-t-[20px] bg-white p-5 sm:rounded-[20px]">
            <p className="text-base font-extrabold text-[#121325]">
              {editingMethod ? 'Editar método de pago' : 'Nuevo método de pago'}
            </p>

            <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
              <div>
                <label
                  htmlFor="mobile-payment-method-name"
                  className="mb-1 block text-[11px] font-semibold text-[#5b5570]"
                >
                  Nombre *
                </label>
                <input
                  id="mobile-payment-method-name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Billetera virtual"
                  className="h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="mobile-payment-method-code"
                  className="mb-1 block text-[11px] font-semibold text-[#5b5570]"
                >
                  Código (opcional)
                </label>
                <input
                  id="mobile-payment-method-code"
                  value={formData.code}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="Se genera automáticamente si lo dejás vacío"
                  className="h-[42px] w-full rounded-[11px] border border-[#ece6f6] bg-[#f7f4fb] px-3 text-sm text-[#121325] outline-none"
                />
              </div>

              <label className="flex items-center gap-2.5 rounded-[11px] border border-[#ece6f6] px-3 py-2.5 text-[12.5px] font-semibold text-[#5b5570]">
                <input
                  type="checkbox"
                  checked={formData.requires_reference}
                  onChange={(e) => setFormData((prev) => ({ ...prev, requires_reference: e.target.checked }))}
                />
                Requiere referencia
              </label>

              {editingMethod && (
                <label className="flex items-center gap-2.5 rounded-[11px] border border-[#ece6f6] px-3 py-2.5 text-[12.5px] font-semibold text-[#5b5570]">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  Método activo
                </label>
              )}

              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={closeSheet}
                  className="flex-1 rounded-[11px] border border-[#ece6f6] py-[11px] text-[12.5px] font-bold text-[#5b5570]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 rounded-[11px] bg-[#7c5ca8] py-[11px] text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : editingMethod ? 'Guardar cambios' : 'Crear método'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
