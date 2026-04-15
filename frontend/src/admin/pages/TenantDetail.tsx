/**
 * Detalle de un tenant — muestra info general, branding y acceso a config ARCA.
 */
import { Fragment, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Ban, Clock3, ShieldCheck, UserRoundCog } from 'lucide-react'
import adminAPI, { type BrandingUpdate } from '../../api/adminService'

type Tab = 'general' | 'branding' | 'features' | 'users'

const permissionModules: Array<{ key: string; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'sales', label: 'Ventas' },
  { key: 'vouchers', label: 'Comprobantes' },
  { key: 'payment_methods', label: 'Métodos de Pago' },
  { key: 'cash', label: 'Caja' },
  { key: 'products', label: 'Productos' },
  { key: 'price_update', label: 'Actualizar Precios' },
  { key: 'inventory', label: 'Inventario' },
  { key: 'clients', label: 'Clientes' },
  { key: 'suppliers', label: 'Proveedores' },
  { key: 'categories', label: 'Categorías' },
  { key: 'reports', label: 'Reportes' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'current_account', label: 'Cuenta Corriente' },
]

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
        {value || <span className="text-gray-400 italic">No configurado</span>}
      </dd>
    </div>
  )
}

function GeneralTab({ tenantId }: { tenantId: string }) {
  const { data: branding, isLoading } = useQuery({
    queryKey: ['admin-branding', tenantId],
    queryFn: () => adminAPI.getBranding(tenantId),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InfoField label="Nombre" value={branding?.name} />
        <InfoField label="CUIT" value={branding?.cuit} />
        <InfoField label="Condición Fiscal" value={branding?.tax_condition} />
        <InfoField label="Punto de Venta" value={branding?.sale_point} />
        <InfoField label="Email" value={branding?.email} />
        <InfoField label="Teléfono" value={branding?.phone} />
        <InfoField label="Dirección" value={branding?.address} />
        <InfoField label="Ciudad" value={branding?.city} />
        <InfoField label="Provincia" value={branding?.province} />
        <InfoField label="Código Postal" value={branding?.postal_code} />
        <InfoField label="Texto de Encabezado" value={branding?.header_text} />
        <InfoField label="Logo URL" value={branding?.logo_url} />
        <InfoField
          label="Entorno ARCA"
          value={
            branding?.arca_environment === 'produccion'
              ? 'Producción'
              : branding?.arca_environment === 'homologacion'
              ? 'Homologación'
              : 'No configurado'
          }
        />
      </dl>
    </div>
  )
}

function BrandingTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient()
  const { data: branding, isLoading } = useQuery({
    queryKey: ['admin-branding', tenantId],
    queryFn: () => adminAPI.getBranding(tenantId),
  })

  const [form, setForm] = useState<BrandingUpdate>({})

  const updateMutation = useMutation({
    mutationFn: (data: BrandingUpdate) => adminAPI.updateBranding(tenantId, data),
    onSuccess: () => {
      toast.success('Branding actualizado correctamente')
      queryClient.invalidateQueries({ queryKey: ['admin-branding', tenantId] })
      setForm({})
    },
    onError: () => {
      toast.error('Error al actualizar el branding')
    },
  })

  const handleChange = (field: keyof BrandingUpdate, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (Object.keys(form).length === 0) {
      toast.error('No hay cambios para guardar')
      return
    }
    updateMutation.mutate(form)
  }

  if (isLoading) {
    return <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
  }

  const fields: { key: keyof BrandingUpdate; label: string; type?: string; placeholder?: string }[] = [
    { key: 'name', label: 'Nombre del negocio' },
    { key: 'cuit', label: 'CUIT' },
    { key: 'tax_condition', label: 'Condición Fiscal' },
    { key: 'address', label: 'Dirección' },
    { key: 'city', label: 'Ciudad' },
    { key: 'province', label: 'Provincia' },
    { key: 'postal_code', label: 'Código Postal' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'logo_url', label: 'URL del Logo' },
    { key: 'header_text', label: 'Texto de Encabezado' },
    { key: 'sale_point', label: 'Punto de Venta' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {field.label}
            </label>
            <input
              type={field.type || 'text'}
              value={form[field.key] ?? (branding?.[field.key] as string) ?? ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder || field.label}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={() => setForm({})}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

function FeaturesTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient()
  const [linearApiKey, setLinearApiKey] = useState('')

  const flagsQuery = useQuery({
    queryKey: ['admin-feature-flags', tenantId],
    queryFn: () => adminAPI.getFeatureFlags(tenantId),
  })

  const linearSecretsQuery = useQuery({
    queryKey: ['admin-arca-secrets', tenantId],
    queryFn: () => adminAPI.getArcaSecrets(tenantId),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: {
      ai_agent_enabled?: boolean
      linear_sync_enabled?: boolean
      current_account_mode?: 'disabled' | 'automatic' | 'manual'
    }) =>
      adminAPI.updateFeatureFlags(tenantId, payload),
    onSuccess: (_, payload) => {
      if (typeof payload.ai_agent_enabled === 'boolean') {
        toast.success(payload.ai_agent_enabled ? 'Agente IA habilitado' : 'Agente IA deshabilitado')
      }
      if (typeof payload.linear_sync_enabled === 'boolean') {
        toast.success(
          payload.linear_sync_enabled
            ? 'Sync con Linear habilitada'
            : 'Sync con Linear deshabilitada',
        )
      }
      if (payload.current_account_mode) {
        const modeLabel =
          payload.current_account_mode === 'disabled'
            ? 'deshabilitada'
            : payload.current_account_mode === 'automatic'
              ? 'modo automático'
              : 'modo manual'
        toast.success(`Cuenta Corriente ${modeLabel}`)
      }
      queryClient.invalidateQueries({ queryKey: ['admin-feature-flags', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo actualizar la funcionalidad')
    },
  })

  const saveLinearKeyMutation = useMutation({
    mutationFn: (apiKey: string) =>
      adminAPI.updateArcaSecrets(tenantId, {
        linear_api_key: apiKey,
      }),
    onSuccess: () => {
      toast.success('Linear API Key guardada')
      setLinearApiKey('')
      queryClient.invalidateQueries({ queryKey: ['admin-arca-secrets', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo guardar la API Key de Linear')
    },
  })

  const currentEnabled = flagsQuery.data?.ai_agent_enabled ?? false
  const linearSyncEnabled = flagsQuery.data?.linear_sync_enabled ?? false
  const currentAccountMode = flagsQuery.data?.current_account_mode ?? 'disabled'
  const currentAccountEnabled = currentAccountMode !== 'disabled'
  const linearConfigured = Boolean(linearSecretsQuery.data?.secrets?.linear_api_key?.configured)
  const linearLast4 = linearSecretsQuery.data?.secrets?.linear_api_key?.last4

  if (flagsQuery.isLoading || linearSecretsQuery.isLoading) {
    return <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Agente IA</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Controla si el tenant puede usar los endpoints del asistente inteligente.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={currentEnabled}
            onClick={() => updateMutation.mutate({ ai_agent_enabled: !currentEnabled })}
            disabled={updateMutation.isPending}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
              currentEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                currentEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="mt-3">
          <span
            className={`inline-flex px-2 py-1 text-xs rounded-full ${
              currentEnabled
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {currentEnabled ? 'Habilitado' : 'Deshabilitado'}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Cuenta Corriente</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Define si el tenant puede usar el módulo y en qué modalidad opera.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={currentAccountEnabled}
            onClick={() =>
              updateMutation.mutate({
                current_account_mode: currentAccountEnabled ? 'disabled' : 'automatic',
              })
            }
            disabled={updateMutation.isPending}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
              currentAccountEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                currentAccountEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex px-2 py-1 text-xs rounded-full ${
              currentAccountEnabled
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {currentAccountEnabled ? `Habilitada (${currentAccountMode === 'automatic' ? 'Automático' : 'Manual'})` : 'Deshabilitada'}
          </span>
        </div>

        {currentAccountEnabled && (
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => updateMutation.mutate({ current_account_mode: 'automatic' })}
              disabled={updateMutation.isPending}
              className={`px-3 py-1.5 text-sm transition-colors ${
                currentAccountMode === 'automatic'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-primary-900/20'
              }`}
            >
              Modo automático
            </button>
            <button
              type="button"
              onClick={() => updateMutation.mutate({ current_account_mode: 'manual' })}
              disabled={updateMutation.isPending}
              className={`px-3 py-1.5 text-sm transition-colors border-l border-gray-200 dark:border-gray-700 ${
                currentAccountMode === 'manual'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-primary-900/20'
              }`}
            >
              Modo manual
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Sincronización con Linear</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Cuando está activa, cada feedback nuevo intenta crearse también como issue en Linear.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={linearSyncEnabled}
            onClick={() => updateMutation.mutate({ linear_sync_enabled: !linearSyncEnabled })}
            disabled={updateMutation.isPending}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
              linearSyncEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                linearSyncEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex px-2 py-1 text-xs rounded-full ${
              linearConfigured
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            }`}
          >
            {linearConfigured ? `API Key configurada (${linearLast4 ?? '****'})` : 'API Key no configurada'}
          </span>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Linear API Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={linearApiKey}
              onChange={(e) => setLinearApiKey(e.target.value)}
              placeholder="lin_api_xxxxx..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                if (!linearApiKey.trim()) {
                  toast.error('Ingresá una API Key válida')
                  return
                }
                saveLinearKeyMutation.mutate(linearApiKey.trim())
              }}
              disabled={saveLinearKeyMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {saveLinearKeyMutation.isPending ? 'Guardando...' : 'Guardar key'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function UsersTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [permissionsEditorUserId, setPermissionsEditorUserId] = useState<string | null>(null)

  const formatDate = (value?: string | null) => {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('es-AR')
  }

  const accessStatusLabel: Record<string, string> = {
    active: 'Activo',
    trial: 'Trial',
    suspended: 'Suspendido',
    expired: 'Vencido',
  }

  const usersQuery = useQuery({
    queryKey: ['admin-tenant-users', tenantId],
    queryFn: () => adminAPI.listTenantUsers(tenantId),
  })

  const flagsQuery = useQuery({
    queryKey: ['admin-feature-flags', tenantId],
    queryFn: () => adminAPI.getFeatureFlags(tenantId),
  })

  const currentAccountEnabled = (flagsQuery.data?.current_account_mode ?? 'disabled') !== 'disabled'
  const visiblePermissionModules = permissionModules.filter(
    (module) => module.key !== 'current_account' || currentAccountEnabled,
  )

  const assignMutation = useMutation({
    mutationFn: () => adminAPI.assignUserToTenant(tenantId, { email: email.trim() }),
    onSuccess: (data) => {
      toast.success(data.created ? 'Usuario asignado al tenant' : 'El usuario ya estaba asignado')
      setEmail('')
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-users', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Error al asignar usuario')
    },
  })

  const trialMutation = useMutation({
    mutationFn: (userId: string) => adminAPI.activateTenantUserTrial(tenantId, userId, { days: 30 }),
    onSuccess: () => {
      toast.success('Trial de 30 días activado')
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-users', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo activar el trial')
    },
  })

  const accessMutation = useMutation({
    mutationFn: ({ userId, accessStatus }: { userId: string; accessStatus: 'active' | 'suspended' }) =>
      adminAPI.updateTenantUserAccess(tenantId, userId, {
        access_status: accessStatus,
        blocked_reason: accessStatus === 'suspended' ? 'Suspendido desde CMS admin' : undefined,
      }),
    onSuccess: (_, variables) => {
      toast.success(variables.accessStatus === 'suspended' ? 'Membresía suspendida' : 'Membresía reactivada')
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-users', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo actualizar el acceso')
    },
  })

  const permissionsMutation = useMutation({
    mutationFn: ({ userId, modulePermissions }: { userId: string; modulePermissions: Record<string, boolean> }) =>
      adminAPI.updateTenantUserPermissions(tenantId, userId, {
        module_permissions: modulePermissions,
      }),
    onSuccess: () => {
      toast.success('Permisos actualizados')
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-users', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudieron actualizar los permisos')
    },
  })

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Ingresá un email para asignar')
      return
    }
    assignMutation.mutate()
  }

  const users = usersQuery.data?.users ?? []

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
          Asignar usuario existente
        </h3>
        <form onSubmit={handleAssign} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email del usuario"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={assignMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {assignMutation.isPending ? 'Asignando...' : 'Asignar'}
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Usuarios del tenant</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Rol membresía
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Estado acceso
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Inicio acceso
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Vencimiento
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Días restantes
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            {usersQuery.isLoading ? (
              <tbody>
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Cargando usuarios...
                  </td>
                </tr>
              </tbody>
            ) : users.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No hay usuarios asignados a este tenant
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody>
                {users.map((user) => {
                  const isPermissionsEditorOpen = permissionsEditorUserId === user.id

                  return (
                    <Fragment key={user.id}>
                      <tr className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-white">{user.email}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{user.name}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{user.membership_role}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                          {user.is_active ? 'Activo' : 'Inactivo'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                          {accessStatusLabel[user.access_status] ?? user.access_status}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                          {formatDate(user.access_starts_at)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                          {formatDate(user.access_ends_at)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                          {user.days_remaining ?? '-'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => trialMutation.mutate(user.id)}
                              disabled={trialMutation.isPending || accessMutation.isPending}
                              title="Dar trial 30 días"
                              aria-label="Dar trial 30 días"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-500 text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                            >
                              <Clock3 size={15} />
                            </button>
                            {user.access_status === 'suspended' ? (
                              <button
                                type="button"
                                onClick={() => accessMutation.mutate({ userId: user.id, accessStatus: 'active' })}
                                disabled={trialMutation.isPending || accessMutation.isPending}
                                title="Reactivar acceso"
                                aria-label="Reactivar acceso"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-500 text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                              >
                                <ShieldCheck size={15} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => accessMutation.mutate({ userId: user.id, accessStatus: 'suspended' })}
                                disabled={trialMutation.isPending || accessMutation.isPending}
                                title="Suspender acceso"
                                aria-label="Suspender acceso"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-500 text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                              >
                                <Ban size={15} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setPermissionsEditorUserId((prev) => (prev === user.id ? null : user.id))
                              }
                              title="Editar permisos"
                              aria-label="Editar permisos"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-400 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              <UserRoundCog size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isPermissionsEditorOpen && (
                        <tr className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40">
                          <td colSpan={9} className="px-3 py-3">
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                                  Permisos por módulo · {user.email}
                                </h4>
                                <button
                                  type="button"
                                  onClick={() => setPermissionsEditorUserId(null)}
                                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                >
                                  Cerrar
                                </button>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-1.5">
                                {visiblePermissionModules.map((module) => {
                                  const checked = Boolean(user.module_permissions?.[module.key])
                                  return (
                                    <label
                                      key={module.key}
                                      className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 leading-tight"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                          const next = {
                                            ...(user.module_permissions || {}),
                                            [module.key]: e.target.checked,
                                          }
                                          permissionsMutation.mutate({
                                            userId: user.id,
                                            modulePermissions: next,
                                          })
                                        }}
                                        disabled={permissionsMutation.isPending}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                      />
                                      <span className="truncate">{module.label}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('general')

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-red-600">Tenant no especificado</p>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'Información General' },
    { key: 'branding', label: 'Branding Fiscal' },
    { key: 'features', label: 'Funcionalidades' },
    { key: 'users', label: 'Usuarios' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/tenants')}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2"
          >
            ← Volver a tenants
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Detalle del Tenant
          </h1>
        </div>
        <Link
          to={`/tenants/${id}/arca`}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          Configurar ARCA
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'general' && <GeneralTab tenantId={id} />}
      {activeTab === 'branding' && <BrandingTab tenantId={id} />}
      {activeTab === 'features' && <FeaturesTab tenantId={id} />}
      {activeTab === 'users' && <UsersTab tenantId={id} />}
    </div>
  )
}
