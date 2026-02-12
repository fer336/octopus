/**
 * Servicio API para Business (Negocio).
 */
import httpClient from './httpClient'

export interface Business {
  id: string
  name: string
  cuit: string
  tax_condition: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  logo_url?: string
  header_text?: string
  sale_point: string
  arca_environment?: string
}

export interface BusinessUpdate {
  name?: string
  cuit?: string
  tax_condition?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  phone?: string
  email?: string
  logo_url?: string
  header_text?: string
  sale_point?: string
}

const businessService = {
  /**
   * Obtiene los datos del negocio del usuario actual.
   */
  async getMyBusiness(): Promise<Business> {
    const response = await httpClient.get('/business/me')
    return response.data
  },

  /**
   * Actualiza los datos del negocio del usuario actual.
   */
  async updateMyBusiness(data: BusinessUpdate): Promise<Business> {
    const response = await httpClient.put('/business/me', data)
    return response.data
  },
}

export default businessService
