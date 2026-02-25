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

export interface VoucherItem {
  id: string
  product_id: string
  code: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  discount_percent: number
  iva_rate: number
  subtotal: number
  total: number
}

export interface VoucherClient {
  id: string
  name: string
  document_type: string
  document_number: string
  tax_condition: string
}

export interface Voucher {
  id: string
  client_id: string
  client?: VoucherClient
  voucher_type: string
  status: string
  sale_point: string
  number: string
  date: string
  subtotal: number
  iva_amount: number
  total: number
  cae?: string
  cae_expiration?: string
  has_credit_note: boolean
  /** ID de la factura generada (solo en cotizaciones). Si existe, la cotización ya fue facturada. */
  invoiced_voucher_id?: string | null
  items: VoucherItem[]
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

  /**
   * Lista los comprobantes pendientes de facturar (cotizaciones y/o remitos sin invoiced_voucher_id).
   */
  getPendingQuotations: async (params?: {
    page?: number
    per_page?: number
    search?: string
    voucher_type?: 'quotation' | 'receipt'
    date_from?: string
    date_to?: string
  }): Promise<PaginatedVouchers> => {
    const response = await httpClient.get('/vouchers/pending-quotations', { params })
    return response.data
  },

  /**
   * Convierte una cotización en factura electrónica.
   * Una vez convertida, la cotización queda marcada como facturada.
   * Para revertir: emitir Nota de Crédito Fiscal desde la factura generada.
   */
  convertToInvoice: async (
    quotationId: string,
    payments?: VoucherPayment[]
  ): Promise<Voucher> => {
    const response = await httpClient.post(`/vouchers/${quotationId}/convert-to-invoice`, {
      payments: payments ?? null,
    })
    return response.data
  },
}

export default vouchersService
