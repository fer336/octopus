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
import { Button, Input, Modal, Table } from '../components/ui'
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
    setShowModal(true)
  }

  const openEditModal = (method: PaymentMethod) => {
    setEditingMethod(method)
    setFormData({
      name: method.name,
      code: method.code,
      requires_reference: method.requires_reference,
      is_active: method.is_active,
    })
    setShowModal(true)
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
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.requires_reference ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
          {item.requires_reference ? 'Requerida' : 'Opcional'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (item: PaymentMethod) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
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
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-900/20 dark:to-fuchsia-900/20 p-6 rounded-xl border border-violet-200 dark:border-violet-800">
        <div>
          <h1 className="text-2xl font-bold text-violet-900 dark:text-violet-100 flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-violet-600 dark:text-violet-400" />
            Métodos de Pago
          </h1>
          <p className="text-violet-700 dark:text-violet-300">
            Administrá los medios de cobro que usa tu negocio en ventas y comprobantes.
          </p>
        </div>
        <Button onClick={openCreateModal} className="bg-violet-600 hover:bg-violet-700 text-white border-none shadow-md">
          <Plus size={18} className="mr-2" />
          Nuevo Método
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{paymentMethods.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Activos</p>
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {paymentMethods.filter((method) => method.is_active).length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Con referencia</p>
          <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
            {paymentMethods.filter((method) => method.requires_reference).length}
          </p>
        </div>
      </div>

      <Table columns={columns} data={filteredMethods} emptyMessage="No hay métodos de pago cargados." />

      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingMethod ? 'Editar Método de Pago' : 'Nuevo Método de Pago'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="flex gap-2 pt-2">
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
      </Modal>
    </div>
  )
}
