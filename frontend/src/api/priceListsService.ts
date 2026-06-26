/**
 * Service for B2B Price Lists.
 */
import httpClient from './httpClient'

export interface PaymentCondition {
  label: string
  surcharge_pct: number
}

export interface PriceListItem {
  id: string
  product_code: string
  unit_price: number
  product_id?: string | null
  description?: string | null
  supplier_code?: string | null
  brand_name?: string | null
  category_name?: string | null
  unit?: string | null
  quantity_per_package?: number | null
  iva_rate?: number | null
  base_price?: number | null
  discount_percent: number
  surcharge_percent: number
  net_price?: number | null
  tax_percent?: number | null
  final_price?: number | null
  min_quantity?: number | null
  pack_quantity?: number | null
  item_notes?: string | null
  created_at: string
  updated_at: string
}

export interface PriceList {
  id: string
  name: string
  snapshot_date: string
  notes?: string | null
  item_count: number
  description?: string | null
  currency: string
  includes_tax: boolean
  valid_from?: string | null
  valid_until?: string | null
  status: 'draft' | 'active' | 'expired' | 'archived'
  version: number
  client_type_id?: string | null
  client_id?: string | null
  list_type: 'snapshot' | 'wholesale'
  column_config?: { visible_columns: string[] } | null
  payment_conditions?: PaymentCondition[] | null
  created_at: string
  updated_at: string
}

export interface PriceListDetail extends Omit<PriceList, 'item_count'> {
  items: PriceListItem[]
}

export interface PriceListSendLog {
  id: string
  price_list_id: string
  client_id?: string | null
  channel: string
  sent_at: string
  sent_by_user_id?: string | null
  file_url?: string | null
  log_status: string
  message_preview?: string | null
  created_at: string
  updated_at: string
}

export interface PriceListCreate {
  name: string
  snapshot_date: string
  notes?: string
  items?: Array<{ product_code: string; unit_price: number }>
  description?: string
  currency?: string
  includes_tax?: boolean
  valid_from?: string
  valid_until?: string
  status?: 'draft' | 'active'
  terms_and_conditions?: string
  client_type_id?: string
  client_id?: string
  list_type?: 'snapshot' | 'wholesale'
  column_config?: { visible_columns: string[] }
  payment_conditions?: PaymentCondition[]
}

export interface PriceListUpdate {
  name?: string
  description?: string
  currency?: string
  includes_tax?: boolean
  valid_from?: string | null
  valid_until?: string | null
  status?: 'draft' | 'active' | 'expired' | 'archived'
  terms_and_conditions?: string
  client_type_id?: string | null
  client_id?: string | null
  notes?: string
}

export interface AddProductsRequest {
  product_ids: string[]
  default_discount_percent?: number
}

export interface BulkAdjustRequest {
  percent: number
  category_id?: string
  brand_id?: string
  supplier_id?: string
}

export interface DuplicateRequest {
  name: string
  valid_from?: string
  valid_until?: string
}

export interface SendLogCreate {
  channel: string
  client_id?: string
  message_preview?: string
  file_url?: string
}

// Helper: trigger a browser file download from a blob response
function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

const priceListsService = {
  getAll: async (listType?: 'snapshot' | 'wholesale'): Promise<PriceList[]> => {
    const params = listType ? { list_type: listType } : undefined
    const { data } = await httpClient.get('/price-lists', { params })
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

  update: async (id: string, payload: PriceListUpdate): Promise<PriceListDetail> => {
    const { data } = await httpClient.put(`/price-lists/${id}`, payload)
    return data
  },

  snapshot: async (name: string): Promise<PriceListDetail> => {
    const { data } = await httpClient.post('/price-lists/snapshot', { name })
    return data
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/price-lists/${id}`)
  },

  archive: async (id: string): Promise<void> => {
    await httpClient.post(`/price-lists/${id}/archive`)
  },

  addProducts: async (id: string, payload: AddProductsRequest): Promise<PriceListItem[]> => {
    const { data } = await httpClient.post(`/price-lists/${id}/items/from-products`, payload)
    return data
  },

  updateItem: async (id: string, itemId: string, payload: Partial<PriceListItem>): Promise<PriceListItem> => {
    const { data } = await httpClient.put(`/price-lists/${id}/items/${itemId}`, payload)
    return data
  },

  deleteItem: async (id: string, itemId: string): Promise<void> => {
    await httpClient.delete(`/price-lists/${id}/items/${itemId}`)
  },

  bulkAdjust: async (id: string, payload: BulkAdjustRequest): Promise<{ affected: number }> => {
    const { data } = await httpClient.post(`/price-lists/${id}/bulk-adjust`, payload)
    return data
  },

  duplicate: async (id: string, payload: DuplicateRequest): Promise<PriceListDetail> => {
    const { data } = await httpClient.post(`/price-lists/${id}/duplicate`, payload)
    return data
  },

  downloadExcel: async (id: string, name: string): Promise<void> => {
    const response = await httpClient.get(`/price-lists/${id}/export.xlsx`, { responseType: 'blob' })
    downloadBlob(response.data as Blob, `lista-precios-${name}.xlsx`)
  },

  downloadPdf: async (id: string, name: string): Promise<void> => {
    const response = await httpClient.get(`/price-lists/${id}/export.pdf`, { responseType: 'blob' })
    downloadBlob(response.data as Blob, `lista-precios-${name}.pdf`)
  },

  createSendLog: async (id: string, payload: SendLogCreate): Promise<PriceListSendLog> => {
    const { data } = await httpClient.post(`/price-lists/${id}/send-logs`, payload)
    return data
  },

  getSendLogs: async (id: string): Promise<PriceListSendLog[]> => {
    const { data } = await httpClient.get(`/price-lists/${id}/send-logs`)
    return data
  },
}

export default priceListsService
