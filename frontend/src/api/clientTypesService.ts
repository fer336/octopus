/**
 * Servicio de Tipos de Cliente.
 * Maneja catálogo por tenant para clasificar clientes.
 */
import httpClient from './httpClient'

export interface ClientType {
  id: string
  name: string
  is_subclient_eligible: boolean
  created_at: string
  updated_at: string
}

export interface ClientTypeCreate {
  name: string
  is_subclient_eligible: boolean
}

export interface ClientTypeUpdate extends Partial<ClientTypeCreate> {}

export const clientTypesService = {
  /**
   * Obtiene tipos de cliente del tenant.
   */
  getAll: async (): Promise<ClientType[]> => {
    const response = await httpClient.get('/client-types', {
      params: { per_page: 100 },
    })
    return response.data.items || []
  },

  /**
   * Crea un tipo de cliente.
   */
  create: async (data: ClientTypeCreate): Promise<ClientType> => {
    const response = await httpClient.post('/client-types', data)
    return response.data
  },

  /**
   * Actualiza un tipo de cliente.
   */
  update: async (id: string, data: ClientTypeUpdate): Promise<ClientType> => {
    const response = await httpClient.put(`/client-types/${id}`, data)
    return response.data
  },

  /**
   * Elimina un tipo de cliente.
   */
  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/client-types/${id}`)
  },
}

export default clientTypesService
