/**
 * Componente de configuración de Facturación Electrónica ARCA/AFIP.
 * Usa Afip SDK para simplificar la integración.
 * Solo necesita: access_token + entorno (testing/production).
 */
import { useState, useEffect } from 'react'
import {
  Receipt,
  Key,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Stethoscope,
  TestTube2,
  Server,
  ExternalLink,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { Button, Input, Select } from '../ui'
import arcaService, {
  AfipSdkConfig,
  DiagnoseResponse,
  TestInvoiceResponse,
} from '../../api/arcaService'
import toast from 'react-hot-toast'

interface ARCAConfigurationProps {
  businessId: string
}

export default function ARCAConfiguration({ businessId }: ARCAConfigurationProps) {
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<AfipSdkConfig | null>(null)

  // Form states
  const [accessToken, setAccessToken] = useState('')
  const [afipCert, setAfipCert] = useState('')
  const [afipKey, setAfipKey] = useState('')
  const [environment, setEnvironment] = useState('testing')

  // Diagnóstico y testing
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResponse | null>(null)
  const [testingInvoice, setTestingInvoice] = useState(false)
  const [testResult, setTestResult] = useState<TestInvoiceResponse | null>(null)

  // Cargar configuración al montar
  useEffect(() => {
    loadConfig()
  }, [businessId])

  const loadConfig = async () => {
    try {
      const data = await arcaService.getConfig(businessId)
      setConfig(data)
      setEnvironment(data.arca_environment || 'testing')
    } catch (error) {
      console.error('Error al cargar configuración ARCA:', error)
    }
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()

    // Al menos un campo debe tener valor
    if (!accessToken && !afipCert && !afipKey) {
      toast.error('Ingresá al menos el Access Token, Certificado o Clave Privada')
      return
    }

    setLoading(true)
    try {
      const updateData: any = {}
      if (accessToken) updateData.afipsdk_access_token = accessToken
      if (afipCert) updateData.afip_cert = afipCert
      if (afipKey) updateData.afip_key = afipKey
      updateData.arca_environment = environment

      await arcaService.updateConfig(businessId, updateData)
      toast.success('Configuración guardada correctamente')
      setAccessToken('')
      setAfipCert('')
      setAfipKey('')
      loadConfig()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al guardar configuración')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = (
    setter: (val: string) => void,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setter(content)
      toast.success(`Archivo ${file.name} cargado`)
    }
    reader.readAsText(file)
  }

  const handleDiagnose = async () => {
    setDiagnosing(true)
    setDiagnoseResult(null)
    try {
      const result = await arcaService.diagnose(businessId)
      setDiagnoseResult(result)

      if (result.overall_status === 'ok') {
        toast.success('Diagnóstico completado: Todo está configurado correctamente')
      } else if (result.overall_status === 'error') {
        toast.error('Diagnóstico completado: Se encontraron errores')
      } else {
        toast('Diagnóstico completado: Hay advertencias')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al ejecutar diagnóstico')
      console.error('Error diagnóstico ARCA:', error)
    } finally {
      setDiagnosing(false)
    }
  }

  const handleTestInvoice = async () => {
    setTestingInvoice(true)
    setTestResult(null)
    try {
      const result = await arcaService.testInvoice(businessId)
      setTestResult(result)

      if (result.success) {
        toast.success(`¡Factura emitida! CAE: ${result.cae}`)
      } else {
        toast.error(`Error: ${result.message}`)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al enviar factura de prueba')
      console.error('Error test invoice:', error)
    } finally {
      setTestingInvoice(false)
    }
  }

  const getCheckStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
      case 'error':
        return <XCircle size={16} className="text-red-500 flex-shrink-0" />
      case 'warning':
        return <AlertCircle size={16} className="text-amber-500 flex-shrink-0" />
      default:
        return <Server size={16} className="text-gray-400 flex-shrink-0" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Configuración Afip SDK */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Key className="text-blue-600" size={20} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Afip SDK — Facturación Electrónica
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Obtené tu Access Token en{' '}
              <a
                href="https://afipsdk.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                afipsdk.com <ExternalLink size={12} />
              </a>
            </p>
          </div>
        </div>

        {/* Estado actual */}
        {config && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              {config.afipsdk_access_token_configured ? (
                <CheckCircle2 size={16} className="text-green-500" />
              ) : (
                <XCircle size={16} className="text-red-500" />
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Access Token: {config.afipsdk_access_token_configured ? 'Configurado ✓' : 'No configurado'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {config.afip_cert_configured ? (
                <CheckCircle2 size={16} className="text-green-500" />
              ) : (
                <XCircle size={16} className="text-red-500" />
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Certificado AFIP: {config.afip_cert_configured ? 'Configurado ✓' : 'No configurado'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {config.afip_key_configured ? (
                <CheckCircle2 size={16} className="text-green-500" />
              ) : (
                <XCircle size={16} className="text-red-500" />
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Clave Privada AFIP: {config.afip_key_configured ? 'Configurado ✓' : 'No configurado'}
              </span>
            </div>
            {config.cuit && (
              <p className="text-xs text-gray-600 dark:text-gray-300">
                <strong>CUIT:</strong> {config.cuit} · <strong>Razón Social:</strong> {config.business_name || '-'} · <strong>Condición IVA:</strong> {config.tax_condition || '-'}
              </p>
            )}
            <p className="text-xs text-gray-600 dark:text-gray-300">
              <strong>Punto de Venta:</strong> {config.sale_point || '0001'} · <strong>Entorno:</strong>{' '}
              {config.arca_environment === 'production' ? 'Producción' : 'Homologación (Testing)'}
            </p>
          </div>
        )}

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              Access Token de Afip SDK
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={config?.afipsdk_access_token_configured ? '••••••••••••••••' : 'Pegar access token...'}
              required
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Registrate gratis en{' '}
              <a href="https://afipsdk.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                afipsdk.com
              </a>{' '}
              para obtener tu token. Incluye 10 facturas gratis de prueba.
            </p>
          </div>

          {/* Certificado AFIP */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} />
                Certificado AFIP (.crt / .pem)
              </div>
            </label>
            <div className="flex gap-2">
              <textarea
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-xs min-h-[80px]"
                value={afipCert}
                onChange={(e) => setAfipCert(e.target.value)}
                placeholder={config?.afip_cert_configured ? 'Certificado ya configurado. Pegar nuevo para reemplazar...' : 'Pegar contenido del certificado PEM...'}
              />
              <label className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 cursor-pointer self-start transition-colors">
                <Upload size={14} />
                Archivo
                <input
                  type="file"
                  accept=".crt,.pem,.cer"
                  className="hidden"
                  onChange={(e) => handleFileUpload(setAfipCert, e)}
                />
              </label>
            </div>
          </div>

          {/* Clave Privada AFIP */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              <div className="flex items-center gap-2">
                <Key size={16} />
                Clave Privada AFIP (.key)
              </div>
            </label>
            <div className="flex gap-2">
              <textarea
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-xs min-h-[80px]"
                value={afipKey}
                onChange={(e) => setAfipKey(e.target.value)}
                placeholder={config?.afip_key_configured ? 'Clave ya configurada. Pegar nueva para reemplazar...' : 'Pegar contenido de la clave privada PEM...'}
              />
              <label className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 cursor-pointer self-start transition-colors">
                <Upload size={14} />
                Archivo
                <input
                  type="file"
                  accept=".key,.pem"
                  className="hidden"
                  onChange={(e) => handleFileUpload(setAfipKey, e)}
                />
              </label>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Opcional — Solo si tenés certificado propio de ARCA/AFIP. El Afip SDK puede gestionar la autenticación automáticamente.
            </p>
          </div>

          <Select
            label="Entorno"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            options={[
              { value: 'testing', label: 'Homologación (Testing)' },
              { value: 'production', label: 'Producción' },
            ]}
          />

          <Button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar Configuración'}
          </Button>
        </form>
      </div>

      {/* Panel de Diagnóstico y Testing */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Stethoscope className="text-purple-600" size={20} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Diagnóstico y Prueba
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Verificá la conexión con ARCA/AFIP y emití una factura de prueba.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={handleDiagnose}
            disabled={diagnosing}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors"
          >
            <Stethoscope size={16} />
            {diagnosing ? 'Diagnosticando...' : 'Ejecutar Diagnóstico'}
          </button>
          <button
            onClick={handleTestInvoice}
            disabled={testingInvoice}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 transition-colors"
          >
            <TestTube2 size={16} />
            {testingInvoice ? 'Emitiendo...' : 'Emitir Factura de Prueba'}
          </button>
        </div>

        {/* Resultados del Diagnóstico */}
        {diagnoseResult && (
          <div className="mt-4 space-y-3">
            <div
              className={`p-3 rounded-lg border ${
                diagnoseResult.overall_status === 'ok'
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : diagnoseResult.overall_status === 'error'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              }`}
            >
              <p className="text-sm font-semibold mb-1">
                Estado general:{' '}
                <span className="uppercase">
                  {diagnoseResult.overall_status === 'ok'
                    ? '✅ Todo OK'
                    : diagnoseResult.overall_status === 'error'
                    ? '❌ Errores encontrados'
                    : '⚠️ Advertencias'}
                </span>
              </p>
              <p className="text-xs text-gray-500">{diagnoseResult.timestamp}</p>
            </div>

            {diagnoseResult.checks.map((check, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                {getCheckStatusIcon(check.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {check.name}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 break-all">
                    {check.detail}
                  </p>
                  {check.data && (
                    <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto">
                      {typeof check.data === 'string'
                        ? check.data
                        : JSON.stringify(check.data, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resultados del Test de Factura */}
        {testResult && (
          <div className="mt-4">
            <div
              className={`p-4 rounded-lg border ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-2">
                {testResult.success ? (
                  <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    {testResult.success
                      ? '¡Factura de prueba emitida exitosamente!'
                      : `Error en paso: ${testResult.step}`}
                  </p>
                  <p className="text-sm mt-1">{testResult.message}</p>

                  {testResult.success && (
                    <div className="mt-3 p-3 bg-green-100 dark:bg-green-800/30 rounded-lg space-y-1">
                      <p className="text-sm font-mono">
                        <strong>CAE:</strong> {testResult.cae}
                      </p>
                      <p className="text-sm font-mono">
                        <strong>Vencimiento CAE:</strong> {testResult.cae_expiration}
                      </p>
                      <p className="text-sm font-mono">
                        <strong>Nro. Comprobante:</strong> {testResult.voucher_number}
                      </p>
                    </div>
                  )}

                  {testResult.error && (
                    <p className="text-xs text-red-700 dark:text-red-300 mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded font-mono break-all">
                      {testResult.error}
                    </p>
                  )}

                  {testResult.request_data && (
                    <details className="mt-3">
                      <summary className="text-xs font-medium cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                        Ver datos enviados
                      </summary>
                      <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto max-h-96 overflow-y-auto">
                        {JSON.stringify(testResult.request_data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info adicional */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex gap-3">
          <Receipt className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-blue-900 dark:text-blue-200">
            <p className="font-medium mb-1">¿Cómo funciona?</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-blue-800 dark:text-blue-300">
              <li>
                Registrate en{' '}
                <a href="https://afipsdk.com" target="_blank" rel="noopener noreferrer" className="underline">
                  afipsdk.com
                </a>{' '}
                (gratis, incluye 10 facturas de prueba)
              </li>
              <li>Copiá tu Access Token y pegalo arriba</li>
              <li>Seleccioná el entorno (Testing para probar, Producción para emitir facturas reales)</li>
              <li>Ejecutá el diagnóstico para verificar que todo esté bien</li>
              <li>Probá con una factura de prueba</li>
            </ol>
            <p className="mt-2 text-xs text-blue-700 dark:text-blue-400">
              <strong>Nota:</strong> Solo necesitás el Access Token. El Afip SDK gestiona automáticamente
              la autenticación con ARCA/AFIP. El certificado y clave son opcionales.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
