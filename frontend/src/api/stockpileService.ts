/**
 * Servicio de Acopios (Stockpiles).
 * API para gestionar acopios: crear, listar, retirer productos.
 */
import { httpClient } from './httpClient'

export interface StockpileItemCreate {
  product_id: string
  quantity: number
}

export interface StockpileItemWithdraw {
  product_id: string
  quantity: number
}

export interface StockpileCreate {
  client_id: string
  billing_client_id?: string
  name: string
  currency?: string
  exchange_rate?: number
  items: StockpileItemCreate[]
}

export interface StockpileItemResponse {
  id: string
  product_id: string | null
  product_code: string
  product_description: string
  quantity_initial: number
  quantity_withdrawn: number
  quantity_remaining: number
  currency: string
  frozen_unit_price: number
  frozen_iva_rate: number
  frozen_iva_amount: number
  frozen_subtotal: number
  frozen_total: number
}

export interface StockpileListItem {
  id: string
  client_name: string
  billing_client_name: string | null
  name: string
  stockpile_number: string | null
  description: string | null
  status: string
  initial_amount: number
  withdrawn_amount: number
  remaining_amount: number
  created_at: string
}

export interface StockpileResponse {
  id: string
  business_id: string
  client_id: string
  client_name: string
  billing_client_id: string | null
  billing_client_name: string | null
  created_by: string | null
  created_by_name: string | null
  name: string
  stockpile_number: string | null
  description: string | null
  status: string
  currency: string
  exchange_rate: number | null
  discount_percent: number | null
  initial_amount: number
  withdrawn_amount: number
  remaining_amount: number
  created_at: string
  completed_at: string | null
  expiration_mode: string
  due_date: string | null
  principal_voucher_id: string | null
  principal_voucher_number: string | null
  notes: string | null
  items: StockpileItemResponse[]
}

export interface StockpileListResponse {
  items: StockpileListItem[]
  total: number
  page: number
  per_page: number
}

export interface StockpileTreeChildVoucher {
  id: string
  number: string
  date: string
  total: number
  status: string
}

export interface StockpileTreeItem {
  id: string
  client_id: string
  billing_client_id: string | null
  name: string
  stockpile_number: string | null
  description: string | null
  client_name: string
  client_email: string | null
  client_phone: string | null
  status: string
  created_at: string
  principal_voucher_id: string | null
  principal_voucher_number: string | null
  initial_amount: number
  withdrawn_amount: number
  remaining_amount: number
  has_price_snapshot: boolean
  child_vouchers: StockpileTreeChildVoucher[]
}

export interface StockpileTreeResponse {
  items: StockpileTreeItem[]
  total: number
}

// SALES-ACOPIO-FRONTEND-03: interfaces for open stockpiles by client, summary, frozen items, validate withdrawal
export interface OpenStockpileItem {
  id: string
  name: string
  status: string
  created_at: string
  expiration_mode: string | null
  due_date: string | null
  principal_voucher_id: string | null
  principal_voucher_number: string | null
  initial_amount: number
  withdrawn_amount: number
  remaining_amount: number
  currency: string
  discount_percent: number | null
}

export interface StockpileSummary {
  stockpile_id: string
  name: string
  status: string
  created_at: string
  snapshot_date: string
  prices_valid_at: string
  initial_amount: number
  withdrawn_amount: number
  remaining_amount: number
  child_remitos_count: number
  principal_voucher_id: string | null
  principal_voucher_number: string | null
  items: FrozenItem[]
}

export interface FrozenItem {
  stockpile_item_id: string
  product_id: string | null
  product_code: string
  product_description: string
  quantity_initial: number
  quantity_withdrawn: number
  quantity_remaining: number
  frozen_unit_price: number
  frozen_iva_rate: number
  frozen_iva_amount: number
  frozen_subtotal: number
  frozen_total: number
  currency: string
}

export interface ValidateWithdrawalResponse {
  allowed: boolean
  withdrawal_amount: number
  remaining_amount: number
  exceeded_amount: number
  message: string
}

const stockpileService = {
  /**
   * Lista todos los acopios del negocio.
   */
  getAll: async (params?: {
    client_id?: string
    status?: string
    page?: number
    per_page?: number
  }): Promise<StockpileListResponse> => {
    const response = await httpClient.get('/stockpiles', { params })
    return response.data
  },

  /**
   * Vista árbol: acopio/remito principal → remitos parciales.
   */
  getTree: async (params?: { status?: string }): Promise<StockpileTreeResponse> => {
    const response = await httpClient.get('/stockpiles/tree', { params })
    return response.data
  },

  /**
   * Obtiene un acopio por ID.
   */
  getById: async (id: string): Promise<StockpileResponse> => {
    const response = await httpClient.get(`/stockpiles/${id}`)
    return response.data
  },

  /**
   * Crea un nuevo acopio.
   */
  create: async (data: StockpileCreate): Promise<StockpileResponse> => {
    const response = await httpClient.post('/stockpiles', data)
    return response.data
  },

  /**
   * Actualiza un acopio (nombre, descripción, notas, status).
   */
  update: async (
    id: string,
    data: Partial<{
      name: string
      description: string
      notes: string
      status: string
    }>
  ): Promise<StockpileResponse> => {
    const response = await httpClient.put(`/stockpiles/${id}`, data)
    return response.data
  },

  /**
   * Cancela un acopio.
   */
  cancel: async (id: string): Promise<{ message: string }> => {
    const response = await httpClient.delete(`/stockpiles/${id}`)
    return response.data
  },

  /**
   * Retira productos del acopio.
   */
  withdraw: async (
    id: string,
    items: StockpileItemWithdraw[]
  ): Promise<{
    stockpile: StockpileResponse
    withdrawn_items: StockpileItemResponse[]
    insufficient_items: StockpileItemResponse[]
    message: string
  }> => {
    const response = await httpClient.post(`/stockpiles/${id}/withdraw`, { items })
    return response.data
  },

  /**
   * Cierra un acopio.
   */
  close: async (
    id: string,
    force?: boolean
  ): Promise<{
    stockpile: StockpileResponse
    message: string
  }> => {
    const params = force !== undefined ? { force } : {}
    const response = await httpClient.post(`/stockpiles/${id}/close`, null, { params })
    return response.data
  },

  // SALES-ACOPIO-FRONTEND-03: methods for linking receipt to acopio
  /**
   * Obtiene los acopios abiertos de un cliente con saldo disponible.
   */
  getOpenByClient: async (clientId: string): Promise<OpenStockpileItem[]> => {
    const response = await httpClient.get(`/stockpiles/by-client/${clientId}/open`)
    return response.data.items ?? []
  },

  /**
   * Obtiene el resumen de un acopio (snapshot de precios, items congelados, saldos).
   */
  getSummary: async (stockpileId: string): Promise<StockpileSummary> => {
    const response = await httpClient.get(`/stockpiles/${stockpileId}/summary`)
    return response.data
  },

  /**
   * Valida si un retiro puede realizarse (no excede el saldo disponible).
   */
  validateWithdrawal: async (
    stockpileId: string,
    withdrawalAmount: number
  ): Promise<ValidateWithdrawalResponse> => {
    const response = await httpClient.post(`/stockpiles/${stockpileId}/validate-withdrawal`, {
      withdrawal_amount: withdrawalAmount,
    })
    return response.data
  },

  /**
   * Obtiene los ítems congelados (con precios snapshot) de un acopio.
   */
  getFrozenItems: async (stockpileId: string): Promise<FrozenItem[]> => {
    const response = await httpClient.get(`/stockpiles/${stockpileId}/frozen-items`)
    return response.data
  },

  /**
   * Descarga el Excel de precios congelados de un acopio por monto.
   */
  downloadPriceSnapshot: async (stockpileId: string): Promise<Blob> => {
    const response = await httpClient.get(`/stockpiles/${stockpileId}/price-snapshot/excel`, {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Crea un acopio por monto (sin productos específicos).
   */
  createByAmount: async (data: {
    client_id: string
    billing_client_id?: string
    name: string
    description?: string
    currency?: string
    exchange_rate?: number
    amount: number
    discount_percent: number
  }): Promise<StockpileResponse> => {
    const response = await httpClient.post('/stockpiles/by-amount', data)
    return response.data
  },

  /**
   * Obtiene el PDF de un remito hijo como blob.
   */
  getVoucherById: async (voucherId: string): Promise<Blob> => {
    if (!voucherId) throw new Error('ID de remito vacío')
    const response = await httpClient.get(`/stockpiles/acopio-voucher/${voucherId}/pdf`, {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Descarga el PDF de un remito hijo.
   */
  downloadVoucherPdf: async (voucherId: string): Promise<Blob> => {
    if (!voucherId) throw new Error('ID de remito vacío')
    const response = await httpClient.get(`/stockpiles/acopio-voucher/${voucherId}/pdf`, {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Elimina un remito hijo (solo si está pendiente).
   */
  deleteChildVoucher: async (voucherId: string): Promise<{ message: string }> => {
    if (!voucherId) throw new Error('ID de remito vacío')
    const response = await httpClient.delete(`/stockpiles/acopio-voucher/${voucherId}`)
    return response.data
  },

  cancelPartialVoucher: async (
    stockpileId: string,
    voucherId: string
  ): Promise<{ message: string }> => {
    const response = await httpClient.post(`/stockpiles/${stockpileId}/remitos/${voucherId}/anular`)
    return response.data
  },

  cancelStockpileExplicit: async (stockpileId: string): Promise<{ message: string }> => {
    const response = await httpClient.post(`/stockpiles/${stockpileId}/cancelar`)
    return response.data
  },

  archiveCancelledStockpiles: async (): Promise<{ message: string; count: number }> => {
    const response = await httpClient.post('/stockpiles/archivar-cancelados')
    return response.data
  },
}

export default stockpileService
