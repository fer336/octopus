/**
 * Detalle de un tenant — muestra info general, branding y acceso a config ARCA.
 */
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import adminAPI, { type BrandingUpdate } from '../../api/adminService'

type Tab = 'general' | 'branding'

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
    </div>
  )
}
