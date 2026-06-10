/**
 * Service for Price Lists (Listas de Precios).
 */
import httpClient from './httpClient'

export interface PriceListItem {
  id: string
  product_code: string
  unit_price: number
}

export interface PriceList {
  id: string
  name: string
  snapshot_date: string
  notes?: string
  item_count: number
  created_at: string
  updated_at: string
}

export interface PriceListDetail extends Omit<PriceList, 'item_count'> {
  items: PriceListItem[]
}

export interface PriceListCreate {
  name: string
  snapshot_date: string
  notes?: string
  items: Array<{ product_code: string; unit_price: number }>
}

const priceListsService = {
  getAll: async (): Promise<PriceList[]> => {
    const { data } = await httpClient.get('/price-lists')
    return data
  },

  getById: async (id: string): Promise<PriceListDetail> => {
    const { data } = await httpClient.get(`/price-lists/${id}`)
    return data
  },

  create: async (payload: PriceListCreate): Promise<PriceListDetail> => {
    const { data } = await httpClient.post('/price-lists', payload)
    return data
  },

  snapshot: async (name: string): Promise<PriceListDetail> => {
    const { data } = await httpClient.post('/price-lists/snapshot', { name })
    return data
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/price-lists/${id}`)
  },
}

export default priceListsService
