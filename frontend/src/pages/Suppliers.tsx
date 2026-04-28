/**
 * Página de Proveedores.
 * Gestión de proveedores con base de datos.
 */
import { useState } from 'react'
import { Plus, Edit, Trash2, Truck, Phone, Mail, MapPin, Search, Inbox } from 'lucide-react'
import { Button, Table, Pagination, Modal, Input } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import suppliersService, { SupplierCreate, SupplierUpdate, Supplier } from '../api/suppliersService'
import categoriesService from '../api/categoriesService'
import toast from 'react-hot-toast'
import DeleteSupplierModal from '../components/suppliers/DeleteSupplierModal'

export default function Suppliers() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'general' | 'categories'>('general')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)

  // Query para proveedores
  const { data: suppliersData, isLoading, error } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: () => suppliersService.getAll({ page, per_page: 20, search }),
    retry: false,
  })

  // Query para categorías
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesService.getAll(),
    retry: false,
    enabled: !!suppliersData || !error,
  })

  // Valor seguro para categories
  const categories = Array.isArray(categoriesData) ? categoriesData : []

  // Mutation para crear proveedor
  const createMutation = useMutation({
    mutationFn: (data: SupplierCreate) => suppliersService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Proveedor creado correctamente', { duration: 3000, icon: '✅' })
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Mutation para actualizar proveedor
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SupplierUpdate }) =>
      suppliersService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Proveedor actualizado correctamente', { duration: 3000, icon: '✅' })
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Mutation para eliminar proveedor
  const deleteMutation = useMutation({
    mutationFn: (id: string) => suppliersService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Proveedor eliminado correctamente', { duration: 3000, icon: '🗑️' })
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Formulario
  const [formData, setFormData] = useState<Partial<Supplier>>({
    name: '',
    cuit: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    contact_name: '',
    notes: '',
    category_ids: [],
  })

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setActiveTab('general')
    setFormData({
      name: '',
      cuit: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      province: '',
      contact_name: '',
      notes: '',
      category_ids: [],
    })
  }

  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setIsEditing(true)
      setEditingId(supplier.id)
      setFormData(supplier)
    } else {
      resetForm()
    }
    setShowModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name?.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    const dataToSend: SupplierCreate = {
      name: formData.name!.trim(),
      cuit: formData.cuit?.trim(),
      phone: formData.phone?.trim(),
      email: formData.email?.trim(),
      address: formData.address?.trim(),
      city: formData.city?.trim(),
      province: formData.province?.trim(),
      contact_name: formData.contact_name?.trim(),
      notes: formData.notes?.trim(),
      category_ids: formData.category_ids || [],
    }
    if (isEditing && editingId) {
      updateMutation.mutate({ id: editingId, data: dataToSend })
    } else {
      createMutation.mutate(dataToSend)
    }
  }

  const handleDelete = (supplier: Supplier) => {
    setSupplierToDelete(supplier)
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (supplierToDelete) {
      deleteMutation.mutate(supplierToDelete.id)
      setShowDeleteModal(false)
      setSupplierToDelete(null)
    }
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
          <Truck className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {isUnauthorized ? 'Sesión Expirada' : 'Error de Conexión'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          {isUnauthorized 
            ? 'Tu sesión ha caducado. Por favor inicia sesión nuevamente.' 
            : 'No pudimos cargar los proveedores. Intenta nuevamente más tarde.'}
        </p>
        {isUnauthorized && (
          <Button onClick={() => window.location.href = '/login'}>Ir al Login</Button>
        )}
      </div>
    )
  }

  const suppliers = suppliersData?.items || []
  const totalSuppliers = suppliersData?.total || 0
  const totalPages = Math.max(1, Math.ceil(totalSuppliers / 20))

  const columns = [
    {
      key: 'name',
      header: 'Proveedor',
      render: (item: Supplier) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 flex items-center justify-center">
            <Truck size={13} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white group text-sm">
              <span className="truncate">{item.name}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(item.name)
                toast.success('Nombre copiado para importación', { duration: 1500, icon: '📋' })
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary-500 hover:bg-primary-600 text-white text-[10px] px-2 py-0.5 rounded shadow-sm"
              title="Copiar nombre para Excel"
            >
              📋 Copiar
            </button>
            </div>
            <div className="text-xs text-gray-500 space-y-0.5">
              {item.cuit && <div>CUIT: {item.cuit}</div>}
              {item.contact_name && <div>Contacto: {item.contact_name}</div>}
            </div>
          </div>
        </div>
      ),
    },
    { 
      key: 'contact', 
      header: 'Contacto',
      render: (item: Supplier) => (
        <div className="space-y-1 text-xs">
          {item.phone && (
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Phone size={12} /> {item.phone}
            </div>
          )}
          {item.email && (
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Mail size={12} /> {item.email}
            </div>
          )}
          {!item.phone && !item.email && (
            <span className="text-gray-400">Sin datos</span>
          )}
        </div>
      )
    },
    {
      key: 'categories',
      header: 'Categorías',
      render: (item: Supplier) => {
        const supplierCategories = categories.filter(cat => 
          item.category_ids?.includes(cat.id)
        )
        if (supplierCategories.length === 0) return <span className="text-gray-400 text-xs">-</span>
        
        const displayCats = supplierCategories.slice(0, 2)
        const remaining = supplierCategories.length - 2
        
        return (
          <div className="flex flex-wrap gap-1">
            {displayCats.map(cat => (
              <span key={cat.id} className="text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full border border-primary-100 dark:border-primary-800">
                {cat.name}
              </span>
            ))}
            {remaining > 0 && (
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                +{remaining}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      render: (item: Supplier) => (
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
            onClick={() => handleDelete(item)}
            disabled={deleteMutation.isPending}
            title="Eliminar"
          >
            <Trash2 size={18} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="h-full min-h-0 w-full flex flex-col gap-3">
      {/* Header estilo Categorías */}
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary-50 to-primary-50 dark:from-primary-900/20 dark:to-primary-900/20 px-3 py-2.5 rounded-lg border border-primary-200 dark:border-primary-800">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-primary-900 dark:text-primary-100 flex items-center gap-2 leading-none">
            <Truck className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Proveedores
          </h1>
          <p className="text-xs text-primary-700 dark:text-primary-300 mt-1 truncate">
            Gestión compacta de proveedores, contactos y categorías
          </p>
        </div>

        <Button
          onClick={() => handleOpenModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white border-none shadow-md"
        >
          <Plus size={18} className="mr-2" />
          Nuevo Proveedor
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar por nombre, CUIT, contacto o email..."
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mostrando <span className="font-semibold text-gray-700 dark:text-gray-200">{suppliers.length}</span> de <span className="font-semibold text-gray-700 dark:text-gray-200">{totalSuppliers}</span>
          </p>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        {suppliers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 px-6">
            <Inbox className="h-8 w-8 mb-2 text-primary-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No hay proveedores para mostrar</p>
            <p className="text-xs mt-1">Probá con otro término de búsqueda o creá un proveedor nuevo.</p>
          </div>
        ) : (
          <Table
            columns={columns}
            data={suppliers}
            emptyMessage="No hay proveedores para los filtros actuales"
            density="compact"
          />
        )}
      </div>

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalSuppliers}
        onPageChange={setPage}
      />

      {/* Modal Mejorado con Tabs */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
        size="lg"
      >
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'general'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Información General
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'categories'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Categorías
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
                    placeholder="Ej: FV S.A."
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    CUIT
                  </label>
                  <Input
                    value={formData.cuit}
                    onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                    placeholder="30-..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Persona de Contacto
                  </label>
                  <Input
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    placeholder="Nombre del vendedor"
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
                <div>
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
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Dirección
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Calle, número, ciudad..."
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notas / Observaciones
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Condiciones de pago, días de entrega, etc..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab: Categories */}
          {activeTab === 'categories' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-primary-50 dark:bg-primary-900/10 p-4 rounded-xl border border-primary-100 dark:border-primary-800/30">
                <h3 className="text-sm font-semibold text-primary-900 dark:text-primary-100 mb-2">
                  Familias de Productos
                </h3>
                <p className="text-xs text-primary-700 dark:text-primary-300/70 mb-4">
                  Selecciona qué categorías de productos suministra este proveedor. Esto facilitará la carga de productos.
                </p>
                
                {Array.isArray(categories) && categories.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {categories.map((cat) => (
                      <label
                        key={cat.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                          formData.category_ids?.includes(cat.id)
                            ? 'bg-primary-100 border-primary-300 dark:bg-primary-900/40 dark:border-primary-700'
                            : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:border-primary-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.category_ids?.includes(cat.id) || false}
                          onChange={(e) => {
                            const currentIds = formData.category_ids || []
                            const newIds = e.target.checked
                              ? [...currentIds, cat.id]
                              : currentIds.filter(id => id !== cat.id)
                            setFormData({ ...formData, category_ids: newIds })
                          }}
                          className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {cat.name}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>No hay categorías creadas.</p>
                    <Button variant="ghost" onClick={() => window.location.href = '/categories'}>Ir a Categorías</Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-6 border-t border-gray-100 dark:border-gray-700 mt-6">
            <div className="text-xs text-gray-500">
              {activeTab === 'general' && 'Siguiente: Categorías'}
              {activeTab === 'categories' && 'Listo para guardar'}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }} type="button">
                Cancelar
              </Button>
              {activeTab !== 'categories' ? (
                <Button 
                  type="button" 
                  onClick={() => setActiveTab('categories')}
                >
                  Siguiente
                </Button>
              ) : (
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar Proveedor'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <DeleteSupplierModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setSupplierToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        supplierName={supplierToDelete?.name || ''}
      />
    </div>
  )
}
