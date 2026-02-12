/**
 * Página de Proveedores.
 * Gestión de proveedores con base de datos.
 */
import { useState } from 'react'
import { Plus, Edit, Trash2, Truck, Phone, Mail, MapPin, Tag, Search } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState<'general' | 'commercial' | 'categories'>('general')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  const [discountInput, setDiscountInput] = useState('')

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
    default_discount_1: 0,
    default_discount_2: 0,
    default_discount_3: 0,
    category_ids: [],
  })

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setDiscountInput('')
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
      default_discount_1: 0,
      default_discount_2: 0,
      default_discount_3: 0,
      category_ids: [],
    })
  }

  const handleOpenModal = (supplier?: Supplier) => {
    if (supplier) {
      setIsEditing(true)
      setEditingId(supplier.id)
      setFormData(supplier)
      
      // Reconstruir el string de descuentos
      const discounts = [
        supplier.default_discount_1,
        supplier.default_discount_2,
        supplier.default_discount_3
      ].filter(d => d > 0)
      setDiscountInput(discounts.join('+'))
    } else {
      resetForm()
    }
    setShowModal(true)
  }

  // Parsear descuentos en cadena (ej: "10+5+2")
  const parseDiscounts = (input: string): number[] => {
    if (!input.trim()) return []
    return input
      .split('+')
      .map(d => parseFloat(d.trim()))
      .filter(d => !isNaN(d) && d > 0 && d <= 100)
  }

  // Calcular descuento compuesto real
  const calculateCompoundDiscount = (discounts: number[]): number => {
    if (discounts.length === 0) return 0
    
    let price = 100
    discounts.forEach(discount => {
      price = price * (1 - discount / 100)
    })
    
    const totalDiscount = 100 - price
    return Math.round(totalDiscount * 100) / 100
  }

  const handleDiscountChange = (input: string) => {
    setDiscountInput(input)
    const discounts = parseDiscounts(input)
    
    setFormData(prev => ({
      ...prev,
      default_discount_1: discounts[0] || 0,
      default_discount_2: discounts[1] || 0,
      default_discount_3: discounts[2] || 0,
    }))
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
      default_discount_1: formData.default_discount_1 || 0,
      default_discount_2: formData.default_discount_2 || 0,
      default_discount_3: formData.default_discount_3 || 0,
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

  const columns = [
    {
      key: 'name',
      header: 'Proveedor',
      render: (item: Supplier) => (
        <div>
          <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
            <Truck size={16} className="text-blue-600" />
            {item.name}
          </div>
          {item.cuit && <div className="text-xs text-gray-500 ml-6">{item.cuit}</div>}
        </div>
      ),
    },
    { 
      key: 'contact', 
      header: 'Contacto',
      render: (item: Supplier) => (
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
              <span key={cat.id} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800">
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
      key: 'discounts',
      header: 'Bonif.',
      render: (item: Supplier) => {
        const discounts = [item.default_discount_1, item.default_discount_2, item.default_discount_3]
          .filter(d => d > 0)
        return discounts.length > 0 ? (
          <span className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 rounded text-xs font-medium">
            <Tag size={12} />
            {discounts.join('+')}%
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      render: (item: Supplier) => (
        <div className="flex gap-2 justify-end">
          <button
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Truck className="h-8 w-8 text-emerald-200" />
              Proveedores
            </h1>
            <p className="text-emerald-100 mt-2 text-lg">
              Gestiona tus relaciones comerciales y condiciones de compra
            </p>
          </div>
          <Button 
            onClick={() => handleOpenModal()} 
            className="bg-green-600 hover:bg-green-700 text-white border-2 border-green-400 shadow-lg font-semibold"
          >
            <Plus size={18} className="mr-2" />
            Nuevo Proveedor
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, CUIT..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Tabla */}
      <Table columns={columns} data={suppliers} />

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={Math.ceil((suppliersData?.total || 0) / 20)}
        totalItems={suppliersData?.total || 0}
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
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Información General
            </button>
            <button
              onClick={() => setActiveTab('commercial')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'commercial'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Condiciones Comerciales
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'categories'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
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
              </div>
            </div>
          )}

          {/* Tab: Commercial */}
          {activeTab === 'commercial' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Bonificaciones en Cadena
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300/70 mb-4">
                  Define los descuentos en cadena que este proveedor suele aplicar (ej: 10+5+2). 
                  Los descuentos se aplican uno sobre otro.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-emerald-800 dark:text-emerald-200 mb-1">
                      Bonificaciones (formato: 10+5+2)
                    </label>
                    <Input
                      type="text"
                      value={discountInput}
                      onChange={(e) => handleDiscountChange(e.target.value)}
                      placeholder="10+5+2"
                      className="text-center font-medium text-lg"
                    />
                  </div>
                  
                  {discountInput && (() => {
                    const discounts = parseDiscounts(discountInput)
                    if (discounts.length === 0) return null
                    
                    const compoundDiscount = calculateCompoundDiscount(discounts)
                    
                    return (
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-emerald-200 dark:border-emerald-700">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Descuento compuesto:</p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                              Sobre $100 → ${(100 * (1 - compoundDiscount / 100)).toFixed(2)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                              {compoundDiscount.toFixed(2)}%
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-500">total</p>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notas / Observaciones
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Condiciones de pago, días de entrega, etc..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Tab: Categories */}
          {activeTab === 'categories' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  Familias de Productos
                </h3>
                <p className="text-xs text-blue-700 dark:text-blue-300/70 mb-4">
                  Selecciona qué categorías de productos suministra este proveedor. Esto facilitará la carga de productos.
                </p>
                
                {Array.isArray(categories) && categories.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {categories.map((cat) => (
                      <label
                        key={cat.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                          formData.category_ids?.includes(cat.id)
                            ? 'bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700'
                            : 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700 hover:border-blue-200'
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
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
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
              {activeTab === 'general' && 'Siguiente: Condiciones Comerciales'}
              {activeTab === 'commercial' && 'Siguiente: Categorías'}
              {activeTab === 'categories' && 'Listo para guardar'}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }} type="button">
                Cancelar
              </Button>
              {activeTab !== 'categories' ? (
                <Button 
                  type="button" 
                  onClick={() => setActiveTab(activeTab === 'general' ? 'commercial' : 'categories')}
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
