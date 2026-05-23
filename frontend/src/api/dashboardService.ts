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
  today_sales: number
  today_invoiced: number
  today_vouchers_count: number
  cash_income: number
  paid_invoices: number
  paid_stockpiles: number
  current_account_collected: number
  pending_customer_balance: number
  other_income: number
  closed_current_accounts: number
  closed_current_accounts_total: number
  filter_month: number
  filter_year: number
  filter_date_from: string
  filter_date_to: string
}

export interface DashboardSummaryParams {
  month?: number
  year?: number
  date_from?: string
  date_to?: string
}

export interface MonthlyTrend {
  month: number
  year: number
  label: string
  cash_income: number
  total_sales: number
  pending_customer_balance: number
}

export const dashboardService = {
  /**
   * Obtiene el resumen del dashboard, opcionalmente filtrado por mes/año o rango de fechas.
   */
  getSummary: async (params?: DashboardSummaryParams): Promise<DashboardSummary> => {
    const response = await httpClient.get('/dashboard/summary', { params })
    return response.data
  },

  /**
   * Tendencia mensual de ingresos vs facturado.
   */
  getTrend: async (months: number = 6): Promise<MonthlyTrend[]> => {
    const response = await httpClient.get('/dashboard/trend', { params: { months } })
    return response.data
  },
}

export default dashboardService
