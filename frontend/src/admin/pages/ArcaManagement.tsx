/**
 * Gestión de ARCA/AFIP para un tenant — configuración de facturación electrónica.
 * Incluye formulario de secretos, test de conexión y zona de peligro.
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import adminAPI, { type ArcaSecretsUpdate, type SecretStatus } from '../../api/adminService'

// ============================================================================
// Types
// ============================================================================

interface FormData {
  afipsdk_access_token: string
  afip_cert: string
  afip_key: string
  arca_environment: 'homologacion' | 'produccion' | ''
  arca_token: string
  arca_sign: string
  arca_email: string
  arca_cuit_representante: string
  mrbot_email: string
  mrbot_api_key: string
}

const initialFormData: FormData = {
  afipsdk_access_token: '',
  afip_cert: '',
  afip_key: '',
  arca_environment: '',
  arca_token: '',
  arca_sign: '',
  arca_email: '',
  arca_cuit_representante: '',
  mrbot_email: '',
  mrbot_api_key: '',
}

// ============================================================================
// Sub-components
// ============================================================================

function SecretField({
  label,
  field,
  value,
  status,
  onChange,
  type = 'password',
}: {
  label: string
  field: keyof FormData
  value: string
  status?: SecretStatus
  onChange: (field: keyof FormData, value: string) => void
  type?: string
}) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {status?.configured && (
          <span className="ml-2 text-xs text-green-600 dark:text-green-400">
            ✓ Configurado (...{status.last4})
          </span>
        )}
        {!status?.configured && (
          <span className="ml-2 text-xs text-gray-400">No configurado</span>
        )}
      </label>
      <div className="relative">
        <input
          type={type === 'password' && !show ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={status?.configured ? 'Dejar vacío para mantener actual' : `Ingresar ${label.toLowerCase()}`}
          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            tabIndex={-1}
          >
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
    </div>
  )
}

function CertificateField({
  label,
  field,
  value,
  status,
  onChange,
}: {
  label: string
  field: keyof FormData
  value: string
  status?: SecretStatus
  onChange: (field: keyof FormData, value: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {status?.configured && (
          <span className="ml-2 text-xs text-green-600 dark:text-green-400">
            ✓ Configurado (...{status.last4})
          </span>
        )}
        {!status?.configured && (
          <span className="ml-2 text-xs text-gray-400">No configurado</span>
        )}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={status?.configured ? 'Dejar vacío para mantener actual' : `Pegar contenido del ${label.toLowerCase()}`}
        rows={6}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
    </div>
  )
}

function StatusIndicator({ secrets }: { secrets: Record<string, SecretStatus> }) {
  const configuredCount = Object.values(secrets).filter((s) => s.configured).length
  const totalCount = Object.keys(secrets).length
  const allConfigured = configuredCount === totalCount

  return (
    <div
      className={`p-4 rounded-lg border ${
        allConfigured
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : configuredCount > 0
          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">
          {allConfigured ? '✅' : configuredCount > 0 ? '⚠️' : '❌'}
        </span>
        <div>
          <p
            className={`text-sm font-medium ${
              allConfigured
                ? 'text-green-800 dark:text-green-200'
                : configuredCount > 0
                ? 'text-yellow-800 dark:text-yellow-200'
                : 'text-red-800 dark:text-red-200'
            }`}
          >
            {allConfigured
              ? 'Todos los secretos configurados'
              : configuredCount > 0
              ? `${configuredCount} de ${totalCount} secretos configurados`
              : 'No hay secretos configurados'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {allConfigured
              ? 'La facturación electrónica está lista para usar'
              : 'Completá los campos necesarios para habilitar la facturación'}
          </p>
        </div>
      </div>
    </div>
  )
}

function TestResult({
  result,
}: {
  result: {
    success: boolean
    step: string
    message: string
    cae?: string | null
    cae_expiration?: string | null
    voucher_number?: string | null
    error?: string | null
  } | null
}) {
  if (!result) return null

  return (
    <div
      className={`mt-4 p-4 rounded-lg border ${
        result.success
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      }`}
    >
      <p
        className={`text-sm font-medium ${
          result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
        }`}
      >
        {result.message}
      </p>
      {result.success && result.cae && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <p>CAE: {result.cae}</p>
          {result.cae_expiration && <p>Vencimiento CAE: {result.cae_expiration}</p>}
          {result.voucher_number && <p>Número comprobante: {result.voucher_number}</p>}
        </div>
      )}
      {result.error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-mono">{result.error}</p>
      )}
    </div>
  )
}

function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function ArcaManagement() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormData>(initialFormData)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    step: string
    message: string
    cae?: string | null
    cae_expiration?: string | null
    voucher_number?: string | null
    error?: string | null
  } | null>(null)

  if (!id) {
    return (
      <div className="p-6">
        <p className="text-red-600">Tenant no especificado</p>
      </div>
    )
  }

  // Fetch secrets status
  const { data: secretsData, isLoading: isLoadingSecrets } = useQuery({
    queryKey: ['admin-arca-secrets', id],
    queryFn: () => adminAPI.getArcaSecrets(id),
  })

  // Update secrets mutation
  const updateMutation = useMutation({
    mutationFn: (data: ArcaSecretsUpdate) => adminAPI.updateArcaSecrets(id, data),
    onSuccess: () => {
      toast.success('Secretos ARCA actualizados correctamente')
      queryClient.invalidateQueries({ queryKey: ['admin-arca-secrets', id] })
      setForm(initialFormData)
    },
    onError: () => {
      toast.error('Error al actualizar los secretos')
    },
  })

  // Test connection mutation
  const testMutation = useMutation({
    mutationFn: () => adminAPI.testArcaConnection(id),
    onSuccess: (data) => {
      setTestResult(data)
      if (data.success) {
        toast.success('¡Conexión exitosa!')
      } else {
        toast.error('Error en la prueba de conexión')
      }
    },
    onError: () => {
      toast.error('Error al probar la conexión')
    },
  })

  // Delete secrets mutation
  const deleteMutation = useMutation({
    mutationFn: () => adminAPI.deleteArcaSecrets(id),
    onSuccess: () => {
      toast.success('Secretos eliminados correctamente')
      queryClient.invalidateQueries({ queryKey: ['admin-arca-secrets', id] })
      setShowDeleteConfirm(false)
    },
    onError: () => {
      toast.error('Error al eliminar los secretos')
    },
  })

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()

    // Only send non-empty fields
    const update: ArcaSecretsUpdate = {}
    for (const [key, value] of Object.entries(form)) {
      if (value && value.trim()) {
        update[key as keyof ArcaSecretsUpdate] = value
      }
    }

    if (Object.keys(update).length === 0) {
      toast.error('No hay cambios para guardar')
      return
    }

    updateMutation.mutate(update)
  }

  const handleTest = () => {
    setTestResult(null)
    testMutation.mutate()
  }

  const handleDelete = () => {
    deleteMutation.mutate()
  }

  const secrets = secretsData?.secrets ?? {}

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/tenants/${id}`)}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2"
        >
          ← Volver al tenant
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Gestión ARCA/AFIP
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configuración de facturación electrónica para el tenant
        </p>
      </div>

      {/* Status indicator */}
      {isLoadingSecrets ? (
        <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-6" />
      ) : (
        <div className="mb-6">
          <StatusIndicator secrets={secrets} />
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* ARCA SDK section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Credenciales ARCA SDK
          </h2>
          <div className="space-y-4">
            <SecretField
              label="Access Token"
              field="afipsdk_access_token"
              value={form.afipsdk_access_token}
              status={secrets.afipsdk_access_token}
              onChange={handleChange}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CertificateField
                label="Certificado AFIP (.crt)"
                field="afip_cert"
                value={form.afip_cert}
                status={secrets.afip_cert}
                onChange={handleChange}
              />
              <CertificateField
                label="Clave Privada AFIP (.key)"
                field="afip_key"
                value={form.afip_key}
                status={secrets.afip_key}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* ARCA WSAA section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Credenciales WSAA (ARCA)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SecretField
              label="Token ARCA"
              field="arca_token"
              value={form.arca_token}
              status={secrets.arca_token}
              onChange={handleChange}
            />
            <SecretField
              label="Sign ARCA"
              field="arca_sign"
              value={form.arca_sign}
              status={secrets.arca_sign}
              onChange={handleChange}
            />
            <SecretField
              label="Email ARCA"
              field="arca_email"
              value={form.arca_email}
              status={secrets.arca_email}
              onChange={handleChange}
            />
            <SecretField
              label="CUIT Representante"
              field="arca_cuit_representante"
              value={form.arca_cuit_representante}
              status={secrets.arca_cuit_representante}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* MrBot section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Credenciales MrBot
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SecretField
              label="Email MrBot"
              field="mrbot_email"
              value={form.mrbot_email}
              status={secrets.mrbot_email}
              onChange={handleChange}
            />
            <SecretField
              label="API Key MrBot"
              field="mrbot_api_key"
              value={form.mrbot_api_key}
              status={secrets.mrbot_api_key}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* Environment */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Entorno
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Entorno de facturación
            </label>
            <select
              value={form.arca_environment}
              onChange={(e) => handleChange('arca_environment', e.target.value)}
              className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Seleccionar entorno</option>
              <option value="homologacion">Homologación (testing)</option>
              <option value="produccion">Producción</option>
            </select>
            {secrets.arca_environment?.configured && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Entorno actual:{' '}
                {secrets.arca_environment.last4 === 'cion'
                  ? 'Homologación'
                  : secrets.arca_environment.last4 === 'ción'
                  ? 'Producción'
                  : secrets.arca_environment.last4}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testMutation.isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {testMutation.isPending ? 'Probando...' : 'Probar conexión'}
          </button>
          <button
            type="button"
            onClick={() => setForm(initialFormData)}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Limpiar formulario
          </button>
        </div>

        {/* Test result */}
        <TestResult result={testResult} />
      </form>

      {/* Danger zone */}
      <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-red-200 dark:border-red-800">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
          Zona de peligro
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Eliminar los secretos ARCA deshabilitará la facturación electrónica para este tenant.
          Esta acción no se puede deshacer.
        </p>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={deleteMutation.isPending}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar secretos ARCA'}
        </button>
      </div>

      {/* Confirmation modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Eliminar secretos ARCA"
        message="¿Estás seguro de que querés eliminar todos los secretos ARCA de este tenant? La facturación electrónica dejará de funcionar hasta que se vuelvan a configurar."
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
