/**
 * Servicio para borradores de actualización masiva de precios.
 */
import httpClient from './httpClient'

export interface DraftSummary {
  id: string
  name: string
  product_count: number
  filter_category_name?: string
  filter_supplier_name?: string
  filter_search?: string
  created_at: string
  updated_at: string
}

export interface DraftDetail extends DraftSummary {
  products: any[]
}

export interface SaveDraftPayload {
  name: string
  filters?: {
    category_id?: string
    category_name?: string
    supplier_id?: string
    supplier_name?: string
    search?: string
  }
  products: any[]
}

const priceUpdateDraftsService = {
  list: async (): Promise<DraftSummary[]> => {
    const res = await httpClient.get('/price-update-drafts')
    return res.data
  },

  get: async (id: string): Promise<DraftDetail> => {
    const res = await httpClient.get(`/price-update-drafts/${id}`)
    return res.data
  },

  save: async (payload: SaveDraftPayload): Promise<DraftSummary> => {
    const res = await httpClient.post('/price-update-drafts', payload)
    return res.data
  },

  update: async (id: string, payload: SaveDraftPayload): Promise<DraftSummary> => {
    const res = await httpClient.put(`/price-update-drafts/${id}`, payload)
    return res.data
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/price-update-drafts/${id}`)
  },
}

export default priceUpdateDraftsService
