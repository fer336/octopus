/**
 * Servicio API para el panel de superadmin (CMS).
 * Gestiona tenants, secretos ARCA y branding.
 */
import { adminHttpClient } from './httpClient'

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
  can_delete?: boolean
  subscription_status?: 'active' | 'suspended' | 'expired'
  subscription_starts_at?: string | null
  subscription_ends_at?: string | null
  subscription_days_remaining?: number | null
  subscription_blocked_reason?: string | null
}

export interface TenantListResponse {
  tenants: Tenant[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface CreateTenantPayload {
  name: string
  cuit: string
  tax_condition?: string
  owner_email?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
}

export interface DeleteTenantResponse {
  tenant_id: string
  deleted: boolean
  message: string
}

export interface RenewTenantSubscriptionPayload {
  days?: number
}

export interface UpdateTenantSubscriptionAccessPayload {
  subscription_status: 'active' | 'suspended'
  blocked_reason?: string
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
  afipsdk_access_token?: string
  afip_cert?: string
  afip_key?: string
  linear_api_key?: string
  evolution_api_key?: string
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
  hide_business_name_in_pdf: boolean
  logo_position: 'left' | 'center' | 'right'
  logo_display_mode: 'alongside_text' | 'replace_text'
  header_text: string | null
  sale_point: string | null
  electronic_sale_point: string | null
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
  hide_business_name_in_pdf?: boolean
  logo_position?: 'left' | 'center' | 'right'
  logo_display_mode?: 'alongside_text' | 'replace_text'
  header_text?: string
  sale_point?: string
  electronic_sale_point?: string
  arca_environment?: string
}

export interface FeatureFlagsResponse {
  business_id: string
  ai_agent_enabled: boolean
  linear_sync_enabled: boolean
  whatsapp_enabled?: boolean
  qr_scanner_enabled?: boolean
  current_account_mode: 'disabled' | 'automatic' | 'manual'
  invoicing_enabled: boolean
  receipts_enabled: boolean
  quotation_enabled: boolean
  inventory_enabled: boolean
  stockpile_enabled: boolean
  price_update_enabled: boolean
  reports_enabled: boolean
  sql_backup_enabled?: boolean
  srx_enabled?: boolean
  invoice_zero_stock_enabled: boolean
}

export interface FeatureFlagsUpdate {
  ai_agent_enabled?: boolean
  linear_sync_enabled?: boolean
  whatsapp_enabled?: boolean
  qr_scanner_enabled?: boolean
  current_account_mode?: 'disabled' | 'automatic' | 'manual'
  invoicing_enabled?: boolean
  receipts_enabled?: boolean
  quotation_enabled?: boolean
  inventory_enabled?: boolean
  stockpile_enabled?: boolean
  price_update_enabled?: boolean
  reports_enabled?: boolean
  sql_backup_enabled?: boolean
  srx_enabled?: boolean
  invoice_zero_stock_enabled?: boolean
}

export const AI_PROVIDERS = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  OPENROUTER: 'openrouter',
  ANTHROPIC: 'anthropic',
} as const

export type AIProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS]

export interface AIModelOption {
  id: string
  label: string
}

export interface AIProviderConfigResponse {
  id: string
  provider: AIProvider
  display_name: string | null
  api_key_last4: string | null
  api_key_configured: boolean
  default_model: string | null
  base_url: string | null
  is_active: boolean
  is_valid: boolean
  validated_at: string | null
  validation_error: string | null
}

export interface AIConfigSummaryResponse {
  providers: AIProviderConfigResponse[]
  active_provider: AIProvider | null
  active_model: string | null
}

export interface AIProviderUpsertPayload {
  api_key?: string
  default_model?: string
  base_url?: string
  display_name?: string
}

export interface AIProviderValidateResponse {
  provider: AIProvider
  is_valid: boolean
  message: string
  validated_at: string | null
  suggested_models: string[]
}

export interface AIProviderModelsResponse {
  provider: AIProvider
  models: AIModelOption[]
}

export type AIModelsCatalogResponse = Record<AIProvider, AIModelOption[]>

export type FeedbackType = 'bug' | 'feature'
export type FeedbackStatus = 'new' | 'reviewing' | 'planned' | 'done' | 'rejected'

export interface FeedbackTicket {
  id: string
  business_id: string
  user_id?: string | null
  user_email?: string | null
  feedback_type: FeedbackType
  title: string
  description: string
  status: FeedbackStatus
  source: string
  admin_note?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at: string
}

export interface PaginatedFeedbackResponse {
  items: FeedbackTicket[]
  total: number
  page: number
  per_page: number
  pages: number
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
  password: string
  name?: string
  platform_role?: string
  is_active?: boolean
}

export interface UpdateAdminUserStatusPayload {
  is_active: boolean
}

export interface TenantUser extends AdminUser {
  membership_role: string
  module_permissions: Record<string, boolean>
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

export interface UpdateTenantUserPermissionsPayload {
  module_permissions: Record<string, boolean>
}

// ============================================================================
// API Service
// ============================================================================

const adminAPI = {
  // Tenants
  async listTenants(page = 1, perPage = 20, search?: string): Promise<TenantListResponse> {
    const response = await adminHttpClient.get(`/tenants`, {
      params: { page, per_page: perPage, ...(search && { search }) },
    })
    return response.data
  },

  async createTenant(data: CreateTenantPayload): Promise<Tenant> {
    const response = await adminHttpClient.post(`/tenants`, data)
    return response.data
  },

  async deleteTenant(businessId: string): Promise<DeleteTenantResponse> {
    const response = await adminHttpClient.delete(`/tenants/${businessId}`)
    return response.data
  },

  async renewTenantSubscription(
    businessId: string,
    data: RenewTenantSubscriptionPayload = { days: 30 },
  ): Promise<Tenant> {
    const response = await adminHttpClient.post(`/tenants/${businessId}/subscription/renew`, data)
    return response.data
  },

  async updateTenantSubscriptionAccess(
    businessId: string,
    data: UpdateTenantSubscriptionAccessPayload,
  ): Promise<Tenant> {
    const response = await adminHttpClient.patch(`/tenants/${businessId}/subscription/access`, data)
    return response.data
  },

  // ARCA Secrets
  async getArcaSecrets(businessId: string): Promise<ArcaSecretsResponse> {
    const response = await adminHttpClient.get(`/tenants/${businessId}/arca-secrets`)
    return response.data
  },

  async updateArcaSecrets(businessId: string, data: ArcaSecretsUpdate): Promise<ArcaSecretsResponse> {
    const response = await adminHttpClient.put(`/tenants/${businessId}/arca-secrets`, data)
    return response.data
  },

  async deleteArcaSecrets(businessId: string): Promise<void> {
    await adminHttpClient.delete(`/tenants/${businessId}/arca-secrets`)
  },

  async testArcaConnection(businessId: string): Promise<ArcaTestResponse> {
    const response = await adminHttpClient.post(`/tenants/${businessId}/arca-test`)
    return response.data
  },

  // Branding
  async getBranding(businessId: string): Promise<BrandingResponse> {
    const response = await adminHttpClient.get(`/tenants/${businessId}/branding`)
    return response.data
  },

  async updateBranding(businessId: string, data: BrandingUpdate): Promise<BrandingResponse> {
    const response = await adminHttpClient.put(`/tenants/${businessId}/branding`, data)
    return response.data
  },

  async uploadBrandingLogo(businessId: string, file: File): Promise<BrandingResponse> {
    const formData = new FormData()
    formData.append('logo', file)
    const response = await adminHttpClient.post(`/tenants/${businessId}/branding/logo`, formData, {
      headers: { 'Content-Type': undefined },
    })
    return response.data
  },

  // Feature flags (premium)
  async getFeatureFlags(businessId: string): Promise<FeatureFlagsResponse> {
    const response = await adminHttpClient.get(`/tenants/${businessId}/features`)
    return response.data
  },

  async updateFeatureFlags(businessId: string, data: FeatureFlagsUpdate): Promise<FeatureFlagsResponse> {
    const response = await adminHttpClient.patch(`/tenants/${businessId}/features`, data)
    return response.data
  },

  // AI provider config
  async getTenantAIConfig(businessId: string): Promise<AIConfigSummaryResponse> {
    const response = await adminHttpClient.get(`/tenants/${businessId}/ai-config`)
    return response.data
  },

  async upsertTenantAIConfig(
    businessId: string,
    provider: AIProvider,
    data: AIProviderUpsertPayload,
  ): Promise<AIProviderConfigResponse> {
    const response = await adminHttpClient.put(`/tenants/${businessId}/ai-config/${provider}`, data)
    return response.data
  },

  async validateTenantAIProvider(
    businessId: string,
    provider: AIProvider,
  ): Promise<AIProviderValidateResponse> {
    const response = await adminHttpClient.post(`/tenants/${businessId}/ai-config/${provider}/validate`)
    return response.data
  },

  async activateTenantAIProvider(
    businessId: string,
    provider: AIProvider,
  ): Promise<AIProviderConfigResponse> {
    const response = await adminHttpClient.patch(`/tenants/${businessId}/ai-config/${provider}/activate`)
    return response.data
  },

  async deleteTenantAIProvider(businessId: string, provider: AIProvider): Promise<void> {
    await adminHttpClient.delete(`/tenants/${businessId}/ai-config/${provider}`)
  },

  async fetchTenantAIProviderModels(
    businessId: string,
    provider: AIProvider,
    data: AIProviderUpsertPayload,
  ): Promise<AIProviderModelsResponse> {
    const response = await adminHttpClient.post(`/tenants/${businessId}/ai-config/${provider}/fetch-models`, data)
    return response.data
  },

  async fetchTenantAIProviderModelsSaved(
    businessId: string,
    provider: AIProvider,
  ): Promise<AIProviderModelsResponse> {
    const response = await adminHttpClient.post(`/tenants/${businessId}/ai-config/${provider}/fetch-models-saved`)
    return response.data
  },

  async getTenantAIModelsCatalog(businessId: string): Promise<AIModelsCatalogResponse> {
    const response = await adminHttpClient.get(`/tenants/${businessId}/ai-config/models/catalog`)
    return response.data
  },

  // Feedback inbox
  async listFeedback(params?: {
    business_id?: string
    feedback_type?: FeedbackType
    status?: FeedbackStatus
    q?: string
    page?: number
    per_page?: number
  }): Promise<PaginatedFeedbackResponse> {
    const response = await adminHttpClient.get(`/feedback`, { params })
    return response.data
  },

  async updateFeedbackStatus(
    ticketId: string,
    data: { status: FeedbackStatus; admin_note?: string },
  ): Promise<FeedbackTicket> {
    const response = await adminHttpClient.patch(`/feedback/${ticketId}`, data)
    return response.data
  },

  // Users
  async listUsers(page = 1, perPage = 20, search?: string): Promise<AdminUserListResponse> {
    const response = await adminHttpClient.get(`/users`, {
      params: { page, per_page: perPage, ...(search && { search }) },
    })
    return response.data
  },

  async createUser(data: CreateAdminUserPayload): Promise<AdminUser> {
    const response = await adminHttpClient.post(`/users`, data)
    return response.data
  },

  async updateUserStatus(userId: string, is_active: boolean): Promise<AdminUser> {
    const payload: UpdateAdminUserStatusPayload = { is_active }
    const response = await adminHttpClient.patch(`/users/${userId}/status`, payload)
    return response.data
  },

  async listTenantUsers(businessId: string): Promise<TenantUserListResponse> {
    const response = await adminHttpClient.get(`/tenants/${businessId}/users`)
    return response.data
  },

  async assignUserToTenant(
    businessId: string,
    data: AssignTenantUserPayload,
  ): Promise<AssignTenantUserResponse> {
    const response = await adminHttpClient.post(`/tenants/${businessId}/users`, data)
    return response.data
  },

  async removeUserFromTenant(businessId: string, userId: string): Promise<void> {
    await adminHttpClient.delete(`/tenants/${businessId}/users/${userId}`)
  },

  async activateTenantUserTrial(
    businessId: string,
    userId: string,
    data: ActivateTrialPayload = { days: 30 },
  ): Promise<TenantUser> {
    const response = await adminHttpClient.post(
      `/tenants/${businessId}/users/${userId}/trial`,
      data,
    )
    return response.data
  },

  async updateTenantUserAccess(
    businessId: string,
    userId: string,
    data: UpdateTenantUserAccessPayload,
  ): Promise<TenantUser> {
    const response = await adminHttpClient.patch(
      `/tenants/${businessId}/users/${userId}/access`,
      data,
    )
    return response.data
  },

  async updateTenantUserPermissions(
    businessId: string,
    userId: string,
    data: UpdateTenantUserPermissionsPayload,
  ): Promise<TenantUser> {
    const response = await adminHttpClient.patch(
      `/tenants/${businessId}/users/${userId}/permissions`,
      data,
    )
    return response.data
  },
}

export default adminAPI
