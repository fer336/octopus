/**
 * Servicio de Borradores (Drafts).
 * 
 * Los borradores se almacenan en la base de datos y son
 * compartidos entre todos los usuarios del negocio.
 */
import httpClient from './httpClient'

// Types
export interface DraftItem {
  product_id: string
  code: string
  description: string
  net_price: number
  sale_price: number
  quantity: number
  discount: number
}

export interface DraftCreate {
  voucher_type: string
  client_id?: string
  client_name?: string
  operating_client_id?: string
  items: DraftItem[]
  general_discount: number
  show_prices: boolean
}

export interface DraftResponse {
  id: string
  business_id: string
  user_id?: string
  client_id?: string
  client_name?: string
  voucher_type: string
  operating_client_id?: string
  items: DraftItem[]
  general_discount: number
  show_prices: boolean
  item_count: number
  created_at: string
  updated_at: string
}

export interface DraftListItem {
  id: string
  client_name?: string
  voucher_type: string
  item_count: number
  general_discount: number
  show_prices: boolean
  created_at: string
  updated_at: string
}

// API functions
export const draftsService = {
  /**
   * Lista todos los borradores del negocio.
   */
  getAll: async (): Promise<DraftListItem[]> => {
    const response = await httpClient.get('/drafts')
    return response.data
  },

  /**
   * Obtiene un borrador específico por ID.
   */
  getById: async (id: string): Promise<DraftResponse> => {
    const response = await httpClient.get(`/drafts/${id}`)
    return response.data
  },

  /**
   * Crea un nuevo borrador.
   */
  create: async (data: DraftCreate): Promise<DraftResponse> => {
    const response = await httpClient.post('/drafts', data)
    return response.data
  },

  /**
   * Actualiza un borrador existente.
   */
  update: async (id: string, data: Partial<DraftCreate>): Promise<DraftResponse> => {
    const response = await httpClient.put(`/drafts/${id}`, data)
    return response.data
  },

  /**
   * Elimina un borrador.
   */
  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/drafts/${id}`)
  },
}

export default draftsService