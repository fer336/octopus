/**
 * Servicio de Marcas.
 * Maneja CRUD de marcas normalizadas.
 */
import httpClient from './httpClient'

export interface Brand {
  id: string
  business_id: string
  name: string
  normalized_name: string
  created_at: string
  updated_at: string
}

export interface BrandCreate {
  name: string
}

export interface BrandUpdate extends Partial<BrandCreate> {}

export interface BrandsPaginatedResponse {
  items: Brand[]
  total: number
  page: number
  per_page: number
  pages: number
}

export const brandsService = {
  getAll: async (params?: { search?: string; page?: number; per_page?: number }): Promise<BrandsPaginatedResponse> => {
    const response = await httpClient.get('/brands', { params })
    return response.data
  },

  create: async (data: BrandCreate): Promise<Brand> => {
    const response = await httpClient.post('/brands', data)
    return response.data
  },

  update: async (id: string, data: BrandUpdate): Promise<Brand> => {
    const response = await httpClient.put(`/brands/${id}`, data)
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/brands/${id}`)
  },
}

export default brandsService
