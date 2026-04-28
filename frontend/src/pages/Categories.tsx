/**
 * Página de Categorías.
 * Gestión de categorías de productos.
 */
import { useState } from 'react'
import { Plus, Edit, Trash2, FolderTree, Search, Layers, Inbox } from 'lucide-react'
import { Button, Table, Modal, Input } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import categoriesService, { CategoryCreate, CategoryUpdate, Category } from '../api/categoriesService'
import toast from 'react-hot-toast'
import DeleteCategoryModal from '../components/categories/DeleteCategoryModal'

export default function Categories() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)

  // Query para categorías
  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesService.getAll(),
    retry: false,
  })

  // Mutation para crear categoría
  const createMutation = useMutation({
    mutationFn: (data: CategoryCreate) => categoriesService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Categoría creada correctamente', { duration: 3000, icon: '✅' })
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Mutation para actualizar categoría
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CategoryUpdate }) =>
      categoriesService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Categoría actualizada correctamente', { duration: 3000, icon: '✅' })
      setShowModal(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Mutation para eliminar categoría
  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Categoría eliminada correctamente', { duration: 3000, icon: '🗑️' })
    },
    onError: (error: any) => {
      toast.error(formatErrorMessage(error))
    },
  })

  // Formulario
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '',
    description: '',
  })

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setFormData({ name: '', description: '' })
  }

  const handleOpenModal = (category?: Category) => {
    if (category) {
      setIsEditing(true)
      setEditingId(category.id)
      setFormData(category)
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
    const dataToSend: CategoryCreate = {
      name: formData.name!.trim(),
      description: formData.description?.trim(),
    }
    if (isEditing && editingId) {
      updateMutation.mutate({ id: editingId, data: dataToSend })
    } else {
      createMutation.mutate(dataToSend)
    }
  }

  const handleDelete = (category: Category) => {
    setCategoryToDelete(category)
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (categoryToDelete) {
      deleteMutation.mutate(categoryToDelete.id)
      setShowDeleteModal(false)
      setCategoryToDelete(null)
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
          <Layers className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {isUnauthorized ? 'Sesión Expirada' : 'Error de Conexión'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          {isUnauthorized 
            ? 'Tu sesión ha caducado. Por favor inicia sesión nuevamente.' 
            : 'No pudimos cargar las categorías. Intenta nuevamente más tarde.'}
        </p>
        {isUnauthorized && (
          <Button onClick={() => window.location.href = '/login'}>Ir al Login</Button>
        )}
      </div>
    )
  }

  // Filtrar categorías después de verificar errores
  const safeCategories = Array.isArray(categories) ? categories : []
  const filteredCategories = safeCategories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const columns = [
    {
      key: 'name',
      header: 'Nombre',
      render: (item: Category) => (
        <div className="flex items-center gap-2.5 group min-w-0">
          <div className="h-7 w-7 shrink-0 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 flex items-center justify-center">
            <FolderTree size={13} />
          </div>
          <span className="font-medium text-gray-900 dark:text-white truncate">{item.name}</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(item.name)
              toast.success('Nombre copiado para importación', { duration: 1500, icon: '📋' })
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity bg-primary-500 hover:bg-primary-600 text-white text-xs px-2 py-1 rounded shadow-sm ml-2"
            title="Copiar nombre para Excel"
          >
            📋 Copiar
          </button>
        </div>
      ),
    },
    { 
      key: 'description', 
      header: 'Descripción',
      render: (item: Category) => (
        <span className="text-gray-600 dark:text-gray-400">
          {item.description || '-'}
        </span>
      )
    },
    {
      key: 'actions',
      header: '',
      render: (item: Category) => (
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
      {/* Header con color azul */}
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-primary-50 to-primary-50 dark:from-primary-900/20 dark:to-primary-900/20 px-3 py-2.5 rounded-lg border border-primary-200 dark:border-primary-800">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-primary-900 dark:text-primary-100 flex items-center gap-2 leading-none">
            <FolderTree className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Categorías
          </h1>
          <p className="text-xs text-primary-700 dark:text-primary-300 mt-1 truncate">
            Organiza tu inventario por familias de productos
          </p>
        </div>
        <Button 
          onClick={() => handleOpenModal()}
          className="bg-primary-600 hover:bg-primary-700 text-white border-none shadow-md"
        >
          <Plus size={18} className="mr-2" />
          Nueva Categoría
        </Button>
      </div>

      {/* Barra de búsqueda */}
      <div className="bg-white dark:bg-gray-800 p-2.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar categorías..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        {filteredCategories.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 px-6">
            <Inbox className="h-8 w-8 mb-2 text-primary-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No hay categorías para mostrar</p>
            <p className="text-xs mt-1">Probá con otro término de búsqueda o creá una categoría nueva.</p>
          </div>
        ) : (
          <Table 
            columns={columns} 
            data={filteredCategories}
            emptyMessage="No se encontraron categorías."
            density="compact"
          />
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); resetForm(); }}
        title={isEditing ? 'Editar Categoría' : 'Nueva Categoría'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Grifería, Herramientas..."
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Descripción
            </label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Breve descripción de la categoría"
            />
          </div>

          <div className="flex justify-end gap-2 pt-6 border-t border-gray-100 dark:border-gray-700">
            <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }} type="button">
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar Categoría'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <DeleteCategoryModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setCategoryToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        categoryName={categoryToDelete?.name || ''}
      />
    </div>
  )
}
