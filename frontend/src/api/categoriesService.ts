/**
 * Servicio de Categorías.
 * Maneja CRUD de categorías y árbol jerárquico.
 */
import httpClient from './httpClient'

export interface Category {
  id: string
  business_id: string
  parent_id?: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  subcategories?: Category[]
}

export interface CategoryCreate {
  name: string
  description?: string
  parent_id?: string
}

export interface CategoryUpdate extends Partial<CategoryCreate> {}

export const categoriesService = {
  /**
   * Obtiene todas las categorías (planas).
   */
  getAll: async (): Promise<Category[]> => {
    const response = await httpClient.get('/categories')
    // El backend devuelve PaginatedResponse, extraer los items
    return response.data.items || response.data
  },

  /**
   * Obtiene el árbol de categorías jerárquico.
   */
  getTree: async (): Promise<Category[]> => {
    const response = await httpClient.get('/categories/tree')
    return response.data
  },

  /**
   * Obtiene una categoría por ID.
   */
  getById: async (id: string): Promise<Category> => {
    const response = await httpClient.get(`/categories/${id}`)
    return response.data
  },

  /**
   * Crea una nueva categoría.
   */
  create: async (data: CategoryCreate): Promise<Category> => {
    const response = await httpClient.post('/categories', data)
    return response.data
  },

  /**
   * Actualiza una categoría existente.
   */
  update: async (id: string, data: CategoryUpdate): Promise<Category> => {
    const response = await httpClient.put(`/categories/${id}`, data)
    return response.data
  },

  /**
   * Elimina una categoría (soft delete).
   */
  delete: async (id: string): Promise<void> => {
    await httpClient.delete(`/categories/${id}`)
  },
}

export default categoriesService
