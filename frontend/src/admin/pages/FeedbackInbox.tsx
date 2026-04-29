import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MoreHorizontal } from 'lucide-react'

import adminAPI, { FeedbackStatus } from '../../api/adminService'
import { Button, Input, Select, ResponsiveTable, Table } from '../../components/ui'

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const cardMenuRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!cardMenuRef.current) return
      if (!cardMenuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null)
      }
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)

    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

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
          <ResponsiveTable
            data={data?.items || []}
            emptyState={
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No hay feedback cargado.
              </div>
            }
            renderCard={(item: any) => {
              const typeBadge = item.feedback_type === 'bug'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              const statusBadge = item.status === 'done'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : item.status === 'rejected'
                  ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'

              return (
                <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.title}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{item.user_email || 'Usuario sin email'}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${typeBadge}`}>
                      {item.feedback_type}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusBadge}`}>
                      {STATUS_OPTIONS.find((opt) => opt.value === item.status)?.label || item.status}
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {new Date(item.created_at).toLocaleDateString('es-AR')}
                    </span>

                    <div className="ml-auto relative" ref={openMenuId === item.id ? cardMenuRef : null}>
                      <button
                        type="button"
                        onClick={() => setOpenMenuId((prev) => (prev === item.id ? null : item.id))}
                        className="rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        aria-label="Más acciones"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {openMenuId === item.id && (
                        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                          {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                updateMutation.mutate({ id: item.id, status: opt.value as FeedbackStatus })
                                setOpenMenuId(null)
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              Mover a: {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{item.description}</p>
                </article>
              )
            }}
            renderDesktop={() => (
              <Table
                columns={columns as any}
                data={data?.items || []}
                emptyMessage="No hay feedback cargado."
              />
            )}
          />
        )}
      </div>
    </div>
  )
}
