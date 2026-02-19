/**
 * Servicio de Métodos de Pago.
 */
import httpClient from './httpClient'

export interface PaymentMethod {
  id: string
  business_id: string
  name: string
  code: string
  is_active: boolean
  requires_reference: boolean
}

const paymentMethodsService = {
  /**
   * Obtener todos los métodos de pago activos del negocio.
   */
  getAll: async (): Promise<PaymentMethod[]> => {
    const response = await httpClient.get('/payment-methods')
    return response.data
  },
}

export default paymentMethodsService
