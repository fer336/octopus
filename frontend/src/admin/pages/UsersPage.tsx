/**
 * Gestión mínima de usuarios en CMS admin.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'

import adminAPI from '../../api/adminService'
import { ConfirmModal } from '../../components/ui'

function UserTableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 7 }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export default function UsersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    userId: string
    nextStatus: boolean
    actionLabel: string
  } | null>(null)
  const perPage = 20

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const usersQuery = useQuery({
    queryKey: ['admin-users', page, debouncedSearch],
    queryFn: () => adminAPI.listUsers(page, perPage, debouncedSearch || undefined),
  })

  useEffect(() => {
    if (usersQuery.error) {
      toast.error('Error al cargar usuarios', { id: 'admin-users-load-error' })
    }
  }, [usersQuery.error])

  const createMutation = useMutation({
    mutationFn: () =>
      adminAPI.createUser({
        email,
        password,
        ...(name.trim() ? { name } : {}),
      }),
    onSuccess: () => {
      toast.success('Usuario creado correctamente')
      setEmail('')
      setPassword('')
      setName('')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Error al crear usuario')
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminAPI.updateUserStatus(userId, isActive),
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? 'Usuario desbloqueado correctamente' : 'Usuario bloqueado correctamente')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Error al actualizar estado del usuario')
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('El email es obligatorio')
      return
    }
    if (!password.trim() || password.trim().length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    createMutation.mutate()
  }

  const users = usersQuery.data?.users ?? []
  const totalPages = usersQuery.data?.total_pages ?? 1
  const total = usersQuery.data?.total ?? 0

  const handleToggleStatus = (userId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus
    const actionLabel = nextStatus ? 'desbloquear' : 'bloquear'
    setPendingStatusChange({ userId, nextStatus, actionLabel })
  }

  const handleConfirmToggleStatus = () => {
    if (!pendingStatusChange) return

    statusMutation.mutate({
      userId: pendingStatusChange.userId,
      isActive: pendingStatusChange.nextStatus,
    })
    setPendingStatusChange(null)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Creá usuarios y buscá correos registrados para asignarlos a tenants
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Crear usuario</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="email"
            placeholder="Email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <input
            type="text"
            placeholder="Nombre (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <input
            type="password"
            placeholder="Contraseña *"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creando...' : 'Crear usuario'}
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="Buscar por email o nombre..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
                  Rol plataforma
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
                  Comercios
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
                  Creado
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            {usersQuery.isLoading ? (
              <UserTableSkeleton />
            ) : users.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {debouncedSearch
                      ? 'No se encontraron usuarios con ese criterio'
                      : 'No hay usuarios registrados'}
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{user.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{user.platform_role}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {user.is_active ? 'Activo' : 'Inactivo'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {user.businesses && user.businesses.length > 0
                        ? user.businesses.map((business) => business.name).join(', ')
                        : 'Sin asignación'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {new Date(user.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(user.id, user.is_active)}
                        disabled={statusMutation.isPending}
                        className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        {user.is_active ? 'Bloquear' : 'Desbloquear'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Mostrando {users.length} de {total} usuarios
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingStatusChange)}
        onClose={() => setPendingStatusChange(null)}
        onConfirm={handleConfirmToggleStatus}
        title="Confirmar cambio de estado"
        description={
          pendingStatusChange
            ? `¿Seguro que querés ${pendingStatusChange.actionLabel} este usuario?`
            : ''
        }
        confirmText="Confirmar"
        cancelText="Cancelar"
        variant="warning"
        isLoading={statusMutation.isPending}
      />
    </div>
  )
}
