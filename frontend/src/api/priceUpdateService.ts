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

export interface ExcelColumnPreviewResponse {
  file_name: string
  total_rows: number
  columns: string[]
  sample_rows: Record<string, any>[]
  rows: Record<string, any>[]
}

export interface ExcelPriceUpdatePreviewItem {
  row_number: number
  supplier_code: string
  imported_list_price?: number | null
  product_id?: string | null
  product_code?: string | null
  description?: string | null
  current_list_price?: number | null
  current_sale_price?: number | null
  new_sale_price?: number | null
  status: 'matched' | 'not_found' | 'error'
  error_message?: string | null
}

export interface ExcelPriceUpdatePreviewResponse {
  total_rows: number
  matched_count: number
  error_count: number
  supplier_name?: string | null
  items: ExcelPriceUpdatePreviewItem[]
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

  previewExcelColumns: async (file: File): Promise<ExcelColumnPreviewResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await httpClient.post('/products/price-update/excel/columns', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  previewExcelMapping: async (request: {
    rows: Record<string, any>[]
    code_column: string
    price_column: string
    supplier_name?: string
  }): Promise<ExcelPriceUpdatePreviewResponse> => {
    const response = await httpClient.post('/products/price-update/excel/preview', request)
    return response.data
  },
}

export default priceUpdateService
