/**
 * Página de Clientes.
 * Lista y gestión de clientes con base de datos.
 */
import { useMemo, useState } from 'react'
import { Plus, Edit, Trash2, Users, Search, Phone, Mail, MapPin, FileText, Settings2, UserRoundCheck, Inbox } from 'lucide-react'
import { Button, Table, Pagination, Modal, Input, Select, ConfirmModal } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import { TAX_CONDITIONS, DOCUMENT_TYPES } from '../types'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import clientsService, { ClientCreate, ClientUpdate, Client } from '../api/clientsService'
import clientTypesService, { ClientType } from '../api/clientTypesService'
import toast from 'react-hot-toast'

export default function Clients() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'address' | 'notes'>('general')
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null)
  const [isLookingUpCuit, setIsLookingUpCuit] = useState(false)
  const [showTypesModal, setShowTypesModal] = useState(false)
  const [typeName, setTypeName] = useState('')
  const [typeEligible, setTypeEligible] = useState(false)
  const [editingType, setEditingType] = useState<ClientType | null>(null)
  const [typeToDelete, setTypeToDelete] = useState<ClientType | null>(null)

  // Query para clientes
  const { data: clientsData, isLoading, error } = useQuery({
    queryKey: ['clients', page, search],
    queryFn: () => clientsService.getAll({ page, per_page: 20, search }),
    retry: false,
  })

  const { data: clientTypesData } = useQuery({
    queryKey: ['client-types'],
    queryFn: () => clientTypesService.getAll(),
    retry: false,
  })

  const clientTypes = clientTypesData || []
  const clientTypeOptions = clientTypes.map((item) => ({
    value: item.id,
    label: `${item.name}${item.is_subclient_eligible ? ' · Retira por terceros' : ''}`,
  }))

  const clientTypeById = useMemo(
    () => new Map(clientTypes.map((item) => [item.id, item])),
    [clientTypes]
  )

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

  // Mutation para eliminar cliente
  const deleteMutation = useMutation({
    mutationFn: (id: string) => clientsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente eliminado correctamente', { icon: '🗑️' })
      setClientToDelete(null)
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const createTypeMutation = useMutation({
    mutationFn: () =>
      clientTypesService.create({
        name: typeName.trim(),
        is_subclient_eligible: typeEligible,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-types'] })
      toast.success('Tipo de cliente creado')
      setTypeName('')
      setTypeEligible(false)
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const updateTypeMutation = useMutation({
    mutationFn: (payload: { id: string; name: string; is_subclient_eligible: boolean }) =>
      clientTypesService.update(payload.id, {
        name: payload.name,
        is_subclient_eligible: payload.is_subclient_eligible,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-types'] })
      toast.success('Tipo de cliente actualizado')
      setEditingType(null)
      setTypeName('')
      setTypeEligible(false)
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => clientTypesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-types'] })
      toast.success('Tipo de cliente eliminado')
      setTypeToDelete(null)
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Formulario
  const [formData, setFormData] = useState<Partial<Client>>({
    name: '',
    client_type_id: '',
    document_type: 'DNI',
    document_number: '',
    tax_condition: 'Consumidor Final',
    current_account_mode: 'disabled',
    credit_limit: undefined,
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
    setActiveTab('general')
    setFormData({
      name: '',
      client_type_id: '',
      document_type: 'DNI',
      document_number: '',
      tax_condition: 'Consumidor Final',
      current_account_mode: 'disabled',
      credit_limit: undefined,
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
      if (clientTypes.length > 0) {
        setFormData((prev) => ({ ...prev, client_type_id: clientTypes[0].id }))
      }
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

    if (!formData.client_type_id) {
      toast.error('Debés seleccionar un tipo de cliente')
      return
    }

    if (formData.current_account_mode === 'limited' && formData.credit_limit == null) {
      toast.error('Para Cuenta Corriente con límite debés informar el límite de crédito')
      return
    }

    const dataToSend: ClientCreate = {
      name: formData.name!.trim(),
      client_type_id: formData.client_type_id,
      document_type: formData.document_type!,
      document_number: formData.document_number!.trim(),
      tax_condition: formData.tax_condition!,
      current_account_mode: formData.current_account_mode || 'disabled',
      credit_limit:
        formData.current_account_mode === 'limited' && formData.credit_limit != null
          ? Number(formData.credit_limit)
          : undefined,
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

  const handleLookupCuit = async () => {
    const cuit = formData.document_number?.replace(/\D/g, '')
    if (!cuit || cuit.length < 11) {
      toast.error('Ingresá un CUIT válido (11 números)')
      return
    }

    setIsLookingUpCuit(true)
    try {
const data = await clientsService.lookupCuit(cuit)
        
      console.log('📥 Datos recibidos de AFIP:', JSON.stringify(data, null, 2))
      
      // Función para poner en formato título (Ej: "JUAN PEREZ" -> "Juan Perez")
      const toTitleCase = (str: string) => {
        if (!str) return ''
        return str.toLowerCase().split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ')
      }

      // Cargar datos de forma agresiva (sin fallback al valor previo si viene vacío)
      const updates: Partial<Client> = {
        ...formData,
      }

      if (data.name) updates.name = toTitleCase(data.name)
      if (data.tax_condition) updates.tax_condition = data.tax_condition
      if (data.address) updates.street = toTitleCase(data.address)
      if (data.city) updates.city = toTitleCase(data.city)
      if (data.province) updates.province = toTitleCase(data.province)
      if (data.postal_code) updates.postal_code = data.postal_code

      console.log('📝 Estado actualizado:', JSON.stringify(updates, null, 2))
      
      // Forzar actualización con spread operator
      setFormData({ ...updates })
      toast.success('Datos recuperados de AFIP')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'No se pudieron recuperar los datos'
      toast.error(msg)
    } finally {
      setIsLookingUpCuit(false)
    }
  }

  const handleSubmitClientType = () => {
    const normalized = typeName.trim()
    if (!normalized) {
      toast.error('El nombre del tipo es obligatorio')
      return
    }

    if (editingType) {
      updateTypeMutation.mutate({
        id: editingType.id,
        name: normalized,
        is_subclient_eligible: typeEligible,
      })
      return
    }

    createTypeMutation.mutate()
  }

  const handleStartEditType = (item: ClientType) => {
    setEditingType(item)
    setTypeName(item.name)
    setTypeEligible(item.is_subclient_eligible)
  }

  const resetClientTypeForm = () => {
    setEditingType(null)
    setTypeName('')
    setTypeEligible(false)
  }

  const columns = [
    {
      key: 'name',
      header: 'Cliente',
      render: (item: Client) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 flex items-center justify-center text-[11px] font-semibold">
            {item.name
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((token) => token[0]?.toUpperCase())
              .join('') || 'CL'}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-white truncate">{item.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {item.document_type}: {item.document_number}
          </div>
          </div>
        </div>
      ),
    },
    {
      key: 'tax_condition',
      header: 'Condición IVA',
      render: (item: Client) => (
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300 border border-primary-100 dark:border-primary-800">
          {item.tax_condition}
        </span>
      ),
    },
    {
      key: 'client_type',
      header: 'Tipo Cliente',
      render: (item: Client) => {
        const type = clientTypeById.get(item.client_type_id)
        if (!type) {
          return (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600">
              Sin clasificar
            </span>
          )
        }

        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300 border border-violet-100 dark:border-violet-800">
            <span>{type.name}</span>
            {type.is_subclient_eligible && <UserRoundCheck size={12} />}
          </div>
        )
      },
    },
    {
      key: 'contact',
      header: 'Contacto',
      render: (item: Client) => (
        <div className="space-y-1">
          {item.phone && (
            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <Phone size={12} /> {item.phone}
            </div>
          )}
          {item.email && (
            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
              <Mail size={12} /> {item.email}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'current_balance',
      header: 'Saldo',
      render: (item: Client) => (
        <span
          className={`font-mono font-medium ${
            item.current_balance > 0
              ? 'text-green-600 dark:text-green-400'
              : item.current_balance < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-500'
          }`}
        >
          ${item.current_balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item: Client) => (
        <div className="flex gap-2 justify-end">
          <button
            className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
            onClick={() => handleOpenModal(item)}
            title="Editar"
          >
            <Edit size={18} />
          </button>
          <button
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            onClick={() => setClientToDelete(item)}
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
    <div className="h-full min-h-0 w-full flex flex-col gap-3">
      {/* Header estilo Categorías */}
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary-50 to-primary-50 dark:from-primary-900/20 dark:to-primary-900/20 px-3 py-2.5 rounded-lg border border-primary-200 dark:border-primary-800">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-primary-900 dark:text-primary-100 flex items-center gap-2 leading-none">
            <Users className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <span>Clientes</span>
          </h1>
          <p className="text-xs text-primary-700 dark:text-primary-300 mt-1 truncate">
            Gestión de clientes y control de cuentas corrientes
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetClientTypeForm()
              setShowTypesModal(true)
            }}
            className="border-primary-300 text-primary-700 hover:bg-primary-100 dark:border-primary-700 dark:text-primary-300"
          >
            <Settings2 size={18} className="mr-2" />
            Tipos de Cliente
          </Button>
          <Button
            onClick={() => handleOpenModal()}
            className="bg-primary-600 hover:bg-primary-700 text-white border-none shadow-md"
            data-tour-clients-new
          >
            <Plus size={18} className="mr-2" />
            Nuevo Cliente
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, documento..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
            data-tour-clients-search
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        {clients.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 px-6">
            <Inbox className="h-8 w-8 mb-2 text-primary-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No hay clientes para mostrar</p>
            <p className="text-xs mt-1">Probá con otro término de búsqueda o creá un cliente nuevo.</p>
          </div>
        ) : (
          <Table columns={columns} data={clients} density="compact" />
        )}
      </div>

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={Math.ceil((clientsData?.total || 0) / 20)}
        totalItems={clientsData?.total || 0}
        onPageChange={setPage}
      />

      {/* Modal Mejorado con Tabs */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          resetForm()
        }}
        title={isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="lg"
      >
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'general'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users size={16} />
                Info. General
              </div>
            </button>
            <button
              onClick={() => setActiveTab('address')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'address'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin size={16} />
                Ubicación
              </div>
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'notes'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText size={16} />
                Notas
              </div>
            </button>
          </nav>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tab: General */}
          {activeTab === 'general' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nombre / Razón Social *
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Juan Pérez"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tipo de Cliente *
                  </label>
                  <Select
                    value={formData.client_type_id || ''}
                    onChange={(e) => setFormData({ ...formData, client_type_id: e.target.value })}
                    options={
                      clientTypeOptions.length > 0
                        ? clientTypeOptions
                        : [{ value: '', label: 'Sin tipos disponibles' }]
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tipo de Documento *
                  </label>
                  <Select
                    value={formData.document_type}
                    onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                    options={DOCUMENT_TYPES.map((d) => ({ value: d.value, label: d.label }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Número de Documento *
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.document_number}
                      onChange={(e) => setFormData({ ...formData, document_number: e.target.value })}
                      placeholder="DNI o CUIT"
                      required
                      className="flex-1"
                    />
                    {formData.document_type === 'CUIT' && (
                      <Button
                        type="button"
                        onClick={handleLookupCuit}
                        isLoading={isLookingUpCuit}
                        variant="outline"
                        title="Buscar en padrón AFIP"
                        className="px-3"
                      >
                        {!isLookingUpCuit && <Search size={16} />}
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Condición IVA *
                  </label>
                  <Select
                    value={formData.tax_condition}
                    onChange={(e) => setFormData({ ...formData, tax_condition: e.target.value })}
                    options={TAX_CONDITIONS.map((t) => ({ value: t.value, label: t.label }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Modo Cuenta Corriente
                  </label>
                  <Select
                    value={formData.current_account_mode || 'disabled'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        current_account_mode: e.target.value as 'disabled' | 'limited' | 'unlimited',
                        credit_limit:
                          e.target.value === 'limited' ? formData.credit_limit : undefined,
                      })
                    }
                    options={[
                      { value: 'disabled', label: 'Deshabilitada' },
                      { value: 'limited', label: 'Con límite' },
                      { value: 'unlimited', label: 'Sin límite' },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Límite de crédito
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.credit_limit ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        credit_limit: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder={
                      formData.current_account_mode === 'limited'
                        ? 'Obligatorio para modo con límite'
                        : 'Opcional'
                    }
                    disabled={formData.current_account_mode !== 'limited'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Teléfono
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="Teléfono"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@ejemplo.com"
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Address */}
          {activeTab === 'address' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Calle
                  </label>
                  <Input
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    placeholder="Calle"
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
                    placeholder="Ciudad"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Provincia
                  </label>
                  <Input
                    value={formData.province}
                    onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                    placeholder="Provincia"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    C.P.
                  </label>
                  <Input
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    placeholder="1000"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab: Notes */}
          {activeTab === 'notes' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notas / Observaciones
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Información adicional sobre el cliente..."
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
                />
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-6 border-t border-gray-100 dark:border-gray-700 mt-6">
            <div className="text-xs text-gray-500">
              {activeTab === 'general' && 'Siguiente: Ubicación'}
              {activeTab === 'address' && 'Siguiente: Notas'}
              {activeTab === 'notes' && 'Listo para guardar'}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
                type="button"
              >
                Cancelar
              </Button>
              {activeTab !== 'notes' ? (
                <Button
                  type="button"
                  onClick={() =>
                    setActiveTab(activeTab === 'general' ? 'address' : 'notes')
                  }
                >
                  Siguiente
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Guardando...'
                    : 'Guardar Cliente'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showTypesModal}
        onClose={() => {
          setShowTypesModal(false)
          resetClientTypeForm()
        }}
        title="Tipos de Cliente"
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/70 dark:bg-primary-900/20 p-4">
            <p className="text-sm text-primary-900 dark:text-primary-200">
              Definí cómo clasificar clientes (Arquitecto, Instalador, Particular, etc.) y marcá si
              pueden retirar mercadería por terceros.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nombre del tipo
              </label>
              <Input
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
                placeholder="Ej: Instalador"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleSubmitClientType}
                isLoading={createTypeMutation.isPending || updateTypeMutation.isPending}
              >
                {editingType ? 'Actualizar' : 'Agregar'}
              </Button>
              {editingType && (
                <Button type="button" variant="outline" onClick={resetClientTypeForm}>
                  Cancelar edición
                </Button>
              )}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={typeEligible}
              onChange={(e) => setTypeEligible(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Habilitar este tipo para retiro por terceros (subcliente)
          </label>

          <div className="max-h-72 overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Nombre</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Subcliente</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientTypes.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{item.name}</td>
                    <td className="px-3 py-2">
                      {item.is_subclient_eligible ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          Sí
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                          onClick={() => handleStartEditType(item)}
                          title="Editar"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          onClick={() => setTypeToDelete(item)}
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientTypes.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                      No hay tipos de cliente cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <ConfirmModal
        isOpen={!!clientToDelete}
        onClose={() => setClientToDelete(null)}
        onConfirm={() => clientToDelete && deleteMutation.mutate(clientToDelete.id)}
        title="¿Eliminar cliente?"
        description={`¿Estás seguro que deseas eliminar a "${clientToDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        isLoading={deleteMutation.isPending}
      />

      <ConfirmModal
        isOpen={!!typeToDelete}
        onClose={() => setTypeToDelete(null)}
        onConfirm={() => typeToDelete && deleteTypeMutation.mutate(typeToDelete.id)}
        title="¿Eliminar tipo de cliente?"
        description={`¿Eliminar "${typeToDelete?.name}"? Si tiene clientes asociados, el sistema lo bloqueará.`}
        confirmText="Eliminar"
        isLoading={deleteTypeMutation.isPending}
      />
    </div>
  )
}
