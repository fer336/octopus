import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

import adminAPI, { FeedbackStatus } from '../../api/adminService'
import { Button, Input, Select, Table } from '../../components/ui'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'new', label: 'Nuevo' },
  { value: 'reviewing', label: 'En revisión' },
  { value: 'planned', label: 'Planificado' },
  { value: 'done', label: 'Resuelto' },
  { value: 'rejected', label: 'Descartado' },
]

export default function FeedbackInbox() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-feedback', search, statusFilter],
    queryFn: () =>
      adminAPI.listFeedback({
        q: search || undefined,
        status: (statusFilter || undefined) as FeedbackStatus | undefined,
        page: 1,
        per_page: 100,
      }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      adminAPI.updateFeedbackStatus(id, { status }),
    onSuccess: () => {
      toast.success('Estado actualizado')
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] })
    },
    onError: () => toast.error('No se pudo actualizar el estado'),
  })

  const columns = [
    {
      key: 'feedback_type',
      header: 'Tipo',
      render: (item: any) => (
        <span className="text-xs font-medium uppercase">{item.feedback_type}</span>
      ),
    },
    {
      key: 'title',
      header: 'Título',
      render: (item: any) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{item.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.description}</p>
        </div>
      ),
    },
    {
      key: 'user_email',
      header: 'Usuario',
      render: (item: any) => item.user_email || '—',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (item: any) => (
        <select
          value={item.status}
          onChange={(e) =>
            updateMutation.mutate({ id: item.id, status: e.target.value as FeedbackStatus })
          }
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
        >
          {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'created_at',
      header: 'Fecha',
      render: (item: any) => new Date(item.created_at).toLocaleString('es-AR'),
    },
  ]

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Feedback de usuarios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Bugs reportados y solicitudes de nuevas funcionalidades.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o detalle..."
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={STATUS_OPTIONS}
        />
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={() => { setSearch(''); setStatusFilter('') }}>
            Limpiar filtros
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-500">Cargando...</div>
        ) : (
          <Table
            columns={columns as any}
            data={data?.items || []}
            emptyMessage="No hay feedback cargado."
          />
        )}
      </div>
    </div>
  )
}
