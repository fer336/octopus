/**
 * Servicio de Ventas (Comprobantes).
 */
import httpClient from './httpClient'

export interface VoucherItemCreate {
  product_id: string
  quantity: number
  unit_price: number
  discount_percent: number
}

export interface VoucherPayment {
  payment_method_id: string
  amount: number
  reference?: string
}

export interface VoucherCreate {
  client_id: string
  voucher_type: 'quotation' | 'receipt' | 'invoice_a' | 'invoice_b' | 'invoice_c'
  date: string
  notes?: string
  show_prices: boolean
  items: VoucherItemCreate[]
  payments?: VoucherPayment[]
}

export interface Voucher {
  id: string
  client_id: string
  voucher_type: string
  status: string
  sale_point: string
  number: string
  date: string
  subtotal: number
  iva_amount: number
  total: number
  cae?: string
  items: any[]
}

export interface PaginatedVouchers {
  items: Voucher[]
  total: number
  page: number
  per_page: number
  pages: number
}

const vouchersService = {
  getAll: async (params?: {
    page?: number
    per_page?: number
    search?: string
    voucher_type?: string
    status?: string
  }): Promise<PaginatedVouchers> => {
    const response = await httpClient.get('/vouchers', { params })
    return response.data
  },

  create: async (data: VoucherCreate): Promise<Voucher> => {
    const response = await httpClient.post('/vouchers', data)
    return response.data
  },

  getPdfUrl: (id: string): string => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    return `${apiUrl}/vouchers/${id}/pdf`
  },

  /**
   * Descarga el PDF de un comprobante (con autenticación).
   */
  getPdf: async (id: string): Promise<Blob> => {
    const response = await httpClient.get(`/vouchers/${id}/pdf`, {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Elimina un comprobante (soft delete).
   */
  delete: async (id: string, reason?: string): Promise<void> => {
    await httpClient.delete(`/vouchers/${id}/delete`, {
      params: { reason }
    })
  },
}

export default vouchersService
