/**
 * Servicio de Dashboard.
 * Obtiene estadísticas y resumen del negocio.
 */
import httpClient from './httpClient'

export interface DashboardSummary {
  total_products: number
  total_clients: number
  low_stock_products: number
  total_value: number
}

export const dashboardService = {
  /**
   * Obtiene el resumen del dashboard.
   */
  getSummary: async (): Promise<DashboardSummary> => {
    const response = await httpClient.get('/dashboard/summary')
    return response.data
  },
}

export default dashboardService
