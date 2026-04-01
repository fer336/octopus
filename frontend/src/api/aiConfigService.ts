/**
 * Servicio para gestionar la configuración de proveedores IA.
 * Las API keys NUNCA se devuelven en texto plano — solo api_key_last4.
 */
import httpClient from './httpClient'

// ─────────────────────────────────────────────────────────────
// Tipos — alineados con el contrato real del backend
// ─────────────────────────────────────────────────────────────

export type AIProvider = 'openai' | 'gemini' | 'openrouter' | 'anthropic'

/** Respuesta de un proveedor individual (GET /ai/config, PUT /ai/config/{provider}) */
export interface AIProviderConfigResponse {
  id: string
  provider: AIProvider
  display_name: string | null
  api_key_last4: string | null
  api_key_configured: boolean
  default_model: string | null
  base_url: string | null
  is_active: boolean
  is_valid: boolean | null
  validated_at: string | null
  validation_error: string | null
}

/** Respuesta del resumen completo (GET /ai/config) */
export interface AIConfigSummaryResponse {
  providers: AIProviderConfigResponse[]
  active_provider: AIProvider | null
  active_model: string | null
}

/** Body para crear/actualizar un proveedor (PUT /ai/config/{provider}) */
export interface AIProviderUpsertRequest {
  api_key?: string
  default_model?: string
  base_url?: string
  display_name?: string
}

/** Respuesta de validación (POST /ai/config/{provider}/validate) */
export interface AIProviderValidateResponse {
  provider: AIProvider
  is_valid: boolean
  message: string
  validated_at: string
  suggested_models: string[]
}

export interface ProviderModelCatalog {
  [provider: string]: { id: string; label: string; context_window?: number }[]
}

/** Modelo de IA retornado por fetch-models */
export interface AIModelOption {
  id: string
  label: string
}

/** Respuesta de POST /ai/config/{provider}/fetch-models */
export interface FetchModelsResponse {
  provider: AIProvider
  models: AIModelOption[]
}

// ─────────────────────────────────────────────────────────────
// Servicio
// ─────────────────────────────────────────────────────────────

const aiConfigService = {
  /**
   * Lista todos los proveedores configurados para el negocio.
   */
  listConfigs: async (): Promise<AIConfigSummaryResponse> => {
    const { data } = await httpClient.get(`/ai/config`)
    return data
  },

  /**
   * Crea o actualiza la configuración de un proveedor.
   */
  upsertConfig: async (
    provider: AIProvider,
    payload: AIProviderUpsertRequest
  ): Promise<AIProviderConfigResponse> => {
    const { data } = await httpClient.put(`/ai/config/${provider}`, payload)
    return data
  },

  /**
   * Valida la API key del proveedor contra su servicio real.
   */
  validateProvider: async (
    provider: AIProvider
  ): Promise<AIProviderValidateResponse> => {
    const { data } = await httpClient.post(`/ai/config/${provider}/validate`, {})
    return data
  },

  /**
   * Activa un proveedor (desactiva los demás automáticamente).
   */
  activateProvider: async (
    provider: AIProvider
  ): Promise<AIProviderConfigResponse> => {
    const { data } = await httpClient.patch(`/ai/config/${provider}/activate`, {})
    return data
  },

  /**
   * Elimina la configuración de un proveedor (soft delete).
   */
  deleteProvider: async (provider: AIProvider): Promise<void> => {
    await httpClient.delete(`/ai/config/${provider}`)
  },

  /**
   * Consulta los modelos REALES disponibles para una API key dada.
   * No guarda nada en DB — solo pregunta al proveedor en vivo.
   */
  fetchModels: async (
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string
  ): Promise<FetchModelsResponse> => {
    const { data } = await httpClient.post(`/ai/config/${provider}/fetch-models`, {
      api_key: apiKey,
      base_url: baseUrl || undefined,
    })
    return data
  },

  /**
   * Consulta los modelos REALES usando la API key YA GUARDADA en DB.
   * Útil cuando el proveedor ya está configurado y el usuario quiere
   * ver los modelos actualizados sin re-ingresar la key.
   */
  fetchModelsSaved: async (
    provider: AIProvider,
  ): Promise<FetchModelsResponse> => {
    const { data } = await httpClient.post(`/ai/config/${provider}/fetch-models-saved`, {})
    return data
  },

  /**
   * Devuelve el catálogo estático de modelos por proveedor.
   */
  getModelsCatalog: async (): Promise<ProviderModelCatalog> => {
    const { data } = await httpClient.get(`/ai/config/models/catalog`)
    return data
  },
}

export default aiConfigService
