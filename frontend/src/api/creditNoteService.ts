/**
 * Servicio de Notas de Crédito.
 */
import httpClient from './httpClient'

export interface CreditNoteItem {
  product_id: string
  quantity: number
  unit_price: number
  discount_percent: number
}

export interface CreditNoteCreate {
  original_voucher_id: string
  reason: string
  items: CreditNoteItem[]
}

export interface CreditNoteResponse {
  id: string
  voucher_type: string
  sale_point: string
  number: string
  full_number: string
  date: string
  subtotal: number
  iva_amount: number
  total: number
  cae?: string
  cae_expiration?: string
  original_voucher_id: string
}

const creditNoteService = {
  /**
   * Crea una Nota de Crédito a partir de una factura.
   */
  create: async (voucherId: string, data: CreditNoteCreate): Promise<CreditNoteResponse> => {
    const response = await httpClient.post(`/vouchers/${voucherId}/credit-note`, data)
    return response.data
  },
}

export default creditNoteService
