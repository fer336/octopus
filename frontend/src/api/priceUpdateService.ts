/**
 * Servicio para actualización masiva de precios.
 */
import httpClient from './httpClient'

export interface PriceUpdateRequest {
  product_ids: string[]
  field: string
  update_type: 'increase' | 'decrease' | 'remove_increase' | 'set_value'
  value: number
}

export interface PreviewItem {
  id: string
  code: string
  description: string
  category_name?: string
  supplier_name?: string
  current_value: number
  new_value: number
  change_amount: number
  change_percentage: number
}

export interface PriceUpdatePreviewResponse {
  total_products: number
  field_name: string
  update_description: string
  items: PreviewItem[]
}

export interface PriceUpdateApplyResponse {
  updated_count: number
  message: string
}

export const priceUpdateService = {
  /**
   * Preview de actualización de precios.
   */
  preview: async (request: PriceUpdateRequest): Promise<PriceUpdatePreviewResponse> => {
    const response = await httpClient.post('/products/price-update/preview', request)
    return response.data
  },

  /**
   * Aplicar actualización de precios.
   */
  apply: async (request: PriceUpdateRequest): Promise<PriceUpdateApplyResponse> => {
    const response = await httpClient.post('/products/price-update/apply', request)
    return response.data
  },
}

export default priceUpdateService
