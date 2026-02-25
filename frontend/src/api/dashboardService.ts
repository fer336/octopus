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
  total_sales: number
  total_invoices: number
  filter_month: number
  filter_year: number
}

export interface DashboardSummaryParams {
  month?: number
  year?: number
}

export const dashboardService = {
  /**
   * Obtiene el resumen del dashboard, opcionalmente filtrado por mes/año.
   */
  getSummary: async (params?: DashboardSummaryParams): Promise<DashboardSummary> => {
    const response = await httpClient.get('/dashboard/summary', { params })
    return response.data
  },
}

export default dashboardService
