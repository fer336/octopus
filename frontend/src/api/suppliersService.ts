/**
 * Servicio de Proveedores.
 * Maneja CRUD de proveedores.
 */
import httpClient from './httpClient'
import { PaginatedResponse } from './productsService'

export interface Supplier {
  id: string
  business_id: string
  name: string
  cuit?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  province?: string
  contact_name?: string
  notes?: string
  default_discount_1: number
  default_discount_2: number
  default_discount_3: number
  category_ids: string[]
  created_at: string
  updated_at: string
}

export interface SupplierCreate {
  name: string
  cuit?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  province?: string
  contact_name?: string
  notes?: string
  default_discount_1?: number
  default_discount_2?: number
  default_discount_3?: number
  category_ids?: string[]
}

export interface SupplierUpdate extends Partial<SupplierCreate> {}

export const suppliersService = {
  /**
   * Obtiene la lista de proveedores con paginación y filtros.
   */
  getAll: async (params?: {
    page?: number
    per_page?: number
    search?: string
  }): Promise<PaginatedResponse<Supplier>> => {
    const response = await httpClient.get('/suppliers', { params })
    return response.data
  },

  /**
   * Obtiene un proveedor por ID.
   */
  getById: async (id: string): Promise<Supplier> => {
    const response = await httpClient.get(`/suppliers/${id}`)
    return response.data
  },

  /**
   * Crea un nuevo proveedor.
   */
  create: async (data: SupplierCreate): Promise<Supplier> => {
    const response = await httpClient.post('/suppliers', data)
    return response.data
  },

  /**
   * Actualiza un proveedor existente.
   */
  update: async (id: string, data: SupplierUpdate): Promise<Supplier> => {
    const response = await httpClient.put(`/suppliers/${id}`, data)
    return response.data
  },

  /**
   * Elimina un proveedor (soft delete).
   */
  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/suppliers/${id}`)
  },
}

export default suppliersService
