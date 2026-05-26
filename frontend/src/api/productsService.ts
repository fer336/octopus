/**
 * Servicio de Productos.
 * Maneja CRUD de productos y búsqueda.
 */
import httpClient from './httpClient'

export interface Product {
  id: string
  business_id: string
  category_id?: string
  supplier_id?: string
  code: string
  supplier_code?: string
  photo_url?: string
  description: string
  details?: string
  brand?: string
  line?: string
  application_area?: string
  finish?: string
  quality_tier?: string
  attributes_json?: string
  customer_terms?: string
  cost_price: number
  list_price: number
  price_currency: 'ARS' | 'USD'
  list_price_usd?: number | null
  discount_1: number
  discount_2: number
  discount_3: number
  discount_display?: string
  extra_cost: number
  profit_margin: number
  net_price: number
  sale_price: number
  iva_rate: number
  current_stock: number
  minimum_stock: number
  unit: string
  units_per_pack?: number | null
  next_expiration?: string | null
  lots_count: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductCreate {
  code: string
  supplier_code?: string
  description: string
  brand?: string
  line?: string
  application_area?: string
  finish?: string
  quality_tier?: string
  attributes_json?: string
  customer_terms?: string
  category_id?: string
  supplier_id?: string
  list_price: number
  price_currency?: 'ARS' | 'USD'
  list_price_usd?: number | null
  discount_1?: number
  discount_2?: number
  discount_3?: number
  extra_cost?: number
  profit_margin?: number
  iva_rate?: number
  current_stock?: number
  expiration_date?: string | null
  minimum_stock?: number
  unit?: string
  units_per_pack?: number | null
  cost_price?: number
}

export interface ProductUpdate {
  code?: string
  supplier_code?: string
  description?: string
  brand?: string
  line?: string
  application_area?: string
  finish?: string
  quality_tier?: string
  attributes_json?: string
  customer_terms?: string
  category_id?: string
  supplier_id?: string
  list_price?: number
  price_currency?: 'ARS' | 'USD'
  list_price_usd?: number | null
  discount_1?: number
  discount_2?: number
  discount_3?: number
  extra_cost?: number
  profit_margin?: number
  iva_rate?: number
  current_stock?: number
  minimum_stock?: number
  unit?: string
  units_per_pack?: number | null
  cost_price?: number
  is_active?: boolean
}

export interface ProductBulkUpdateItem extends ProductUpdate {
  id: string
}

export interface ProductBulkUpdateResponse {
  updated_count: number
  not_found_ids: string[]
  products: Product[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface ProductImportRow {
  row_number: number
  code: string
  supplier_code?: string
  description: string
  category_id?: string
  category_name?: string
  supplier_id?: string
  supplier_name?: string
  list_price: number
  discount_1: number
  discount_2: number
  discount_3: number
  extra_cost: number
  profit_margin: number
  iva_rate: number
  current_stock: number
  minimum_stock: number
  unit: string
  units_per_pack?: number | null
  net_price?: number
  sale_price?: number
  discount_display?: string
  has_errors: boolean
  error_message?: string
  is_new: boolean
  existing_id?: string
}

export interface ImportPreviewResponse {
  total_rows: number
  valid_rows: number
  rows_with_errors: number
  new_products: number
  existing_products: number
  rows: ProductImportRow[]
}

export interface ImportConfirmRequest {
  rows: ProductImportRow[]
}

export interface ProductLot {
  id: string
  product_id: string
  business_id: string
  code: string | null
  quantity: number
  initial_quantity: number
  expiration_date: string | null
  cost_price: number | null
  received_date: string
  created_at: string
  updated_at: string
}

export interface ImportConfirmResponse {
  created: number
  updated: number
  errors: string[]
}

export interface SyncPriceFromLotResponse {
  lot_id: string
  reference_price: number
  preview_list_price: number
  preview_net_price: number
  preview_sale_price: number
  confirmed: boolean
  price_history_id: string | null
  message: string
}

export const productsService = {
  /**
   * Obtiene la lista de productos con paginación y filtros.
   */
  getAll: async (params?: {
    page?: number
    per_page?: number
    search?: string
    category_id?: string
    supplier_id?: string
    brand?: string
    line?: string
    application_area?: string
    finish?: string
    quality_tier?: string
    sort_by?: 'description' | 'sale_price' | 'current_stock'
    sort_order?: 'asc' | 'desc'
    is_active?: boolean
  }): Promise<PaginatedResponse<Product>> => {
    const response = await httpClient.get('/products', { params })
    return response.data
  },

  /**
   * Obtiene un producto por ID.
   */
  getById: async (id: string): Promise<Product> => {
    const response = await httpClient.get(`/products/${id}`)
    return response.data
  },

  /**
   * Crea un nuevo producto.
   */
  create: async (data: ProductCreate): Promise<Product> => {
    const response = await httpClient.post('/products', data)
    return response.data
  },

  /**
   * Actualiza un producto existente.
   */
  update: async (id: string, data: ProductUpdate): Promise<Product> => {
    const response = await httpClient.put(`/products/${id}`, data)
    return response.data
  },

  /**
   * Actualiza varios productos en una sola petición.
   */
  bulkUpdate: async (products: ProductBulkUpdateItem[]): Promise<ProductBulkUpdateResponse> => {
    const response = await httpClient.post('/products/bulk-update', { products })
    return response.data
  },

  /**
   * Elimina un producto (soft delete).
   */
  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/products/${id}`)
  },

  /**
   * Preview de importación de Excel.
   * Parsea el archivo y retorna datos para revisión.
   */
  previewImport: async (file: File): Promise<ImportPreviewResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await httpClient.post('/products/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  /**
   * Confirma la importación después del preview.
   */
  confirmImport: async (request: ImportConfirmRequest): Promise<ImportConfirmResponse> => {
    const response = await httpClient.post('/products/import/confirm', request)
    return response.data
  },

  /**
   * Importa productos desde Excel (método directo sin preview).
   */
  importExcel: async (file: File): Promise<any> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await httpClient.post('/products/import/excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  /**
   * Exporta productos activos a Excel.
   */
  exportExcel: async (): Promise<Blob> => {
    const response = await httpClient.get('/products/export/excel', {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Exporta backup completo de todos los productos (incluso eliminados).
   */
  exportBackup: async (): Promise<Blob> => {
    const response = await httpClient.get('/products/export/backup', {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Exporta productos en formato SQL (INSERT statements).
   */
  exportSQL: async (): Promise<Blob> => {
    const response = await httpClient.get('/products/export/sql', {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Importa productos desde SQL (INSERT statements).
   */
  importSQL: async (sqlContent: string): Promise<{
    imported: number
    imported_categories?: number
    imported_suppliers?: number
    errors: string[]
    total_errors?: number
  }> => {
    const response = await httpClient.post('/products/import/sql', { sql: sqlContent })
    return response.data
  },

  /**
   * Elimina TODOS los productos (soft delete).
   */
  bulkDelete: async (): Promise<{ deleted_count: number; message: string }> => {
    // Usar POST en vez de DELETE para evitar problemas
    const response = await httpClient.post('/products/bulk-delete-alt')
    return response.data
  },

  // ── Lotes ─────────────────────────────────────────────────────

  /**
   * Obtiene la lista de lotes de un producto.
   */
  getLots: async (productId: string): Promise<ProductLot[]> => {
    const response = await httpClient.get(`/products/${productId}/lots`)
    return response.data
  },

  /**
   * Crea un nuevo lote (ingreso de stock) para un producto.
   */
  createLot: async (
    productId: string,
    data: {
      quantity: number
      expiration_date?: string | null
      cost_price?: number | null
      code?: string | null
      received_date?: string | null
    },
  ): Promise<ProductLot> => {
    const response = await httpClient.post(`/products/${productId}/lots`, data)
    return response.data
  },

  /**
   * Sube o reemplaza la foto de un producto. Max 2 MB.
   */
  uploadPhoto: async (productId: string, file: File): Promise<Product> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await httpClient.post(`/products/${productId}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  /**
   * Sincroniza el precio de lista del producto desde el costo de un lote.
   * Si confirm=false, devuelve preview sin persistir.
   * Si confirm=true, actualiza el precio y crea PriceHistory.
   */
  syncPriceFromLot: async (
    productId: string,
    data: {
      lot_id: string
      reference_price?: number | null
      confirm?: boolean
    },
  ): Promise<SyncPriceFromLotResponse> => {
    const response = await httpClient.post(
      `/products/${productId}/sync-price-from-lot`,
      data,
    )
    return response.data
  },
}

export default productsService
