/**
 * Servicio de Facturas de Compra (Compras — carga manual e IA).
 * La IA nunca escribe stock/precio directamente: solo extrae un borrador
 * editable que el usuario revisa y confirma explícitamente.
 */
import httpClient from './httpClient'
import { PaginatedResponse } from './productsService'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PurchaseInvoiceStatus = 'draft' | 'confirmed'
export type PurchaseInvoiceSource = 'manual' | 'ai'

export interface PurchaseInvoiceItem {
  id: string
  purchase_invoice_id: string
  product_id: string | null
  lot_id: string | null
  description: string
  quantity: number
  unit_cost: number
  iva_rate: number
  expiration_date: string | null
  subtotal: number
  iva_amount: number
  total: number
  // Datos relacionados (para UI de revisión de borrador)
  product_code?: string | null
  product_description?: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseInvoice {
  id: string
  business_id: string
  supplier_id: string | null
  purchase_order_id: string | null
  created_by: string
  confirmed_by: string | null
  status: PurchaseInvoiceStatus
  source: PurchaseInvoiceSource
  invoice_number: string
  invoice_date: string
  update_stock: boolean
  update_prices: boolean
  subtotal: number
  iva_amount: number
  total: number
  source_document_key: string | null
  is_duplicate_ack: boolean
  confirmed_at: string | null
  items: PurchaseInvoiceItem[]
  // Datos relacionados
  supplier_name?: string | null
  created_by_name?: string | null
  created_at: string
  updated_at: string
  /**
   * Advertencia de posible duplicado (supplier_id + invoice_number ya
   * existente). Campo opcional/forward-compatible: el endpoint de creación
   * actual todavía no lo serializa en la respuesta (el backend calcula el
   * flag internamente pero el router no lo expone), así que hoy nunca
   * llega — se deja tipado para no romper si se agrega más adelante.
   */
  duplicate_warning?: DuplicateWarning | null
}

export interface PurchaseInvoiceListItem {
  id: string
  supplier_id: string | null
  purchase_order_id: string | null
  status: PurchaseInvoiceStatus
  source: PurchaseInvoiceSource
  invoice_number: string
  invoice_date: string
  total: number
  is_duplicate_ack: boolean
  confirmed_at: string | null
  items_count: number
  supplier_name?: string | null
  created_at: string
  updated_at: string
}

export interface DuplicateWarning {
  is_duplicate: boolean
  existing_invoice_id: string | null
  existing_invoice_status: PurchaseInvoiceStatus | null
}

export interface PurchaseInvoiceItemInput {
  product_id?: string | null
  description: string
  quantity: number
  unit_cost: number
  iva_rate: number
  expiration_date?: string | null
}

export interface PurchaseInvoiceCreate {
  supplier_id?: string | null
  purchase_order_id?: string | null
  invoice_number: string
  invoice_date: string
  items: PurchaseInvoiceItemInput[]
}

export interface PurchaseInvoiceUpdate {
  supplier_id?: string | null
  purchase_order_id?: string | null
  invoice_number?: string
  invoice_date?: string
  items?: PurchaseInvoiceItemInput[]
  is_duplicate_ack?: boolean
}

export interface PurchaseInvoiceConfirmRequest {
  update_stock?: boolean
  update_prices?: boolean
}

export interface PurchaseInvoiceReversalRequest {
  supplier_id?: string | null
  purchase_order_id?: string | null
  invoice_number?: string
  invoice_date?: string
  items?: PurchaseInvoiceItemInput[]
  force_adjustment?: boolean
}

export interface ReversalConflictItem {
  lot_id: string
  product_id: string | null
  initial_quantity: number
  remaining_quantity: number
  consumed_quantity: number
}

export interface ReversalConflictError {
  message: string
  conflicts: ReversalConflictItem[]
}

export interface PurchaseInvoiceListParams {
  status?: PurchaseInvoiceStatus
  source?: PurchaseInvoiceSource
  supplier_id?: string
  search?: string
  page?: number
  per_page?: number
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const purchaseInvoicesService = {
  /**
   * Lista facturas de compra con filtros y paginación.
   */
  async list(
    params: PurchaseInvoiceListParams = {},
  ): Promise<PaginatedResponse<PurchaseInvoiceListItem>> {
    const response = await httpClient.get('/purchase-invoices', { params })
    return response.data
  },

  /**
   * Obtiene el detalle completo de una factura de compra.
   */
  async getById(id: string): Promise<PurchaseInvoice> {
    const response = await httpClient.get(`/purchase-invoices/${id}`)
    return response.data
  },

  /**
   * Crea una factura de compra en estado borrador (carga manual).
   */
  async create(data: PurchaseInvoiceCreate): Promise<PurchaseInvoice> {
    const response = await httpClient.post('/purchase-invoices', data)
    return response.data
  },

  /**
   * Edita una factura en estado borrador.
   */
  async update(id: string, data: PurchaseInvoiceUpdate): Promise<PurchaseInvoice> {
    const response = await httpClient.put(`/purchase-invoices/${id}`, data)
    return response.data
  },

  /**
   * Confirma una factura de compra: crea lotes y/o actualiza precios.
   */
  async confirm(id: string, data: PurchaseInvoiceConfirmRequest = {}): Promise<PurchaseInvoice> {
    const response = await httpClient.post(`/purchase-invoices/${id}/confirm`, {
      update_stock: data.update_stock ?? true,
      update_prices: data.update_prices ?? false,
    })
    return response.data
  },

  /**
   * Edita una factura YA CONFIRMADA (reversión + recálculo).
   * Si algún lote generado ya fue consumido y `force_adjustment` no vino en
   * True, el backend responde 409 con `{ message, conflicts }` — el caller
   * debe capturar el error, mostrar los conflictos y reintentar con
   * `force_adjustment: true` tras confirmación explícita del usuario.
   */
  async editConfirmed(
    id: string,
    data: PurchaseInvoiceReversalRequest,
  ): Promise<PurchaseInvoice> {
    const response = await httpClient.post(`/purchase-invoices/${id}/edit-confirmed`, data)
    return response.data
  },

  /**
   * Extrae una factura de un PDF vía IA y crea un borrador editable
   * (`source=ai`). Nunca impacta stock/precios directamente: el borrador
   * queda pendiente de revisión y confirmación humana.
   */
  async aiExtract(file: File, sourceDocumentKey?: string): Promise<PurchaseInvoice> {
    const form = new FormData()
    form.append('file', file)
    if (sourceDocumentKey) form.append('source_document_key', sourceDocumentKey)

    const response = await httpClient.post('/purchase-invoices/ai-extract', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
}

export default purchaseInvoicesService
