/**
 * Servicio API para el panel de superadmin (CMS).
 * Gestiona tenants, secretos ARCA y branding.
 */
import httpClient, { getAdminApiUrl } from './httpClient'

const ADMIN_BASE = getAdminApiUrl()

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

export interface AdminUser {
  id: string
  email: string
  name: string
  platform_role: string
  is_active: boolean
  created_at: string
  businesses?: AdminUserBusiness[]
}

export interface AdminUserBusiness {
  id: string
  name: string
}

export interface AdminUserListResponse {
  users: AdminUser[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface CreateAdminUserPayload {
  email: string
  name?: string
  platform_role?: string
  is_active?: boolean
}

export interface UpdateAdminUserStatusPayload {
  is_active: boolean
}

export interface TenantUser extends AdminUser {
  membership_role: string
  access_starts_at: string | null
  access_ends_at: string | null
  access_status: 'active' | 'trial' | 'suspended' | 'expired'
  blocked_reason: string | null
  days_remaining: number | null
}

export interface TenantUserListResponse {
  users: TenantUser[]
  total: number
}

export interface AssignTenantUserPayload {
  email?: string
  user_id?: string
  role?: string
}

export interface AssignTenantUserResponse {
  user: TenantUser
  created: boolean
}

export interface ActivateTrialPayload {
  days?: number
}

export interface UpdateTenantUserAccessPayload {
  access_status: 'active' | 'suspended' | 'trial'
  blocked_reason?: string
  access_ends_at?: string
}

// ============================================================================
// API Service
// ============================================================================

const adminAPI = {
  // Tenants
  async listTenants(page = 1, perPage = 20, search?: string): Promise<TenantListResponse> {
    const response = await httpClient.get(`${ADMIN_BASE}/tenants`, {
      params: { page, per_page: perPage, ...(search && { search }) },
    })
    return response.data
  },

  // ARCA Secrets
  async getArcaSecrets(businessId: string): Promise<ArcaSecretsResponse> {
    const response = await httpClient.get(`${ADMIN_BASE}/tenants/${businessId}/arca-secrets`)
    return response.data
  },

  async updateArcaSecrets(businessId: string, data: ArcaSecretsUpdate): Promise<ArcaSecretsResponse> {
    const response = await httpClient.put(`${ADMIN_BASE}/tenants/${businessId}/arca-secrets`, data)
    return response.data
  },

  async deleteArcaSecrets(businessId: string): Promise<void> {
    await httpClient.delete(`${ADMIN_BASE}/tenants/${businessId}/arca-secrets`)
  },

  async testArcaConnection(businessId: string): Promise<ArcaTestResponse> {
    const response = await httpClient.post(`${ADMIN_BASE}/tenants/${businessId}/arca-test`)
    return response.data
  },

  // Branding
  async getBranding(businessId: string): Promise<BrandingResponse> {
    const response = await httpClient.get(`${ADMIN_BASE}/tenants/${businessId}/branding`)
    return response.data
  },

  async updateBranding(businessId: string, data: BrandingUpdate): Promise<BrandingResponse> {
    const response = await httpClient.put(`${ADMIN_BASE}/tenants/${businessId}/branding`, data)
    return response.data
  },

  // Users
  async listUsers(page = 1, perPage = 20, search?: string): Promise<AdminUserListResponse> {
    const response = await httpClient.get(`${ADMIN_BASE}/users`, {
      params: { page, per_page: perPage, ...(search && { search }) },
    })
    return response.data
  },

  async createUser(data: CreateAdminUserPayload): Promise<AdminUser> {
    const response = await httpClient.post(`${ADMIN_BASE}/users`, data)
    return response.data
  },

  async updateUserStatus(userId: string, is_active: boolean): Promise<AdminUser> {
    const payload: UpdateAdminUserStatusPayload = { is_active }
    const response = await httpClient.patch(`${ADMIN_BASE}/users/${userId}/status`, payload)
    return response.data
  },

  async listTenantUsers(businessId: string): Promise<TenantUserListResponse> {
    const response = await httpClient.get(`${ADMIN_BASE}/tenants/${businessId}/users`)
    return response.data
  },

  async assignUserToTenant(
    businessId: string,
    data: AssignTenantUserPayload,
  ): Promise<AssignTenantUserResponse> {
    const response = await httpClient.post(`${ADMIN_BASE}/tenants/${businessId}/users`, data)
    return response.data
  },

  async activateTenantUserTrial(
    businessId: string,
    userId: string,
    data: ActivateTrialPayload = { days: 30 },
  ): Promise<TenantUser> {
    const response = await httpClient.post(
      `${ADMIN_BASE}/tenants/${businessId}/users/${userId}/trial`,
      data,
    )
    return response.data
  },

  async updateTenantUserAccess(
    businessId: string,
    userId: string,
    data: UpdateTenantUserAccessPayload,
  ): Promise<TenantUser> {
    const response = await httpClient.patch(
      `${ADMIN_BASE}/tenants/${businessId}/users/${userId}/access`,
      data,
    )
    return response.data
  },
}

export default adminAPI
