/**
 * Servicio API para el panel de superadmin (CMS).
 * Gestiona tenants, secretos ARCA y branding.
 */
import httpClient from './httpClient'

// ============================================================================
// Types
// ============================================================================

export interface Tenant {
  id: string
  name: string
  cuit: string
  tax_condition: string
  owner_email: string
  created_at: string
}

export interface TenantListResponse {
  tenants: Tenant[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface SecretStatus {
  configured: boolean
  last4: string | null
  type: string
}

export interface ArcaSecretsResponse {
  business_id: string
  secrets: Record<string, SecretStatus>
}

export interface ArcaSecretsUpdate {
  arca_token?: string
  arca_sign?: string
  arca_email?: string
  arca_cuit_representante?: string
  arca_environment?: string
  mrbot_email?: string
  mrbot_api_key?: string
  afipsdk_access_token?: string
  afip_cert?: string
  afip_key?: string
}

export interface ArcaTestResponse {
  success: boolean
  step: string
  message: string
  cae?: string | null
  cae_expiration?: string | null
  voucher_number?: string | null
  error?: string | null
}

export interface BrandingResponse {
  id: string
  name: string | null
  cuit: string | null
  tax_condition: string | null
  address: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  header_text: string | null
  sale_point: string | null
  arca_environment: string | null
}

export interface BrandingUpdate {
  name?: string
  cuit?: string
  tax_condition?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  logo_url?: string
  header_text?: string
  sale_point?: string
  arca_environment?: string
}

// ============================================================================
// API Service
// ============================================================================

const adminAPI = {
  // Tenants
  async listTenants(page = 1, perPage = 20, search?: string): Promise<TenantListResponse> {
    const response = await httpClient.get('/api/admin/tenants', {
      params: { page, per_page: perPage, ...(search && { search }) },
    })
    return response.data
  },

  // ARCA Secrets
  async getArcaSecrets(businessId: string): Promise<ArcaSecretsResponse> {
    const response = await httpClient.get(`/api/admin/tenants/${businessId}/arca-secrets`)
    return response.data
  },

  async updateArcaSecrets(businessId: string, data: ArcaSecretsUpdate): Promise<ArcaSecretsResponse> {
    const response = await httpClient.put(`/api/admin/tenants/${businessId}/arca-secrets`, data)
    return response.data
  },

  async deleteArcaSecrets(businessId: string): Promise<void> {
    await httpClient.delete(`/api/admin/tenants/${businessId}/arca-secrets`)
  },

  async testArcaConnection(businessId: string): Promise<ArcaTestResponse> {
    const response = await httpClient.post(`/api/admin/tenants/${businessId}/arca-test`)
    return response.data
  },

  // Branding
  async getBranding(businessId: string): Promise<BrandingResponse> {
    const response = await httpClient.get(`/api/admin/tenants/${businessId}/branding`)
    return response.data
  },

  async updateBranding(businessId: string, data: BrandingUpdate): Promise<BrandingResponse> {
    const response = await httpClient.put(`/api/admin/tenants/${businessId}/branding`, data)
    return response.data
  },
}

export default adminAPI
