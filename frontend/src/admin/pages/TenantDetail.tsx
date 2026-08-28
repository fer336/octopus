/**
 * Detalle de un tenant — muestra info general, branding y acceso a config ARCA.
 */
import { Fragment, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { CheckCircle2, Loader2, UserMinus, UserRoundCog } from 'lucide-react'
import adminAPI, {
  AI_PROVIDERS,
  type AIProviderUpsertPayload,
  type AdminUser,
  type BrandingUpdate,
  type FeatureFlagsUpdate,
} from '../../api/adminService'

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
  { key: 'purchases', label: 'Compras' },
  { key: 'stockpiles', label: 'Acopios' },
  { key: 'clients', label: 'Clientes' },
  { key: 'suppliers', label: 'Proveedores' },
  { key: 'categories', label: 'Categorías' },
  { key: 'reports', label: 'Reportes' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'current_account', label: 'Cuenta Corriente' },
  { key: 'profitability', label: 'Rentabilidad' },
  { key: 'srx', label: 'SRX-User' },
]

function getApiErrorDetail(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const detail = data.detail
        if (typeof detail === 'string') {
          return detail
        }
      }
    }
  }
  return fallback
}

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
        <InfoField label="Punto de Venta ARCA" value={branding?.electronic_sale_point} />
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
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => adminAPI.uploadBrandingLogo(tenantId, file),
    onSuccess: () => {
      toast.success('Logo subido correctamente')
      setLogoFile(null)
      queryClient.invalidateQueries({ queryKey: ['admin-branding', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo subir el logo')
    },
  })

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

  const handleBooleanChange = (field: keyof BrandingUpdate, value: boolean) => {
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

  type BrandingTextFieldKey =
    | 'name'
    | 'cuit'
    | 'tax_condition'
    | 'address'
    | 'city'
    | 'province'
    | 'postal_code'
    | 'phone'
    | 'email'
    | 'header_text'
    | 'sale_point'
    | 'electronic_sale_point'

  const fields: { key: BrandingTextFieldKey; label: string; type?: string; placeholder?: string }[] = [
    { key: 'name', label: 'Nombre del negocio' },
    { key: 'cuit', label: 'CUIT' },
    { key: 'tax_condition', label: 'Condición Fiscal' },
    { key: 'address', label: 'Dirección' },
    { key: 'city', label: 'Ciudad' },
    { key: 'province', label: 'Provincia' },
    { key: 'postal_code', label: 'Código Postal' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'header_text', label: 'Texto de Encabezado' },
    { key: 'sale_point', label: 'Punto de Venta (int.)' },
    { key: 'electronic_sale_point', label: 'Punto de Venta ARCA (fact. electrónica)' },
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

      <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Logo para PDFs</h4>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Subí un PNG/JPG/WebP para usar en facturas, cotizaciones, remitos y reportes.
          </p>
        </div>

        {branding?.logo_url ? (
          <div className="flex items-center gap-3">
            <img src={branding.logo_url} alt="Logo negocio" className="h-12 w-auto rounded border border-gray-200 dark:border-gray-700" />
            <a
              href={branding.logo_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary-600 hover:underline"
            >
              Ver logo actual
            </a>
          </div>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-300">No hay logo configurado.</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 dark:text-gray-200 file:mr-3 file:rounded-md file:border-0 file:bg-primary-100 file:px-3 file:py-2 file:text-primary-700 hover:file:bg-primary-200"
          />
          <button
            type="button"
            onClick={() => {
              if (!logoFile) {
                toast.error('Seleccioná un archivo de logo')
                return
              }
              uploadLogoMutation.mutate(logoFile)
            }}
            disabled={uploadLogoMutation.isPending}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {uploadLogoMutation.isPending ? 'Subiendo...' : 'Subir logo'}
          </button>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={(form.hide_business_name_in_pdf ?? branding?.hide_business_name_in_pdf) ?? false}
            onChange={(e) => handleBooleanChange('hide_business_name_in_pdf', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Ocultar nombre de empresa en PDFs cuando el logo ya lo incluye
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Posición del logo en PDF
            </label>
            <select
              value={(form.logo_position ?? branding?.logo_position ?? 'left') as 'left' | 'center' | 'right'}
              onChange={(e) =>
                handleChange(
                  'logo_position',
                  e.target.value as 'left' | 'center' | 'right',
                )
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="left">Izquierda</option>
              <option value="center">Centro</option>
              <option value="right">Derecha</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Relación logo / nombre
            </label>
            <select
              value={
                (form.logo_display_mode ?? branding?.logo_display_mode ?? 'alongside_text') as
                  | 'alongside_text'
                  | 'replace_text'
              }
              onChange={(e) =>
                handleChange(
                  'logo_display_mode',
                  e.target.value as 'alongside_text' | 'replace_text',
                )
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="alongside_text">Mostrar logo junto al nombre</option>
              <option value="replace_text">Logo reemplaza al nombre</option>
            </select>
          </div>
        </div>
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
  const [evolutionApiKey, setEvolutionApiKey] = useState('')
  const [openRouterApiKey, setOpenRouterApiKey] = useState('')
  const [openRouterModel, setOpenRouterModel] = useState('anthropic/claude-sonnet-4-6')
  const [openRouterModels, setOpenRouterModels] = useState<{ id: string; name: string; pricing: { prompt: string; completion: string } }[]>([])
  const [loadingORModels, setLoadingORModels] = useState(true)

  const flagsQuery = useQuery({
    queryKey: ['admin-feature-flags', tenantId],
    queryFn: () => adminAPI.getFeatureFlags(tenantId),
  })

  const linearSecretsQuery = useQuery({
    queryKey: ['admin-arca-secrets', tenantId],
    queryFn: () => adminAPI.getArcaSecrets(tenantId),
  })

  const aiConfigQuery = useQuery({
    queryKey: ['admin-ai-config', tenantId],
    queryFn: () => adminAPI.getTenantAIConfig(tenantId),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: FeatureFlagsUpdate) =>
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
      if (typeof payload.invoicing_enabled === 'boolean') {
        toast.success(payload.invoicing_enabled ? 'Facturación habilitada' : 'Facturación deshabilitada')
      }
      if (typeof payload.receipts_enabled === 'boolean') {
        toast.success(payload.receipts_enabled ? 'Remitos habilitados' : 'Remitos deshabilitados')
      }
      if (typeof payload.quotation_enabled === 'boolean') {
        toast.success(payload.quotation_enabled ? 'Cotizaciones habilitadas' : 'Cotizaciones deshabilitadas')
      }
      if (typeof payload.inventory_enabled === 'boolean') {
        toast.success(payload.inventory_enabled ? 'Inventario habilitado' : 'Inventario deshabilitado')
      }
      if (typeof payload.purchases_enabled === 'boolean') {
        toast.success(payload.purchases_enabled ? 'Compras habilitado' : 'Compras deshabilitado')
      }
      if (typeof payload.stockpile_enabled === 'boolean') {
        toast.success(payload.stockpile_enabled ? 'Acopio habilitado' : 'Acopio deshabilitado')
      }
      if (typeof payload.price_update_enabled === 'boolean') {
        toast.success(
          payload.price_update_enabled
            ? 'Actualización de precios habilitada'
            : 'Actualización de precios deshabilitada',
        )
      }
      if (typeof payload.wholesale_lists_enabled === 'boolean') {
        toast.success(
          payload.wholesale_lists_enabled
            ? 'Listas mayoristas habilitadas'
            : 'Listas mayoristas deshabilitadas',
        )
      }
      if (typeof payload.reports_enabled === 'boolean') {
        toast.success(payload.reports_enabled ? 'Reportes habilitados' : 'Reportes deshabilitados')
      }
      if (typeof payload.sql_backup_enabled === 'boolean') {
        toast.success(payload.sql_backup_enabled ? 'Backup SQL habilitado' : 'Backup SQL deshabilitado')
      }
      if (typeof payload.invoice_zero_stock_enabled === 'boolean') {
        toast.success(
          payload.invoice_zero_stock_enabled
            ? 'Venta con stock en cero habilitada'
            : 'Venta con stock en cero deshabilitada',
        )
      }
      if (typeof payload.whatsapp_enabled === 'boolean') {
        toast.success(payload.whatsapp_enabled ? 'WhatsApp habilitado' : 'WhatsApp deshabilitado')
      }
      if (typeof payload.qr_scanner_enabled === 'boolean') {
        toast.success(payload.qr_scanner_enabled ? 'Scanner QR habilitado' : 'Scanner QR deshabilitado')
      }
      if (typeof payload.srx_enabled === 'boolean') {
        toast.success(payload.srx_enabled ? 'SRX-User habilitado' : 'SRX-User deshabilitado')
      }
      if (typeof payload.profitability_enabled === 'boolean') {
        toast.success(payload.profitability_enabled ? 'Rentabilidad habilitada' : 'Rentabilidad deshabilitada')
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

  const saveEvolutionKeyMutation = useMutation({
    mutationFn: (apiKey: string) =>
      adminAPI.updateArcaSecrets(tenantId, {
        evolution_api_key: apiKey,
      }),
    onSuccess: () => {
      toast.success('Evolution API Key guardada')
      setEvolutionApiKey('')
      queryClient.invalidateQueries({ queryKey: ['admin-arca-secrets', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo guardar la API Key de Evolution')
    },
  })

  const saveAIConfigMutation = useMutation({
    mutationFn: async (payload: AIProviderUpsertPayload) => {
      await adminAPI.upsertTenantAIConfig(tenantId, AI_PROVIDERS.OPENROUTER, payload)
      await adminAPI.activateTenantAIProvider(tenantId, AI_PROVIDERS.OPENROUTER)
    },
    onSuccess: () => {
      toast.success('Configuración IA guardada')
      setOpenRouterApiKey('')
      queryClient.invalidateQueries({ queryKey: ['admin-ai-config', tenantId] })
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorDetail(error, 'No se pudo guardar la configuración IA'))
    },
  })

  const currentEnabled = flagsQuery.data?.ai_agent_enabled ?? false
  const linearSyncEnabled = flagsQuery.data?.linear_sync_enabled ?? false
  const whatsappEnabled = flagsQuery.data?.whatsapp_enabled ?? false
  const qrScannerEnabled = flagsQuery.data?.qr_scanner_enabled ?? false
  const currentAccountMode = flagsQuery.data?.current_account_mode ?? 'disabled'
  const currentAccountEnabled = currentAccountMode !== 'disabled'
  const invoicingEnabled = flagsQuery.data?.invoicing_enabled ?? true
  const receiptsEnabled = flagsQuery.data?.receipts_enabled ?? true
  const quotationEnabled = flagsQuery.data?.quotation_enabled ?? true
  const inventoryEnabled = flagsQuery.data?.inventory_enabled ?? true
  const purchasesEnabled = flagsQuery.data?.purchases_enabled ?? false
  const stockpileEnabled = flagsQuery.data?.stockpile_enabled ?? true
  const priceUpdateEnabled = flagsQuery.data?.price_update_enabled ?? true
  const wholesaleListsEnabled = flagsQuery.data?.wholesale_lists_enabled ?? false
  const reportsEnabled = flagsQuery.data?.reports_enabled ?? true
  const sqlBackupEnabled = flagsQuery.data?.sql_backup_enabled ?? false
  const srxEnabled = flagsQuery.data?.srx_enabled ?? false
  const profitabilityEnabled = flagsQuery.data?.profitability_enabled ?? true
  const invoiceZeroStockEnabled = flagsQuery.data?.invoice_zero_stock_enabled ?? false
  const linearConfigured = Boolean(linearSecretsQuery.data?.secrets?.linear_api_key?.configured)
  const linearLast4 = linearSecretsQuery.data?.secrets?.linear_api_key?.last4
  const openRouterConfig = aiConfigQuery.data?.providers.find(
    (config) => config.provider === AI_PROVIDERS.OPENROUTER,
  )

  useEffect(() => {
    fetch('https://openrouter.ai/api/v1/models')
      .then((r) => r.json())
      .then((json) => {
        const list = (json.data ?? []).filter((m: { id?: string; pricing?: unknown }) => m.id && m.pricing)
        list.sort((a: { pricing: { prompt: string } }, b: { pricing: { prompt: string } }) =>
          parseFloat(a.pricing.prompt) - parseFloat(b.pricing.prompt),
        )
        setOpenRouterModels(list)
      })
      .catch(() => null)
      .finally(() => setLoadingORModels(false))
  }, [])

  useEffect(() => {
    if (openRouterConfig?.default_model) {
      setOpenRouterModel(openRouterConfig.default_model)
    }
  }, [openRouterConfig])

  if (flagsQuery.isLoading || linearSecretsQuery.isLoading || aiConfigQuery.isLoading) {
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
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Configuración del proveedor IA
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              API key de OpenRouter para el agente IA. La key nunca se muestra en claro.
            </p>
          </div>

          {!currentEnabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              Primero habilitá Agente IA para poder guardar la configuración.
            </div>
          )}

          {openRouterConfig?.api_key_configured && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 size={14} />
              <span>
                Configurado · Key: ····{openRouterConfig.api_key_last4} · Modelo: {openRouterConfig.default_model}
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key{' '}
                <span className="text-xs text-gray-400 font-normal">(openrouter.ai/keys)</span>
              </label>
              <input
                type="password"
                value={openRouterApiKey}
                onChange={(e) => setOpenRouterApiKey(e.target.value)}
                disabled={!currentEnabled}
                placeholder={
                  openRouterConfig?.api_key_configured
                    ? `Dejar vacío para mantener la actual (····${openRouterConfig.api_key_last4})`
                    : 'sk-or-...'
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                Modelo
                {loadingORModels && <Loader2 size={12} className="animate-spin text-gray-400" />}
              </label>
              <select
                value={openRouterModel}
                onChange={(e) => setOpenRouterModel(e.target.value)}
                disabled={!currentEnabled || loadingORModels}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm disabled:opacity-60"
              >
                {openRouterModels.length > 0
                  ? openRouterModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — ${(parseFloat(m.pricing.prompt) * 1_000_000).toFixed(2)}/1M entrada / ${(parseFloat(m.pricing.completion) * 1_000_000).toFixed(2)}/1M salida
                      </option>
                    ))
                  : <option value={openRouterModel}>{openRouterModel}</option>
                }
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!openRouterConfig && !openRouterApiKey.trim()) {
                  toast.error('Ingresá una API key para crear la configuración')
                  return
                }
                saveAIConfigMutation.mutate({
                  api_key: openRouterApiKey.trim() || undefined,
                  default_model: openRouterModel,
                  base_url: 'https://openrouter.ai/api/v1',
                })
              }}
              disabled={!currentEnabled || saveAIConfigMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {saveAIConfigMutation.isPending ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Facturación</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Habilita emisión de facturas y operaciones fiscales.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={invoicingEnabled}
                onClick={() => updateMutation.mutate({ invoicing_enabled: !invoicingEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  invoicingEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    invoicingEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">SRX-User</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Facturación alternativa sin validez fiscal (Comprobante X).
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={srxEnabled}
                onClick={() => updateMutation.mutate({ srx_enabled: !srxEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  srxEnabled ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    srxEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Cotizaciones</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Permite generar presupuestos/cotizaciones desde Ventas.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={quotationEnabled}
                onClick={() => updateMutation.mutate({ quotation_enabled: !quotationEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  quotationEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    quotationEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Inventario</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Habilita el módulo de inventario y órdenes de pedido.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={inventoryEnabled}
                onClick={() => updateMutation.mutate({ inventory_enabled: !inventoryEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  inventoryEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    inventoryEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Compras</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Habilita el módulo de compras y facturas de proveedores.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={purchasesEnabled}
                onClick={() => updateMutation.mutate({ purchases_enabled: !purchasesEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  purchasesEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    purchasesEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Acopio</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Habilita el módulo de acopios/cuentas prepaid.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={stockpileEnabled}
                onClick={() => {
                  const nextValue = !stockpileEnabled
                  updateMutation.mutate(
                    nextValue
                      ? { stockpile_enabled: true, receipts_enabled: true }
                      : { stockpile_enabled: false },
                  )
                }}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  stockpileEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    stockpileEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Remitos</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Permite generar y operar remitos desde Ventas.
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Acopio y Cuenta Corriente dependen de Remitos. Si desactivás Remitos,
                  ambos módulos se deshabilitan automáticamente.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={receiptsEnabled}
                onClick={() => {
                  const nextValue = !receiptsEnabled
                  updateMutation.mutate(
                    nextValue
                      ? { receipts_enabled: true }
                      : {
                          receipts_enabled: false,
                          stockpile_enabled: false,
                          current_account_mode: 'disabled',
                        },
                  )
                }}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  receiptsEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    receiptsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Actualización de precios</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Activa el módulo de edición masiva de precios.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={priceUpdateEnabled}
                onClick={() => updateMutation.mutate({ price_update_enabled: !priceUpdateEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  priceUpdateEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    priceUpdateEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Listas de Precios Mayoristas</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Habilita la creación y gestión de listas de precios mayoristas con condiciones de pago personalizadas.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={wholesaleListsEnabled}
                onClick={() => updateMutation.mutate({ wholesale_lists_enabled: !wholesaleListsEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  wholesaleListsEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    wholesaleListsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Reportes</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Habilita la sección de reportes y exportaciones.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={reportsEnabled}
                onClick={() => updateMutation.mutate({ reports_enabled: !reportsEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  reportsEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    reportsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Rentabilidad</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Muestra márgenes, costos y rentabilidad por producto, cliente y período.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={profitabilityEnabled}
                onClick={() => updateMutation.mutate({ profitability_enabled: !profitabilityEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  profitabilityEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    profitabilityEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Backup SQL</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Permite exportar e importar la base de datos completa del tenant en formato SQL.
                  Funcionalidad premium.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={sqlBackupEnabled}
                onClick={() => updateMutation.mutate({ sql_backup_enabled: !sqlBackupEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  sqlBackupEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    sqlBackupEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="mt-3">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  sqlBackupEnabled
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {sqlBackupEnabled ? 'Habilitado (Premium)' : 'Deshabilitado'}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Venta con stock en cero</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Permite emitir comprobantes aunque el stock del producto sea cero o negativo.
                  Útil para negocios que no gestionan el stock con precisión.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={invoiceZeroStockEnabled}
                onClick={() => updateMutation.mutate({ invoice_zero_stock_enabled: !invoiceZeroStockEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  invoiceZeroStockEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    invoiceZeroStockEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="mt-3">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  invoiceZeroStockEnabled
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {invoiceZeroStockEnabled ? 'Habilitado' : 'Deshabilitado'}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Scanner QR</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Habilita el scanner de QR en la versión móvil y la generación de QR en productos.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={qrScannerEnabled}
                onClick={() => updateMutation.mutate({ qr_scanner_enabled: !qrScannerEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  qrScannerEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    qrScannerEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">WhatsApp (Evolution API)</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Habilita el envío de documentos por WhatsApp desde la sección de ventas.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={whatsappEnabled}
                onClick={() => updateMutation.mutate({ whatsapp_enabled: !whatsappEnabled })}
                disabled={updateMutation.isPending}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                  whatsappEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    whatsappEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex px-2 py-1 text-xs rounded-full ${
                  linearSecretsQuery.data?.secrets?.evolution_api_key?.configured
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                }`}
              >
                {linearSecretsQuery.data?.secrets?.evolution_api_key?.configured
                  ? `API Key configurada (${linearSecretsQuery.data.secrets.evolution_api_key.last4 ?? '****'})`
                  : 'API Key no configurada'}
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Evolution API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={evolutionApiKey}
                  onChange={(e) => setEvolutionApiKey(e.target.value)}
                  placeholder="Ingresá la API Key de Evolution..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!evolutionApiKey.trim()) {
                      toast.error('Ingresá una API Key válida')
                      return
                    }
                    saveEvolutionKeyMutation.mutate(evolutionApiKey.trim())
                  }}
                  disabled={saveEvolutionKeyMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saveEvolutionKeyMutation.isPending ? 'Guardando...' : 'Guardar key'}
                </button>
              </div>
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
                    ...(currentAccountEnabled ? {} : { receipts_enabled: true }),
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
                  onClick={() => updateMutation.mutate({ current_account_mode: 'automatic', receipts_enabled: true })}
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
                  onClick={() => updateMutation.mutate({ current_account_mode: 'manual', receipts_enabled: true })}
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
    </div>
  )
}

function UsersTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('')
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false)
  const [role, setRole] = useState<'owner' | 'manager' | 'seller'>('seller')
  const [permissionsEditorUserId, setPermissionsEditorUserId] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUserSearch(userSearch), 250)
    return () => clearTimeout(timer)
  }, [userSearch])

  const usersQuery = useQuery({
    queryKey: ['admin-tenant-users', tenantId],
    queryFn: () => adminAPI.listTenantUsers(tenantId),
  })

  const flagsQuery = useQuery({
    queryKey: ['admin-feature-flags', tenantId],
    queryFn: () => adminAPI.getFeatureFlags(tenantId),
  })

  const userSearchQuery = useQuery({
    queryKey: ['admin-users-tenant-assign-search', tenantId, debouncedUserSearch],
    queryFn: () => adminAPI.listUsers(1, 8, debouncedUserSearch),
    enabled: isUserPickerOpen && debouncedUserSearch.trim().length >= 2,
  })

  const currentAccountEnabled = (flagsQuery.data?.current_account_mode ?? 'disabled') !== 'disabled'
  const reportsEnabled = flagsQuery.data?.reports_enabled ?? true
  const priceUpdateEnabled = flagsQuery.data?.price_update_enabled ?? true
  const visiblePermissionModules = permissionModules.filter((module) => {
    if (module.key === 'current_account') {
      return currentAccountEnabled
    }
    if (module.key === 'reports') {
      return reportsEnabled
    }
    if (module.key === 'price_update') {
      return priceUpdateEnabled
    }
    return true
  })

  const assignMutation = useMutation({
    mutationFn: () => adminAPI.assignUserToTenant(tenantId, { email: email.trim(), role }),
    onSuccess: (data) => {
      toast.success(data.created ? 'Usuario asignado al tenant' : 'El usuario ya estaba asignado')
      setEmail('')
      setUserSearch('')
      setIsUserPickerOpen(false)
      setRole('seller')
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-users', tenantId] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Error al asignar usuario')
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

  const removeUserMutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) => adminAPI.removeUserFromTenant(tenantId, userId),
    onSuccess: () => {
      toast.success('Usuario quitado del comercio')
      setPermissionsEditorUserId(null)
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-users', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'No se pudo quitar el usuario del comercio')
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

  const handleSelectUser = (user: AdminUser) => {
    setEmail(user.email)
    setUserSearch(user.email)
    setIsUserPickerOpen(false)
  }

  const handleRemoveUser = (user: AdminUser) => {
    const confirmed = window.confirm(
      `¿Quitar a ${user.email} de este comercio?\n\nLa cuenta del usuario NO se elimina globalmente; solo pierde acceso a este tenant.`,
    )

    if (!confirmed) return
    removeUserMutation.mutate({ userId: user.id })
  }

  const users = usersQuery.data?.users ?? []

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
          Asignar usuario existente
        </h3>
        <form onSubmit={handleAssign} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="flex rounded-lg border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-primary-500 dark:border-gray-600 dark:bg-gray-800">
              <input
                type="email"
                value={email}
                readOnly
                placeholder="Seleccionar usuario existente"
                className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-gray-900 outline-none dark:text-white"
              />
              {email && (
                <button
                  type="button"
                  onClick={() => {
                    setEmail('')
                    setUserSearch('')
                  }}
                  className="border-l border-gray-200 px-2 text-sm text-gray-400 hover:text-gray-700 dark:border-gray-700 dark:hover:text-gray-200"
                  aria-label="Limpiar usuario seleccionado"
                >
                  ×
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsUserPickerOpen((current) => !current)}
                className="rounded-r-lg border-l border-gray-200 px-3 text-gray-600 transition hover:bg-gray-50 hover:text-gray-950 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                aria-label="Buscar usuario para asignar"
              >
                🔎
              </button>
            </div>

            {isUserPickerOpen && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                <div className="border-b border-gray-100 p-2 dark:border-gray-700">
                  <input
                    type="search"
                    autoFocus
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                    placeholder="Buscar correo creado..."
                  />
                </div>

                <div className="max-h-52 overflow-y-auto py-1">
                  {debouncedUserSearch.trim().length < 2 ? (
                    <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                      Escribí al menos 2 caracteres para buscar usuarios.
                    </p>
                  ) : userSearchQuery.isLoading ? (
                    <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Buscando usuarios...</p>
                  ) : (userSearchQuery.data?.users ?? []).length > 0 ? (
                    userSearchQuery.data?.users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
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
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'owner' | 'manager' | 'seller')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="seller">Vendedor</option>
            <option value="manager">Encargado</option>
            <option value="owner">Owner</option>
          </select>
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
                  Acciones
                </th>
              </tr>
            </thead>
            {usersQuery.isLoading ? (
              <tbody>
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Cargando usuarios...
                  </td>
                </tr>
              </tbody>
            ) : users.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
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
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
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
                            <button
                              type="button"
                              onClick={() => handleRemoveUser(user)}
                              disabled={removeUserMutation.isPending}
                              title="Quitar del comercio"
                              aria-label="Quitar del comercio"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              <UserMinus size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isPermissionsEditorOpen && (
                        <tr className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40">
                          <td colSpan={5} className="px-3 py-3">
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
      <div className="p-3 sm:p-6">
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
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
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
          className="inline-flex w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 sm:w-auto"
        >
          Configurar ARCA
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex gap-4 overflow-x-auto whitespace-nowrap pb-1">
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
