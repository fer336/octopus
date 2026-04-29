/**
 * Lista de tenants — panel de superadmin para gestionar negocios del ERP.
 */
import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { MoreHorizontal, Pencil } from 'lucide-react'
import adminAPI, { type AdminUser, type CreateTenantPayload, type Tenant } from '../../api/adminService'
import { ResponsiveTable } from '../../components/ui'

const taxConditionOptions = [
  'Responsable Inscripto',
  'Monotributista',
  'Consumidor Final',
  'Exento',
]

const subscriptionStatusLabel: Record<string, string> = {
  active: 'Activo',
  suspended: 'Bloqueado',
  expired: 'Vencido',
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('es-AR')
}

function getTenantInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'TN'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function TenantRow({
  tenant,
  onDelete,
  onRenew,
  onToggleAccess,
}: {
  tenant: Tenant
  onDelete: (tenant: Tenant) => void
  onRenew: (tenant: Tenant) => void
  onToggleAccess: (tenant: Tenant) => void
}) {
  const navigate = useNavigate()
  const subscriptionStatus = tenant.subscription_status ?? 'active'
  const isBlocked = subscriptionStatus === 'suspended' || subscriptionStatus === 'expired'

  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
      onClick={() => navigate(`/tenants/${tenant.id}`)}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
        {tenant.name}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {tenant.cuit}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {tenant.tax_condition}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {tenant.owner_email}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        <span
          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
            isBlocked
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          }`}
        >
          {subscriptionStatusLabel[subscriptionStatus] ?? subscriptionStatus}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        <div className="leading-tight">
          <div>{tenant.subscription_days_remaining ?? '-'}</div>
          <div className="text-xs text-gray-400">vence {formatDate(tenant.subscription_ends_at)}</div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRenew(tenant)
            }}
            className="rounded-md border border-green-500 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-900/20"
          >
            Renovar 30d
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleAccess(tenant)
            }}
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              isBlocked
                ? 'border-primary-500 text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/20'
                : 'border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/20'
            }`}
          >
            {isBlocked ? 'Reactivar' : 'Bloquear'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/tenants/${tenant.id}/arca`)
            }}
            className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
          >
            Configurar ARCA
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(tenant)
            }}
            disabled={!tenant.can_delete}
            title={tenant.can_delete ? 'Eliminar comercio vacío' : 'No se puede eliminar: tiene datos cargados'}
            className="text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-red-400 dark:hover:text-red-300 dark:disabled:text-gray-600 font-medium"
          >
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  )
}

function TenantCard({
  tenant,
  onDelete,
  onRenew,
  onToggleAccess,
}: {
  tenant: Tenant
  onDelete: (tenant: Tenant) => void
  onRenew: (tenant: Tenant) => void
  onToggleAccess: (tenant: Tenant) => void
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const subscriptionStatus = tenant.subscription_status ?? 'active'
  const isBlocked = subscriptionStatus === 'suspended' || subscriptionStatus === 'expired'
  const businessTone = isBlocked
    ? {
        avatarBg: 'bg-gray-200 dark:bg-gray-700',
        avatarText: 'text-gray-700 dark:text-gray-200',
        dot: 'bg-gray-500',
      }
    : {
        avatarBg: 'bg-blue-100 dark:bg-blue-900/40',
        avatarText: 'text-blue-700 dark:text-blue-200',
        dot: 'bg-blue-500',
      }

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
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
    <article
      className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      onClick={() => navigate(`/tenants/${tenant.id}`)}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${businessTone.avatarBg} ${businessTone.avatarText}`}>
          {getTenantInitials(tenant.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{tenant.name}</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{tenant.owner_email || 'Sin owner'}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-purple-100 px-2 py-1 text-[11px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
          {tenant.tax_condition}
        </span>
        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
          isBlocked
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
        }`}>
          {subscriptionStatusLabel[subscriptionStatus] ?? subscriptionStatus}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          <span className={`h-2 w-2 rounded-full ${businessTone.dot}`} />
          1 comercio
        </span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          vence {formatDate(tenant.subscription_ends_at)}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/tenants/${tenant.id}`)
            }}
            className="rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            aria-label="Editar tenant"
            title="Editar tenant"
          >
            <Pencil size={14} />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((prev) => !prev)
              }}
              className="rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              aria-label="Más acciones"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRenew(tenant)
                    setMenuOpen(false)
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Renovar 30d
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleAccess(tenant)
                    setMenuOpen(false)
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {isBlocked ? 'Reactivar' : 'Bloquear'}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/tenants/${tenant.id}/arca`)
                    setMenuOpen(false)
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Configurar ARCA
                </button>
                <button
                  type="button"
                  disabled={!tenant.can_delete}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(tenant)
                    setMenuOpen(false)
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-900/20"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        CUIT {tenant.cuit} · {tenant.subscription_days_remaining ?? '-'} días restantes
      </div>

    </article>
  )
}

function TenantTableSkeleton() {
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

export default function TenantList() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isOwnerPickerOpen, setIsOwnerPickerOpen] = useState(false)
  const [ownerSearch, setOwnerSearch] = useState('')
  const [debouncedOwnerSearch, setDebouncedOwnerSearch] = useState('')
  const [form, setForm] = useState<CreateTenantPayload>({
    name: '',
    cuit: '',
    tax_condition: 'Monotributista',
  })
  const perPage = 20

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedOwnerSearch(ownerSearch), 250)
    return () => clearTimeout(timer)
  }, [ownerSearch])

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-tenants', page, debouncedSearch],
    queryFn: () => adminAPI.listTenants(page, perPage, debouncedSearch || undefined),
  })

  const ownerUsersQuery = useQuery({
    queryKey: ['admin-users-owner-search', debouncedOwnerSearch],
    queryFn: () => adminAPI.listUsers(1, 8, debouncedOwnerSearch),
    enabled: isCreateOpen && isOwnerPickerOpen && debouncedOwnerSearch.trim().length >= 2,
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateTenantPayload) => adminAPI.createTenant(payload),
    onSuccess: (tenant) => {
      toast.success(`Comercio creado: ${tenant.name}`)
      setIsCreateOpen(false)
      setIsOwnerPickerOpen(false)
      setOwnerSearch('')
      setForm({ name: '', cuit: '', tax_condition: 'Monotributista' })
      setPage(1)
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
    onError: (mutationError: any) => {
      const detail = mutationError?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo crear el comercio')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (tenantId: string) => adminAPI.deleteTenant(tenantId),
    onSuccess: (payload) => {
      toast.success(payload.message || 'Comercio eliminado')
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
    onError: (mutationError: any) => {
      const detail = mutationError?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo eliminar el comercio')
    },
  })

  const renewMutation = useMutation({
    mutationFn: (tenantId: string) => adminAPI.renewTenantSubscription(tenantId, { days: 30 }),
    onSuccess: (tenant) => {
      toast.success(`${tenant.name} renovado por 30 días`)
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
    onError: (mutationError: any) => {
      const detail = mutationError?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo renovar el comercio')
    },
  })

  const accessMutation = useMutation({
    mutationFn: ({ tenantId, blocked }: { tenantId: string; blocked: boolean }) =>
      adminAPI.updateTenantSubscriptionAccess(tenantId, {
        subscription_status: blocked ? 'suspended' : 'active',
        blocked_reason: blocked ? 'Bloqueado desde CMS por falta de pago' : undefined,
      }),
    onSuccess: (tenant) => {
      toast.success(
        tenant.subscription_status === 'suspended'
          ? `${tenant.name} bloqueado`
          : `${tenant.name} reactivado`,
      )
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
    onError: (mutationError: any) => {
      const detail = mutationError?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo actualizar el acceso')
    },
  })

  useEffect(() => {
    if (error) {
      toast.error('Error al cargar los tenants', { id: 'admin-tenants-load-error' })
    }
  }, [error])

  const tenants = data?.tenants ?? []
  const totalPages = data?.total_pages ?? 1
  const total = data?.total ?? 0

  const handleChange = (field: keyof CreateTenantPayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateTenant = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.cuit.trim()) {
      toast.error('Nombre y CUIT son obligatorios')
      return
    }

    const payload = Object.fromEntries(
      Object.entries(form)
        .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
        .filter(([, value]) => value !== '' && value != null),
    ) as CreateTenantPayload

    createMutation.mutate(payload)
  }

  const handleSelectOwner = (user: AdminUser) => {
    setOwnerSearch(user.email)
    setForm((prev) => ({ ...prev, owner_email: user.email }))
    setIsOwnerPickerOpen(false)
  }

  const handleDeleteTenant = (tenant: Tenant) => {
    if (!tenant.can_delete) {
      toast.error('Este comercio tiene datos cargados. No se puede eliminar manualmente.')
      return
    }

    const confirmed = window.confirm(
      `¿Eliminar el comercio "${tenant.name}"?\n\nSolo se permite si no tiene datos operativos cargados. Esta acción removerá accesos/configuración del tenant.`,
    )
    if (!confirmed) return

    deleteMutation.mutate(tenant.id)
  }

  const handleRenewTenant = (tenant: Tenant) => {
    renewMutation.mutate(tenant.id)
  }

  const handleToggleTenantAccess = (tenant: Tenant) => {
    const isBlocked = tenant.subscription_status === 'suspended' || tenant.subscription_status === 'expired'
    accessMutation.mutate({ tenantId: tenant.id, blocked: !isBlocked })
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Gestión de Tenants
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Creá comercios manualmente y después asignales usuarios. Nada se genera por login.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          + Crear nuevo comercio
        </button>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800/80">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                    Alta controlada
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-gray-950 dark:text-white">
                    Crear nuevo comercio
                  </h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    El comercio nace sin usuario si no completás owner. Después lo asignás desde la pestaña Usuarios.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false)
                    setIsOwnerPickerOpen(false)
                    setOwnerSearch('')
                    setForm({ name: '', cuit: '', tax_condition: 'Monotributista' })
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-white"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-5 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nombre del comercio *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Sanitarios Avenida"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    CUIT *
                  </label>
                  <input
                    type="text"
                    value={form.cuit}
                    onChange={(e) => handleChange('cuit', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="30-12345678-9"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Condición fiscal
                  </label>
                  <select
                    value={form.tax_condition ?? 'Monotributista'}
                    onChange={(e) => handleChange('tax_condition', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  >
                    {taxConditionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Owner inicial opcional
                  </label>
                  <div className="relative">
                    <div className="flex rounded-lg border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-primary-500 dark:border-gray-600 dark:bg-gray-800">
                      <input
                        type="email"
                        value={form.owner_email ?? ''}
                        readOnly
                        className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-gray-900 outline-none dark:text-white"
                        placeholder="Sin owner asignado"
                      />
                      {form.owner_email && (
                        <button
                          type="button"
                          onClick={() => {
                            setOwnerSearch('')
                            handleChange('owner_email', '')
                          }}
                          className="border-l border-gray-200 px-2 text-sm text-gray-400 hover:text-gray-700 dark:border-gray-700 dark:hover:text-gray-200"
                          aria-label="Limpiar owner seleccionado"
                        >
                          ×
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsOwnerPickerOpen((current) => !current)}
                        className="rounded-r-lg border-l border-gray-200 px-3 text-gray-600 transition hover:bg-gray-50 hover:text-gray-950 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                        aria-label="Buscar usuario owner"
                      >
                        🔎
                      </button>
                    </div>

                    {isOwnerPickerOpen && (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                        <div className="border-b border-gray-100 p-2 dark:border-gray-700">
                          <input
                            type="search"
                            autoFocus
                            value={ownerSearch}
                            onChange={(e) => setOwnerSearch(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                            placeholder="Buscar correo creado..."
                          />
                        </div>

                        <div className="max-h-52 overflow-y-auto py-1">
                          {debouncedOwnerSearch.trim().length < 2 ? (
                            <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                              Escribí al menos 2 caracteres para buscar usuarios.
                            </p>
                          ) : ownerUsersQuery.isLoading ? (
                            <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Buscando usuarios...</p>
                          ) : (ownerUsersQuery.data?.users ?? []).length > 0 ? (
                            ownerUsersQuery.data?.users.map((user) => (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => handleSelectOwner(user)}
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                <span className="block font-medium text-gray-900 dark:text-white">{user.email}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {user.name} · {user.businesses?.length ? `${user.businesses.length} comercio(s)` : 'Sin comercio'}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                              No hay usuarios con ese email. Crealo primero en Usuarios.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700">
                <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Datos de contacto opcionales
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <input
                    type="text"
                    value={form.address ?? ''}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Dirección"
                  />
                  <input
                    type="text"
                    value={form.city ?? ''}
                    onChange={(e) => handleChange('city', e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Ciudad"
                  />
                  <input
                    type="text"
                    value={form.province ?? ''}
                    onChange={(e) => handleChange('province', e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Provincia"
                  />
                  <input
                    type="text"
                    value={form.phone ?? ''}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Teléfono"
                  />
                  <input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Email comercial"
                  />
                  <input
                    type="text"
                    value={form.postal_code ?? ''}
                    onChange={(e) => handleChange('postal_code', e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Código postal"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false)
                    setIsOwnerPickerOpen(false)
                    setOwnerSearch('')
                    setForm({ name: '', cuit: '', tax_condition: 'Monotributista' })
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creando...' : 'Crear comercio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre de negocio..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="p-3 lg:p-0">
          <ResponsiveTable
            data={tenants}
            isLoading={isLoading}
            emptyState={
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {debouncedSearch
                  ? 'No se encontraron tenants con ese criterio de búsqueda'
                  : 'No hay tenants registrados'}
              </div>
            }
            renderCard={(tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onDelete={handleDeleteTenant}
                onRenew={handleRenewTenant}
                onToggleAccess={handleToggleTenantAccess}
              />
            )}
            renderDesktop={() => (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nombre</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">CUIT</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Condición Fiscal</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email Owner</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Estado pago</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Días restantes</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  {isLoading ? (
                    <TenantTableSkeleton />
                  ) : tenants.length === 0 ? (
                    <tbody>
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          {debouncedSearch
                            ? 'No se encontraron tenants con ese criterio de búsqueda'
                            : 'No hay tenants registrados'}
                        </td>
                      </tr>
                    </tbody>
                  ) : (
                    <tbody>
                      {tenants.map((tenant) => (
                        <TenantRow
                          key={tenant.id}
                          tenant={tenant}
                          onDelete={handleDeleteTenant}
                          onRenew={handleRenewTenant}
                          onToggleAccess={handleToggleTenantAccess}
                        />
                      ))}
                    </tbody>
                  )}
                </table>
              </div>
            )}
          />
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Mostrando {tenants.length} de {total} tenants
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
