/**
 * Servicio de Órdenes de Pedido.
 * Gestiona el control de inventario físico y las órdenes a proveedores.
 */
import httpClient from './httpClient'
import { PaginatedResponse } from './productsService'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PurchaseOrderStatus = 'draft' | 'confirmed'

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  product_id: string
  system_stock: number
  counted_stock: number | null
  quantity_to_order: number
  unit_cost: number
  iva_rate: number
  subtotal: number
  iva_amount: number
  total: number
  // Datos del producto (enriquecidos por el backend)
  product_code?: string
  product_description?: string
  product_supplier_code?: string
  category_name?: string
  supplier_name?: string
}

export interface PurchaseOrder {
  id: string
  business_id: string
  supplier_id: string | null
  category_id: string | null
  created_by: string
  status: PurchaseOrderStatus
  subtotal: number
  total_iva: number
  total: number
  notes: string | null
  confirmed_at: string | null
  items: PurchaseOrderItem[]
  // Datos relacionados
  supplier_name?: string
  category_name?: string
  created_by_name?: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrderListItem {
  id: string
  supplier_id: string | null
  category_id: string | null
  status: PurchaseOrderStatus
  subtotal: number
  total_iva: number
  total: number
  confirmed_at: string | null
  items_count: number
  supplier_name?: string
  category_name?: string
  created_by_name?: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrderItemCreate {
  product_id: string
  system_stock: number
  counted_stock?: number | null
  quantity_to_order: number
  unit_cost: number
  iva_rate: number
}

export interface PurchaseOrderCreate {
  supplier_id?: string | null
  category_id?: string | null
  notes?: string
  items: PurchaseOrderItemCreate[]
}

export interface PurchaseOrderUpdate {
  notes?: string
  items?: PurchaseOrderItemCreate[]
}

export interface PurchaseOrderListParams {
  supplier_id?: string
  category_id?: string
  status?: PurchaseOrderStatus
  page?: number
  per_page?: number
}

// Producto para la tabla de conteo (enriquecido desde el endpoint de productos)
export interface CountSheetProduct {
  id: string
  code: string
  description: string
  current_stock: number
  iva_rate: number
  list_price: number
  discount_1: number
  discount_2: number
  discount_3: number
  category_id: string | null
  supplier_id: string | null
  category_name?: string
  supplier_name?: string
  // Campos de UI (no vienen del backend)
  counted_stock?: number | null
  quantity_to_order?: number
  unit_cost?: number  // calculado en frontend
  selected?: boolean  // si fue marcado para pedir
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calcula el precio de costo aplicando bonificaciones en cadena.
 * precio_costo = precio_lista × (1 - d1/100) × (1 - d2/100) × (1 - d3/100)
 */
export function calculateUnitCost(
  listPrice: number,
  discount1: number,
  discount2: number,
  discount3: number,
): number {
  const cost =
    listPrice *
    (1 - discount1 / 100) *
    (1 - discount2 / 100) *
    (1 - discount3 / 100)
  return Math.round(cost * 100) / 100
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const purchaseOrdersService = {
  /**
   * Descarga la planilla de conteo físico en PDF.
   */
  async downloadCountSheetPdf(
    supplierId?: string,
    categoryId?: string,
  ): Promise<void> {
    const params = new URLSearchParams()
    if (supplierId) params.append('supplier_id', supplierId)
    if (categoryId) params.append('category_id', categoryId)

    const response = await httpClient.get(
      `/purchase-orders/inventory-count/pdf?${params.toString()}`,
      { responseType: 'blob' },
    )

    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '_')
    link.setAttribute('download', `planilla_conteo_${today}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },

  /**
   * Lista todas las órdenes de pedido con filtros y paginación.
   */
  async list(
    params: PurchaseOrderListParams = {},
  ): Promise<PaginatedResponse<PurchaseOrderListItem>> {
    const response = await httpClient.get('/purchase-orders', { params })
    return response.data
  },

  /**
   * Obtiene el detalle completo de una orden.
   */
  async getById(id: string): Promise<PurchaseOrder> {
    const response = await httpClient.get(`/purchase-orders/${id}`)
    return response.data
  },

  /**
   * Crea una nueva orden de pedido en estado DRAFT.
   */
  async create(data: PurchaseOrderCreate): Promise<PurchaseOrder> {
    const response = await httpClient.post('/purchase-orders', data)
    return response.data
  },

  /**
   * Actualiza una orden en estado DRAFT.
   */
  async update(id: string, data: PurchaseOrderUpdate): Promise<PurchaseOrder> {
    const response = await httpClient.put(`/purchase-orders/${id}`, data)
    return response.data
  },

  /**
   * Confirma una orden (DRAFT → CONFIRMED).
   */
  async confirm(id: string): Promise<PurchaseOrder> {
    const response = await httpClient.post(`/purchase-orders/${id}/confirm`)
    return response.data
  },

  /**
   * Elimina una orden en estado DRAFT.
   */
  async delete(id: string): Promise<void> {
    await httpClient.delete(`/purchase-orders/${id}`)
  },

  /**
   * Descarga el PDF de una orden de pedido.
   */
  async downloadPdf(id: string, supplierName?: string): Promise<void> {
    const response = await httpClient.get(`/purchase-orders/${id}/pdf`, {
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '_')
    const slug = supplierName?.replace(/\s+/g, '_').substring(0, 20) ?? 'orden'
    link.setAttribute('download', `orden_pedido_${slug}_${today}.pdf`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}

export default purchaseOrdersService
