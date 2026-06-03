/**
 * Service for Current Account Drafts (Borradores de Cuenta Corriente).
 */
import httpClient from './httpClient'

export interface CCDraftSave {
  titular_id: string
  closure_notes?: string
  special_list_items?: string[]
  selected_receipt_ids?: string[]
  item_overrides?: Record<string, { quantity: number; unit_price: number; discount_percent: number }>
  applied_price_lists?: Record<string, { list_id: string; list_name: string; item_prices: Record<string, number> }>
}

export interface CCDraft extends CCDraftSave {
  id: string
  created_at: string
  updated_at: string
}

const ccDraftsService = {
  get: async (titularId: string): Promise<CCDraft | null> => {
    try {
      const { data } = await httpClient.get(`/cc-drafts/${titularId}`)
      return data
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } }
      if (axiosErr?.response?.status === 404) return null
      throw err
    }
  },

  save: async (titularId: string, payload: CCDraftSave): Promise<CCDraft> => {
    const { data } = await httpClient.put(`/cc-drafts/${titularId}`, payload)
    return data
  },

  delete: async (titularId: string): Promise<void> => {
    try {
      await httpClient.delete(`/cc-drafts/${titularId}`)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } }
      if (axiosErr?.response?.status === 404) return
      throw err
    }
  },
}

export default ccDraftsService
