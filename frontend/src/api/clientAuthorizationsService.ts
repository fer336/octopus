/**
 * Servicio de autorizaciones titular/subcliente para Cuenta Corriente.
 */
import httpClient from './httpClient'

export interface ClientAuthorization {
  id: string
  billing_client_id: string
  operating_client_id: string
  operating_credit_limit?: number | null
  is_active: boolean
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface ClientAuthorizationCreate {
  billing_client_id: string
  operating_client_id: string
  operating_credit_limit?: number | null
  is_active?: boolean
  notes?: string
}

export interface ClientAuthorizationUpdate {
  operating_credit_limit?: number | null
  is_active?: boolean
  notes?: string
}

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

export const clientAuthorizationsService = {
  getAll: async (params?: {
    billing_client_id?: string
    operating_client_id?: string
    is_active?: boolean
    page?: number
    per_page?: number
  }): Promise<PaginatedResponse<ClientAuthorization>> => {
    const response = await httpClient.get('/client-authorizations', { params })
    return response.data
  },

  create: async (data: ClientAuthorizationCreate): Promise<ClientAuthorization> => {
    const response = await httpClient.post('/client-authorizations', data)
    return response.data
  },

  update: async (
    id: string,
    data: ClientAuthorizationUpdate
  ): Promise<ClientAuthorization> => {
    const response = await httpClient.put(`/client-authorizations/${id}`, data)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/client-authorizations/${id}`)
  },
}

export default clientAuthorizationsService
