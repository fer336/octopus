/**
 * Página de Marcas.
 * Gestión de marcas normalizadas para productos.
 */
import { useState } from 'react'
import { Plus, Edit, Trash2, Search, Tags, Inbox } from 'lucide-react'
import { Button, Table, Modal, Input, ResponsiveTable } from '../components/ui'
import { formatErrorMessage } from '../utils/errorHelpers'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import brandsService, { Brand, BrandCreate, BrandUpdate } from '../api/brandsService'
import toast from 'react-hot-toast'

export default function Brands() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<Brand>>({ name: '' })

  const { data, isLoading, error } = useQuery({
    queryKey: ['brands'],
    queryFn: () => brandsService.getAll({ per_page: 100 }),
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: (payload: BrandCreate) => brandsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      toast.success('Marca creada correctamente', { duration: 3000 })
      setShowModal(false)
      resetForm()
    },
    onError: (mutationError: unknown) => toast.error(formatErrorMessage(mutationError)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: BrandUpdate }) => brandsService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Marca actualizada correctamente', { duration: 3000 })
      setShowModal(false)
      resetForm()
    },
    onError: (mutationError: unknown) => toast.error(formatErrorMessage(mutationError)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => brandsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      toast.success('Marca eliminada correctamente', { duration: 3000 })
    },
    onError: (mutationError: unknown) => toast.error(formatErrorMessage(mutationError)),
  })

  const resetForm = () => {
    setIsEditing(false)
    setEditingId(null)
    setFormData({ name: '' })
  }

  const handleOpenModal = (brand?: Brand) => {
    if (brand) {
      setIsEditing(true)
      setEditingId(brand.id)
      setFormData(brand)
    } else {
      resetForm()
    }
    setShowModal(true)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const name = formData.name?.trim()
    if (!name) {
      toast.error('El nombre es obligatorio')
      return
    }

    const payload = { name }
    if (isEditing && editingId) {
      updateMutation.mutate({ id: editingId, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 rounded-full bg-red-50 p-4 dark:bg-red-900/20">
          <Tags className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Error de Conexión</h2>
        <p className="max-w-md text-gray-500 dark:text-gray-400">No pudimos cargar las marcas. Intentá nuevamente más tarde.</p>
      </div>
    )
  }

  const brands = data?.items ?? []
  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(search.toLowerCase())
  )

  const columns = [
    {
      key: 'name',
      header: 'Nombre',
      render: (item: Brand) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
            <Tags size={13} />
          </div>
          <span className="truncate font-medium text-gray-900 dark:text-white">{item.name}</span>
        </div>
      ),
    },
    {
      key: 'normalized_name',
      header: 'Nombre normalizado',
      render: (item: Brand) => <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{item.normalized_name}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (item: Brand) => (
        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30"
            onClick={() => handleOpenModal(item)}
            title="Editar"
          >
            <Edit size={18} />
          </button>
          <button
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:hover:bg-red-900/30"
            onClick={() => deleteMutation.mutate(item.id)}
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
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-primary-200 bg-gradient-to-r from-primary-50 to-primary-50 px-3 py-2.5 dark:border-primary-800 dark:from-primary-900/20 dark:to-primary-900/20">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold leading-none text-primary-900 dark:text-primary-100">
            <Tags className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Marcas
          </h1>
          <p className="mt-1 truncate text-xs text-primary-700 dark:text-primary-300">Normaliza marcas para evitar duplicados en productos</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="border-none bg-primary-600 text-white shadow-md hover:bg-primary-700">
          <Plus size={18} className="mr-2" />
          Nueva Marca
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar marcas..."
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ResponsiveTable
          data={filteredBrands}
          emptyState={
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              <Inbox className="mx-auto mb-2 h-7 w-7 text-primary-400" />
              <p className="font-medium text-gray-700 dark:text-gray-200">No hay marcas para mostrar</p>
              <p className="mt-1 text-xs">Probá con otro término de búsqueda o creá una marca nueva.</p>
            </div>
          }
          renderDesktop={() => (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <Table columns={columns} data={filteredBrands} emptyMessage="No se encontraron marcas." density="compact" />
            </div>
          )}
          renderCard={(item) => (
            <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.name}</h3>
                  <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">{item.normalized_name}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300" onClick={() => handleOpenModal(item)} title="Editar">
                    <Edit size={14} />
                  </button>
                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300" onClick={() => deleteMutation.mutate(item.id)} disabled={deleteMutation.isPending} title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </article>
          )}
        />
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm() }} title={isEditing ? 'Editar Marca' : 'Nueva Marca'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre *</label>
            <Input value={formData.name || ''} onChange={(event) => setFormData({ ...formData, name: event.target.value })} placeholder="Ej: FV, Ferrum, Peirano..." required autoFocus />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-6 dark:border-gray-700">
            <Button variant="outline" onClick={() => { setShowModal(false); resetForm() }} type="button">Cancelar</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : 'Guardar Marca'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
