/**
 * Servicio de Métodos de Pago.
 */
import httpClient from './httpClient'

export interface PaymentMethod {
  id: string
  created_at: string
  updated_at: string
  business_id: string
  name: string
  code: string
  is_active: boolean
  requires_reference: boolean
}

export interface PaymentMethodCreate {
  name: string
  code?: string
  requires_reference: boolean
  is_active?: boolean
}

export interface PaymentMethodUpdate {
  name: string
  code?: string
  requires_reference: boolean
  is_active: boolean
}

const paymentMethodsService = {
  /**
   * Obtener todos los métodos de pago activos del negocio.
   */
  getAll: async (params?: { active_only?: boolean }): Promise<PaymentMethod[]> => {
    const response = await httpClient.get('/payment-methods', { params })
    return response.data
  },

  create: async (data: PaymentMethodCreate): Promise<PaymentMethod> => {
    const response = await httpClient.post('/payment-methods', data)
    return response.data
  },

  update: async (id: string, data: PaymentMethodUpdate): Promise<PaymentMethod> => {
    const response = await httpClient.put(`/payment-methods/${id}`, data)
    return response.data
  },

  updateStatus: async (id: string, isActive: boolean): Promise<PaymentMethod> => {
    const response = await httpClient.patch(`/payment-methods/${id}/status`, {
      is_active: isActive,
    })
    return response.data
  },
}

export default paymentMethodsService
