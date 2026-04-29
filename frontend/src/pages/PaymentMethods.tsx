/**
 * Página de gestión de métodos de pago.
 */
import { useMemo, useState, type FormEvent } from 'react'
import { CreditCard, Pencil, Plus, Power, Search } from 'lucide-react'
import toast from 'react-hot-toast'

import type {
  PaymentMethod,
  PaymentMethodCreate,
  PaymentMethodUpdate,
} from '../api/paymentMethodsService'
import { Button, Input, ResponsiveTable, Table } from '../components/ui'
import {
  useCreatePaymentMethod,
  usePaymentMethods,
  useUpdatePaymentMethod,
  useUpdatePaymentMethodStatus,
} from '../hooks/usePaymentMethods'
import { formatErrorMessage } from '../utils/errorHelpers'

type FormState = {
  name: string
  code: string
  requires_reference: boolean
  is_active: boolean
}

const initialFormState: FormState = {
  name: '',
  code: '',
  requires_reference: false,
  is_active: true,
}

export default function PaymentMethods() {
  const { data: paymentMethods = [], isLoading, error } = usePaymentMethods(false)
  const createMutation = useCreatePaymentMethod()
  const updateMutation = useUpdatePaymentMethod()
  const statusMutation = useUpdatePaymentMethodStatus()

  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null)
  const [formData, setFormData] = useState<FormState>(initialFormState)

  const filteredMethods = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return paymentMethods

    return paymentMethods.filter((method) =>
      [method.name, method.code]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    )
  }, [paymentMethods, search])

  const resetForm = () => {
    setEditingMethod(null)
    setFormData(initialFormState)
  }

  const openCreateModal = () => {
    resetForm()
    window.setTimeout(() => setShowModal(true), 0)
  }

  const openEditModal = (method: PaymentMethod) => {
    setEditingMethod(method)
    setFormData({
      name: method.name,
      code: method.code,
      requires_reference: method.requires_reference,
      is_active: method.is_active,
    })
    window.setTimeout(() => setShowModal(true), 0)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    resetForm()
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
      const payload: PaymentMethodUpdate = {
        ...basePayload,
        is_active: formData.is_active,
      }

      updateMutation.mutate(
        { id: editingMethod.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Método de pago actualizado', { icon: '✅' })
            handleCloseModal()
          },
          onError: (mutationError) => {
            toast.error(formatErrorMessage(mutationError))
          },
        }
      )
      return
    }

    const payload: PaymentMethodCreate = {
      ...basePayload,
      is_active: formData.is_active,
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success('Método de pago creado', { icon: '✅' })
        handleCloseModal()
      },
      onError: (mutationError) => {
        toast.error(formatErrorMessage(mutationError))
      },
    })
  }

  const handleToggleStatus = (method: PaymentMethod) => {
    statusMutation.mutate(
      { id: method.id, isActive: !method.is_active },
      {
        onSuccess: () => {
          toast.success(
            method.is_active ? 'Método desactivado' : 'Método activado',
            { icon: method.is_active ? '⏸️' : '✅' }
          )
        },
        onError: (mutationError) => {
          toast.error(formatErrorMessage(mutationError))
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    const isUnauthorized = errorMessage.includes('401') || errorMessage.includes('Unauthorized')

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
          <CreditCard className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {isUnauthorized ? 'Sesión Expirada' : 'Error de Conexión'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          {isUnauthorized
            ? 'Tu sesión ha caducado. Por favor iniciá sesión nuevamente.'
            : 'No pudimos cargar los métodos de pago. Intentá nuevamente más tarde.'}
        </p>
        {isUnauthorized && (
          <Button onClick={() => { window.location.href = '/login' }}>Ir al Login</Button>
        )}
      </div>
    )
  }

  const columns = [
    {
      key: 'name',
      header: 'Método',
      render: (item: PaymentMethod) => (
        <div className="flex flex-col">
          <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Código: {item.code}</span>
        </div>
      ),
    },
    {
      key: 'requires_reference',
      header: 'Referencia',
      render: (item: PaymentMethod) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.requires_reference ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300'}`}>
          {item.requires_reference ? 'Requerida' : 'Opcional'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (item: PaymentMethod) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
          {item.is_active ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'text-right',
      render: (item: PaymentMethod) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => openEditModal(item)}
            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
            title="Editar"
          >
            <Pencil size={18} />
          </button>
          <button
            type="button"
            onClick={() => handleToggleStatus(item)}
            disabled={statusMutation.isPending}
            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors disabled:opacity-60"
            title={item.is_active ? 'Desactivar' : 'Activar'}
          >
            <Power size={18} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="w-full max-w-none space-y-1">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 p-2 rounded-md border border-primary-200 dark:border-primary-800">
        <div>
          <h1 className="text-xl font-bold text-primary-900 dark:text-primary-100 flex items-center gap-1.5">
            <CreditCard className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Métodos de Pago
          </h1>
          <p className="text-sm text-primary-700 dark:text-primary-300">
            Administrá los medios de cobro que usa tu negocio en ventas y comprobantes.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white shadow-md hover:bg-primary-700"
        >
          <Plus size={18} />
          Nuevo Método
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 p-2 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-10 pr-3 py-1.5 bg-gray-50 dark:bg-gray-700 border-none rounded-md focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-2">
          <p className="truncate text-[11px] sm:text-sm text-gray-500 dark:text-gray-400">Total</p>
          <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">{paymentMethods.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-2">
          <p className="truncate text-[11px] sm:text-sm text-gray-500 dark:text-gray-400">Activos</p>
          <p className="text-lg sm:text-xl font-semibold text-primary-600 dark:text-primary-400">
            {paymentMethods.filter((method) => method.is_active).length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-2">
          <p className="truncate text-[11px] sm:text-sm text-gray-500 dark:text-gray-400">Con referencia</p>
          <p className="text-lg sm:text-xl font-semibold text-amber-600 dark:text-amber-400">
            {paymentMethods.filter((method) => method.requires_reference).length}
          </p>
        </div>
      </div>

      <ResponsiveTable
        data={filteredMethods}
        emptyState={
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            No hay métodos de pago cargados.
          </div>
        }
        renderDesktop={() => (
          <Table columns={columns} data={filteredMethods} emptyMessage="No hay métodos de pago cargados." />
        )}
        renderCard={(method) => (
          <div
            key={method.id}
            className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                    <CreditCard size={16} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {method.name}
                    </h3>
                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                      Código: {method.code || '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEditModal(method)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-300 dark:hover:bg-primary-900/40"
                  title="Editar"
                  aria-label={`Editar ${method.name}`}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleStatus(method)}
                  disabled={statusMutation.isPending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  title={method.is_active ? 'Desactivar' : 'Activar'}
                  aria-label={`${method.is_active ? 'Desactivar' : 'Activar'} ${method.name}`}
                >
                  <Power size={15} />
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Referencia</p>
                <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${method.requires_reference ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300'}`}>
                  {method.requires_reference ? 'Requerida' : 'Opcional'}
                </span>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/40">
                <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Estado</p>
                <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${method.is_active ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                  {method.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>
        )}
      />

      {showModal && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
            <div
              className="pointer-events-auto relative w-full max-w-lg rounded-md bg-white shadow-xl dark:bg-gray-800"
              onMouseDown={(event) => event.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b px-3 py-2 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingMethod ? 'Editar Método de Pago' : 'Nuevo Método de Pago'}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="px-3 py-2">
              <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            label="Nombre"
            value={formData.name}
            onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Ej: Billetera virtual"
          />

          <Input
            label="Código interno (opcional)"
            value={formData.code}
            onChange={(event) => setFormData((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
            placeholder="Se genera automáticamente si lo dejás vacío"
          />

          <label className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={formData.requires_reference}
              onChange={(event) => setFormData((prev) => ({ ...prev, requires_reference: event.target.checked }))}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Requiere referencia / número de operación
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(event) => setFormData((prev) => ({ ...prev, is_active: event.target.checked }))}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Método activo
          </label>

          <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
            Sugerencia: podés tener a la vez <strong>Billetera virtual</strong> y <strong>Mercado Pago</strong> como medios separados.
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleCloseModal} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Guardando...'
                : editingMethod
                  ? 'Guardar cambios'
                  : 'Crear método'}
            </Button>
          </div>
              </form>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
