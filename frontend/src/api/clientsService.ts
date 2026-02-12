/**
 * Servicio de Clientes.
 * Maneja CRUD de clientes y cuenta corriente.
 */
import httpClient from './httpClient'
import { PaginatedResponse } from './productsService'

export interface Client {
  id: string
  business_id: string
  name: string
  document_type: string
  document_number: string
  tax_condition: string
  street?: string
  street_number?: string
  floor?: string
  apartment?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  notes?: string
  current_balance: number
  credit_limit?: number
  created_at: string
  updated_at: string
}

export interface ClientCreate {
  name: string
  document_type: string
  document_number: string
  tax_condition: string
  street?: string
  street_number?: string
  floor?: string
  apartment?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  notes?: string
  credit_limit?: number
}

export interface ClientUpdate extends Partial<ClientCreate> {}

export const clientsService = {
  /**
   * Obtiene la lista de clientes con paginación y filtros.
   */
  getAll: async (params?: {
    page?: number
    per_page?: number
    search?: string
  }): Promise<PaginatedResponse<Client>> => {
    const response = await httpClient.get('/clients', { params })
    return response.data
  },

  /**
   * Obtiene un cliente por ID.
   */
  getById: async (id: string): Promise<Client> => {
    const response = await httpClient.get(`/clients/${id}`)
    return response.data
  },

  /**
   * Crea un nuevo cliente.
   */
  create: async (data: ClientCreate): Promise<Client> => {
    const response = await httpClient.post('/clients', data)
    return response.data
  },

  /**
   * Actualiza un cliente existente.
   */
  update: async (id: string, data: ClientUpdate): Promise<Client> => {
    const response = await httpClient.put(`/clients/${id}`, data)
    return response.data
  },

  /**
   * Elimina un cliente (soft delete).
   */
  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/clients/${id}`)
  },

  /**
   * Busca clientes por nombre o documento.
   */
  search: async (query: string): Promise<Client[]> => {
    const response = await httpClient.get('/clients', {
      params: { search: query, per_page: 10 },
    })
    return response.data.items
  },
}

export default clientsService
