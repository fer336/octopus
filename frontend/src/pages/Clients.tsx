/**
 * Página de Clientes.
 * Lista y gestión de clientes con base de datos.
 */
import { useState } from 'react'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { Button, SearchBar, Table, Pagination, Modal, Input, Select } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import { TAX_CONDITIONS, DOCUMENT_TYPES } from '../types'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import clientsService, { ClientCreate, ClientUpdate, Client } from '../api/clientsService'
import toast from 'react-hot-toast'

export default function Clients() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Query para clientes
  const { data: clientsData, isLoading, error } = useQuery({
    queryKey: ['clients', page, search],
    queryFn: () => clientsService.getAll({ page, per_page: 20, search }),
    retry: false,
  })

  // Mutation para crear cliente
  const createMutation = useMutation({
    mutationFn: (data: ClientCreate) => clientsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente creado correctamente', {
        duration: 3000,
        icon: '✅',
      })
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Mutation para actualizar cliente
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClientUpdate }) =>
      clientsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente actualizado correctamente', {
        duration: 3000,
        icon: '✅',
      })
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Formulario
  const [formData, setFormData] = useState<Partial<Client>>({
    name: '',
    document_type: 'DNI',
    document_number: '',
    tax_condition: 'Consumidor Final',
    phone: '',
    email: '',
    street: '',
    street_number: '',
    city: '',
    province: '',
    postal_code: '',
    notes: '',
  })

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setFormData({
      name: '',
      document_type: 'DNI',
      document_number: '',
      tax_condition: 'Consumidor Final',
      phone: '',
      email: '',
      street: '',
      street_number: '',
      city: '',
      province: '',
      postal_code: '',
      notes: '',
    })
  }

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setIsEditing(true)
      setEditingId(client.id)
      setFormData(client)
    } else {
      resetForm()
    }
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validaciones
    if (!formData.name?.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    if (!formData.document_number?.trim()) {
      toast.error('El número de documento es obligatorio')
      return
    }

    const dataToSend: ClientCreate = {
      name: formData.name!.trim(),
      document_type: formData.document_type!,
      document_number: formData.document_number!.trim(),
      tax_condition: formData.tax_condition!,
      phone: formData.phone?.trim() || undefined,
      email: formData.email?.trim() || undefined,
      street: formData.street?.trim() || undefined,
      street_number: formData.street_number?.trim() || undefined,
      city: formData.city?.trim() || undefined,
      province: formData.province?.trim() || undefined,
      postal_code: formData.postal_code?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
    }

    if (isEditing && editingId) {
      updateMutation.mutate({ id: editingId, data: dataToSend })
    } else {
      createMutation.mutate(dataToSend)
    }
  }

  const columns = [
    { key: 'name', header: 'Nombre / Razón Social' },
    {
      key: 'document',
      header: 'Documento',
      render: (item: Client) => (
        <span>{item.document_type}: {item.document_number}</span>
      ),
    },
    { key: 'tax_condition', header: 'Condición IVA' },
    { key: 'phone', header: 'Teléfono' },
    {
      key: 'current_balance',
      header: 'Saldo',
      render: (item: Client) => (
        <span className={item.current_balance > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
          ${item.current_balance.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item: Client) => (
        <div className="flex gap-2">
          <button 
            className="text-gray-400 hover:text-primary-600"
            onClick={() => handleOpenModal(item)}
          >
            <Edit size={18} />
          </button>
          <button className="text-gray-400 hover:text-red-600">
            <Trash2 size={18} />
          </button>
        </div>
      ),
    },
  ]

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">
            {isUnauthorized ? 'No estás autenticado' : 'Error al cargar clientes'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {isUnauthorized 
              ? 'Por favor inicia sesión con Google para continuar' 
              : errorMessage}
          </p>
          {isUnauthorized && (
            <Button 
              onClick={() => window.location.href = '/login'} 
              className="mt-4"
            >
              Ir al Login
            </Button>
          )}
        </div>
      </div>
    )
  }

  const clients = clientsData?.items || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Clientes
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Gestión de clientes y cuentas corrientes
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus size={18} />
          Nuevo cliente
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre o documento..."
          className="flex-1"
        />
      </div>

      {/* Tabla */}
      <Table
        columns={columns}
        data={clients}
      />

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={Math.ceil((clientsData?.total || 0) / 20)}
        totalItems={clientsData?.total || 0}
        onPageChange={setPage}
      />

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Datos principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nombre / Razón Social *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Juan Pérez o Ferretería San Martín S.R.L."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tipo de Documento *
              </label>
              <Select
                value={formData.document_type}
                onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                options={DOCUMENT_TYPES.map(d => ({ value: d.value, label: d.label }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Número de Documento *
              </label>
              <Input
                value={formData.document_number}
                onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                placeholder="30-71234567-8"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Condición IVA *
              </label>
              <Select
                value={formData.tax_condition}
                onChange={(e) => setFormData({ ...formData, tax_condition: e.target.value })}
                options={TAX_CONDITIONS.map(t => ({ value: t.value, label: t.label }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Teléfono
              </label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="11-1234-5678"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="cliente@ejemplo.com"
              />
            </div>
          </div>

          {/* Dirección */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Calle
              </label>
              <Input
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                placeholder="Av. Corrientes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Número
              </label>
              <Input
                value={formData.street_number}
                onChange={(e) => setFormData({ ...formData, street_number: e.target.value })}
                placeholder="1234"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Ciudad
              </label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="CABA"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Provincia
              </label>
              <Input
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                placeholder="Buenos Aires"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Código Postal
              </label>
              <Input
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="1000"
              />
            </div>
          </div>

          {/* Botones */}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }} type="button">
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
