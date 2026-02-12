/**
 * Servicio para facturación electrónica ARCA/AFIP.
 * Usa Afip SDK (https://afipsdk.com) para simplificar la integración.
 */
import httpClient from './httpClient'

export interface AfipSdkConfig {
  afipsdk_access_token_configured: boolean
  afip_cert_configured: boolean
  afip_key_configured: boolean
  arca_environment: string
  cuit: string | null
  sale_point: string | null
  business_name: string | null
  tax_condition: string | null
}

export interface AfipSdkConfigUpdate {
  afipsdk_access_token?: string
  afip_cert?: string
  afip_key?: string
  arca_environment?: string
}

export interface DiagnoseResponse {
  timestamp: string
  checks: Array<{
    name: string
    status: 'ok' | 'error' | 'warning'
    detail: string
    data?: any
  }>
  overall_status: 'ok' | 'error' | 'warning' | 'unknown'
}

export interface TestInvoiceResponse {
  success: boolean
  step: string
  message: string
  cae?: string
  cae_expiration?: string
  voucher_number?: number
  error?: string
  request_data?: any
  api_response?: any
}

export interface LastVoucherResponse {
  success: boolean
  lastVoucher?: number
  error?: string
}

export interface ServerStatusResponse {
  success: boolean
  status?: any
  error?: string
}

export interface EmitInvoiceRequest {
  voucher_id: string
}

export interface EmitInvoiceResponse {
  success: boolean
  message: string
  cae?: string
  cae_expiration?: string
  voucher_number?: string
  pdf_url?: string
  errors?: string[]
}

const arcaService = {
  /**
   * Obtiene la configuración actual de Afip SDK / ARCA
   */
  getConfig: async (businessId: string): Promise<AfipSdkConfig> => {
    const response = await httpClient.get(`/arca/config/${businessId}`)
    return response.data
  },

  /**
   * Actualiza el access_token y entorno de Afip SDK
   */
  updateConfig: async (
    businessId: string,
    config: AfipSdkConfigUpdate
  ): Promise<AfipSdkConfig> => {
    const response = await httpClient.put(`/arca/config/${businessId}`, config)
    return response.data
  },

  /**
   * Ejecuta un diagnóstico completo de la integración con ARCA
   */
  diagnose: async (businessId: string): Promise<DiagnoseResponse> => {
    const response = await httpClient.get(`/arca/diagnose/${businessId}`)
    return response.data
  },

  /**
   * Verifica el estado del servidor ARCA/AFIP
   */
  getServerStatus: async (businessId: string): Promise<ServerStatusResponse> => {
    const response = await httpClient.get(`/arca/server-status/${businessId}`)
    return response.data
  },

  /**
   * Envía una factura de prueba para verificar la integración
   */
  testInvoice: async (businessId: string): Promise<TestInvoiceResponse> => {
    const response = await httpClient.post(`/arca/test-invoice/${businessId}`)
    return response.data
  },

  /**
   * Obtiene el último número de comprobante emitido
   */
  getLastVoucher: async (
    businessId: string,
    salePoint: number = 1,
    voucherType: number = 6
  ): Promise<LastVoucherResponse> => {
    const response = await httpClient.get(
      `/arca/last-voucher/${businessId}?sale_point=${salePoint}&voucher_type=${voucherType}`
    )
    return response.data
  },

  /**
   * Obtiene los puntos de venta habilitados
   */
  getSalesPoints: async (businessId: string): Promise<any> => {
    const response = await httpClient.get(`/arca/sales-points/${businessId}`)
    return response.data
  },

  /**
   * Emite una factura electrónica real
   */
  emitInvoice: async (request: EmitInvoiceRequest): Promise<EmitInvoiceResponse> => {
    const response = await httpClient.post('/arca/emit-invoice', request)
    return response.data
  },
}

export default arcaService
