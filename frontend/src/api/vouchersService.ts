/**
 * Servicio de Ventas (Comprobantes).
 */
import httpClient, { getTenantApiUrl } from './httpClient'

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

export type LegacyPaymentMethod = 'cash' | 'transfer' | 'check' | 'credit_card' | 'debit_card' | 'mercadopago' | 'other'

export type PriceStrategy = 'historical' | 'current'

export interface VoucherCreate {
  client_id: string
  voucher_type: 'quotation' | 'receipt' | 'invoice_a' | 'invoice_b' | 'invoice_c' | 'invoice_x'
  date: string
  notes?: string
  show_prices: boolean
  is_current_account?: boolean
  billing_client_id?: string
  operating_client_id?: string
  general_discount: number
  payment_days?: number // Días de plazo para facturas en cuenta corriente
  // Vínculo remito hijo → acopio padre
  stockpile_id?: string
  items: VoucherItemCreate[]
  payments?: VoucherPayment[]
}

export interface VoucherTotalsPreviewRequest {
  voucher_type: 'quotation' | 'receipt' | 'invoice_a' | 'invoice_b' | 'invoice_c' | 'invoice_x'
  general_discount: number
  items: VoucherItemCreate[]
}

export interface CustomerCreditReturnRequest {
  client_id: string
  date: string
  notes?: string
  general_discount: number
  items: VoucherItemCreate[]
}

export interface CustomerCreditReturnResponse {
  client_id: string
  return_receipt_id?: string | null
  return_receipt_number?: string | null
  credit_amount: number
  previous_balance: number
  new_balance: number
  subtotal: number
  iva_amount: number
  total: number
  message: string
}

export interface VoucherUpdate {
  client_id: string
  date: string
  notes?: string
  show_prices: boolean
  general_discount: number
  items: VoucherItemCreate[]
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

export interface VoucherPartySummary {
  id: string
  name: string
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
  notes?: string
  show_prices?: boolean
  is_current_account?: boolean
  is_current_account_closure?: boolean
  is_return_receipt?: boolean
  current_account_closure_voucher_id?: string | null
  is_receipt_linked_to_current_account_closure?: boolean
  billing_client_id?: string
  operating_client_id?: string
  billing_client?: VoucherPartySummary | null
  operating_client?: VoucherPartySummary | null
  is_withdrawal_authorized?: boolean
  withdrawal_client_name?: string | null
  general_discount?: number
  subtotal: number
  iva_amount: number
  total: number
  cae?: string
  cae_expiration?: string
  has_credit_note: boolean
  /** ID de la factura generada (solo en cotizaciones). Si existe, la cotización ya fue facturada. */
  invoiced_voucher_id?: string | null
  /** ID del comprobante relacionado (ej: factura origen de una nota de crédito). */
  related_voucher_id?: string | null
  deleted_at?: string | null
  deletion_reason?: string | null
  payment_days?: number | null
  is_paid?: boolean
  payment_date?: string | null
  paid_amount?: number | null
  stockpile_id?: string | null
  is_stockpile_principal_receipt?: boolean
  items: VoucherItem[]
}

export interface VoucherPayRequest {
  payment_date: string
  amount: number
  payment_method: LegacyPaymentMethod
  reference?: string
  notes?: string
}

export interface VoucherPayResponse {
  voucher_id: string
  is_paid: boolean
  payment_date: string
  paid_amount: number
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
    payment_method_id?: string
    is_current_account?: boolean
    current_account_status?: string
    date_from?: string
    date_to?: string
  }): Promise<PaginatedVouchers> => {
    const response = await httpClient.get('/vouchers', { params })
    return response.data
  },

  /**
   * Obtiene una cotización por código (formato: sale_point-number, ej: "0001-00000001").
   * Útil para cargar un presupuesto existente y autocompletar la tabla de productos.
   */
  getByCode: async (code: string): Promise<Voucher> => {
    const response = await httpClient.get(`/vouchers/by-code/${encodeURIComponent(code)}`)
    return response.data
  },

  /**
   * Compara precios de una cotización con el catálogo actual.
   * Devuelve diferencias para que el frontend pueda preguntar al usuario
   * si quiere actualizar precios al cargar la cotización.
   */
  checkPrices: async (code: string): Promise<{
    has_differences: boolean
    differences: Array<{
      product_id: string
      product_name: string
      code: string
      old_price: number
      current_price: number
      difference_percent: number
    }>
    affected_items: number
    total_items: number
  }> => {
    const response = await httpClient.get(`/vouchers/by-code/${encodeURIComponent(code)}/check-prices`)
    return response.data
  },

  create: async (data: VoucherCreate): Promise<Voucher> => {
    const response = await httpClient.post('/vouchers', data)
    return response.data
  },

  previewTotals: async (data: VoucherTotalsPreviewRequest): Promise<{
    subtotal: number
    iva_amount: number
    total: number
  }> => {
    const response = await httpClient.post('/vouchers/preview-totals', data)
    return response.data
  },

  registerCustomerCreditReturn: async (data: CustomerCreditReturnRequest): Promise<CustomerCreditReturnResponse> => {
    const response = await httpClient.post('/vouchers/customer-credit-return', data)
    return response.data
  },

  update: async (id: string, data: VoucherUpdate): Promise<Voucher> => {
    const response = await httpClient.put(`/vouchers/${id}`, data)
    return response.data
  },

  getPdfUrl: (id: string, params?: { copy?: string; hide_discount?: boolean }): string => {
    const base = `${getTenantApiUrl()}/vouchers/${id}/pdf`
    if (params) {
      const search = new URLSearchParams()
      if (params.copy) search.set('copy', params.copy)
      if (params.hide_discount) search.set('hide_discount', 'true')
      return `${base}?${search.toString()}`
    }
    return `${base}?copy=original`
  },

  /**
   * Descarga el PDF de un comprobante (con autenticación).
   */
  getPdf: async (id: string, params?: { copy?: string; hide_discount?: boolean }): Promise<Blob> => {
    const response = await httpClient.get(`/vouchers/${id}/pdf`, {
      responseType: 'blob',
      params: params || { copy: 'original' },
    })
    return response.data
  },

  getPaymentReceiptPdf: async (id: string): Promise<Blob> => {
    const response = await httpClient.get(`/vouchers/${id}/payment-receipt/pdf`, {
      responseType: 'blob',
    })
    return response.data
  },

  payCurrentAccountInvoice: async (id: string, data: VoucherPayRequest): Promise<VoucherPayResponse> => {
    const response = await httpClient.post(`/vouchers/${id}/pay`, data)
    return response.data
  },

  /**
   * Elimina un comprobante (soft delete).
   */
  delete: async (id: string, reason: string): Promise<void> => {
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
    payments?: VoucherPayment[],
    fiscalClientId?: string,
    priceStrategy?: PriceStrategy,
    currentAccount?: { enabled: boolean; paymentDays?: number },
  ): Promise<Voucher> => {
    const response = await httpClient.post(`/vouchers/${quotationId}/convert-to-invoice`, {
      payments: payments ?? null,
      fiscal_client_id: fiscalClientId ?? null,
      price_strategy: priceStrategy ?? 'historical',
      is_current_account: currentAccount?.enabled ?? false,
      payment_days: currentAccount?.enabled ? currentAccount.paymentDays : null,
    })
    return response.data
  },

  closeCurrentAccount: async (data: {
    billing_client_id: string
    receipt_ids?: string[]
    close_all: boolean
    notes?: string
  }): Promise<Voucher> => {
    const response = await httpClient.post('/vouchers/current-account/close', data)
    return response.data
  },

  getCurrentAccountReceipts: async (params?: {
    page?: number
    per_page?: number
    billing_client_id?: string
    pending_only?: boolean
    search?: string
  }): Promise<PaginatedVouchers> => {
    const response = await httpClient.get('/vouchers/current-account/receipts', { params })
    return response.data
  },

  // Preview de cierre sin persistir (datos)
  previewCurrentAccountClose: async (data: {
    billing_client_id: string
    receipt_ids?: string[]
    close_all?: boolean
    notes?: string
  }): Promise<{
    billing_client_name: string
    items: Array<{
      receipt_id: string
      receipt_number: string
      receipt_date: string
      operating_client_name?: string
      is_withdrawal_authorized: boolean
      code: string
      description: string
      quantity: number
      unit_price: number
      discount_percent: number
      iva_rate: number
      subtotal: number
      total: number
    }>
    total_receipts: number
    total_items: number
    subtotal: number
    iva_amount: number
    total: number
  }> => {
    const response = await httpClient.post('/vouchers/current-account/preview', data)
    return response.data
  },

  // Preview PDF de cierre (descarga directo)
  previewCurrentAccountClosePdf: async (data: {
    billing_client_id: string
    receipt_ids?: string[]
    close_all?: boolean
    notes?: string
  }): Promise<Blob> => {
    const response = await httpClient.post('/vouchers/current-account/preview-pdf', data, {
      responseType: 'blob',
    })
    return response.data
  },

  // Histórico de cierres por cliente titular
  getCurrentAccountHistory: async (billingClientId: string): Promise<{
    closures: Array<{
      closure_voucher_id: string
      closure_number: string
      closure_date: string
      notes?: string
      total_receipts: number
      total_items: number
      subtotal: number
      iva_amount: number
      total: number
      receipts: Array<{
        receipt_id: string
        receipt_number: string
        receipt_date: string
        operating_client_name?: string
        total: number
      }>
    }>
    total: number
  }> => {
    const response = await httpClient.get(`/vouchers/current-account/history/${billingClientId}`)
    return response.data
  },

  /**
   * Previsualiza los totales de una compilación sin crear la factura.
   * Calcula subtotal, IVA y total según la estrategia de precios elegida.
   */
  previewCompile: async (
    quotationIds: string[],
    generalDiscount?: number,
    priceStrategy?: PriceStrategy,
    fiscalClientId?: string,
  ): Promise<{
    subtotal: number
    iva_amount: number
    total: number
    discount_amount: number
    voucher_count: number
    item_count: number
    invoice_variant: string
    fiscal_client_id: string | null
  }> => {
    const response = await httpClient.post('/vouchers/compile-to-invoice/preview', {
      quotation_ids: quotationIds,
      general_discount: generalDiscount ?? 0,
      price_strategy: priceStrategy ?? 'historical',
      fiscal_client_id: fiscalClientId || null,
    })
    return response.data
  },

  /**
   * Compila múltiples cotizaciones en una sola factura.
   * Las cotizaciones origen quedan marcadas como facturadas.
   * Útil para facturar varios presupuestos de un mismo cliente juntos.
   */
  compileToInvoice: async (
    quotationIds: string[],
    payments?: VoucherPayment[],
    generalDiscount?: number,
    fiscalClientId?: string,
    priceStrategy?: PriceStrategy,
    currentAccount?: { enabled: boolean; paymentDays?: number },
  ): Promise<Voucher> => {
    const response = await httpClient.post('/vouchers/compile-to-invoice', {
      quotation_ids: quotationIds,
      payments: payments ?? null,
      general_discount: generalDiscount ?? 0,
      fiscal_client_id: fiscalClientId ?? null,
      price_strategy: priceStrategy ?? 'historical',
      is_current_account: currentAccount?.enabled ?? false,
      payment_days: currentAccount?.enabled ? currentAccount.paymentDays : null,
    })
    return response.data
  },

  /**
   * Obtiene las cotizaciones origen de una factura compilada.
   */
  getSourceQuotations: async (invoiceId: string): Promise<
    Array<{
      id: string
      voucher_type: string
      code: string
      date: string
      client_name: string
      total: number
      item_count: number
    }>
  > => {
    const response = await httpClient.get(
      `/vouchers/${invoiceId}/source-quotations`,
    )
    return response.data
  },

  // ========================================
  // AUTORIZACIONES (4-eyes principle)
  // ========================================

  /**
   * Obtiene las autorizaciones pendientes para el usuario actual (manager/owner).
   */
  getPendingAuthorizations: async (): Promise<{
    items: Array<{
      id: string
      requested_by_user_id: string
      authorization_type: string
      resource_id: string
      reason: string
      created_at: string | null
    }>
    total: number
  }> => {
    const response = await httpClient.get('/vouchers/authorizations/pending')
    return response.data
  },

  /**
   * Aprueba una solicitud de autorización y ejecuta la eliminación.
   */
  approveAuthorization: async (authorizationId: string): Promise<{ message: string }> => {
    const response = await httpClient.post(
      `/vouchers/authorizations/${authorizationId}/approve`,
    )
    return response.data
  },

  /**
   * Rechaza una solicitud de autorización.
   */
  rejectAuthorization: async (
    authorizationId: string,
    rejectionReason: string,
  ): Promise<{ message: string }> => {
    const response = await httpClient.post(
      `/vouchers/authorizations/${authorizationId}/reject?rejection_reason=${encodeURIComponent(rejectionReason)}`,
    )
    return response.data
  },
}

export default vouchersService
