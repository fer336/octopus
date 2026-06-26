/**
 * Servicio API para Rentabilidad y Reportes.
 * Endpoints para KPIs, rentabilidad por producto/cliente/categoría,
 * gastos y resumen de cuenta corriente.
 */
import httpClient from './httpClient'
import { PaginatedResponse } from './productsService'

// ── Filters ─────────────────────────────────────────────────────────

export interface ProfitabilityFilter {
  date_from?: string
  date_to?: string
  page?: number
  per_page?: number
  search?: string
}

// ── Comparison (período anterior) ────────────────────────────────────

export interface ProfitabilityComparison {
  revenue_change_pct: number
  cost_change_pct: number
  profit_change_pct: number
  margin_change_pct: number
}

// ── Summary ──────────────────────────────────────────────────────────

export interface ProfitabilitySummary {
  total_revenue: number
  total_cost: number
  gross_margin: number
  gross_margin_pct: number
  total_expenses: number
  net_profit: number
  avg_ticket: number
  stockpile_income: number
  invoice_count: number
  markup_pct: number
  units_sold: number
  comparison: ProfitabilityComparison | null
}

// ── Product profit ───────────────────────────────────────────────────

export interface ProductProfit {
  product_id: string
  code: string
  description: string
  category_name: string | null
  quantity_sold: number
  revenue: number
  cost: number
  margin: number
  margin_pct: number
  markup_pct: number
}

// ── Client profit ────────────────────────────────────────────────────

export interface ClientProfit {
  client_id: string
  name: string
  total_billed: number
  total_cost: number
  margin: number
  margin_pct: number
  invoice_count: number
}

// ── Category profit ──────────────────────────────────────────────────

export interface CategoryProfit {
  category_id: string
  name: string
  revenue: number
  cost: number
  margin: number
  margin_pct: number
  item_count: number
}

// ── Stockpile income ─────────────────────────────────────────────────

export interface StockpileIncome {
  stockpile_id: string
  client_name: string
  total_paid: number
  total_withdrawn: number
  remaining: number
  status: string
}

// ── Expenses ─────────────────────────────────────────────────────────

export interface ExpenseOut {
  id: string
  business_id: string
  category_id?: string
  category_name?: string
  description: string
  amount: number
  date: string
  is_recurring: boolean
  created_by: string
  created_at: string
}

export interface ExpenseCreate {
  category_id?: string
  description: string
  amount: number
  date: string
  is_recurring?: boolean
}

export interface ExpenseUpdate extends Partial<ExpenseCreate> {}

export interface ExpenseCategoryOut {
  id: string
  name: string
  is_active: boolean
}

export interface ExpenseCategoryCreate {
  name: string
}

// ── Extended filters ─────────────────────────────────────────────────

export interface ProfitabilityFilters {
  date_from?: string
  date_to?: string
  branch_id?: string
  seller_id?: string
  client_id?: string
  category_id?: string
  brand_id?: string
  document_type?: string
  status?: string
  search?: string
  page?: number
  per_page?: number
  group_by?: 'day' | 'week' | 'month'
}

// ── Evolution ────────────────────────────────────────────────────────

export interface EvolutionPoint {
  period: string
  revenue: number
  cost: number
  profit: number
  margin_pct: number
}

// ── Brand profit ─────────────────────────────────────────────────────

export interface BrandProfit {
  brand_id: string
  brand_name: string
  revenue: number
  cost: number
  profit: number
  margin_pct: number
  markup_pct: number
  units_sold: number
}

// ── Seller profit ────────────────────────────────────────────────────

export interface SellerProfit {
  user_id: string
  seller_name: string
  revenue: number
  profit: number
  margin_pct: number
  discounts_total: number
  invoice_count: number
}

// ── Document profit ──────────────────────────────────────────────────

export interface DocumentProfit {
  voucher_id: string
  document_type: string
  document_number: string
  date: string
  client_name: string
  seller_name: string
  revenue: number
  cost: number
  profit: number
  margin_pct: number
  status: string
}

// ── Alerts ───────────────────────────────────────────────────────────

export interface ProfitabilityAlert {
  type: string
  voucher_id: string | null
  product_name: string
  client_name: string | null
  revenue: number
  cost: number | null
  margin_pct: number | null
  reason: string
}

export interface AlertSummary {
  negative_margin_count: number
  low_margin_count: number
  no_cost_count: number
  excessive_discount_count: number
  alerts: ProfitabilityAlert[]
}

// ── Account summary ──────────────────────────────────────────────────

export interface AccountSummary {
  client_id: string
  client_name: string
  total_debt: number
  overdue: number
  paid_this_month: number
  balance: number
  aging_days: number
}

// ── Service ──────────────────────────────────────────────────────────

export const profitabilityService = {
  /**
   * Obtiene el resumen de rentabilidad (KPIs del período).
   */
  getSummary: async (params?: ProfitabilityFilter): Promise<ProfitabilitySummary> => {
    const response = await httpClient.get('/profitability/summary', { params })
    return response.data
  },

  /**
   * Obtiene rentabilidad desglosada por producto.
   */
  getProducts: async (params?: ProfitabilityFilter): Promise<PaginatedResponse<ProductProfit>> => {
    const response = await httpClient.get('/profitability/products', { params })
    return response.data
  },

  /**
   * Obtiene rentabilidad desglosada por cliente.
   */
  getClients: async (params?: ProfitabilityFilter): Promise<PaginatedResponse<ClientProfit>> => {
    const response = await httpClient.get('/profitability/clients', { params })
    return response.data
  },

  /**
   * Obtiene rentabilidad desglosada por categoría.
   */
  getCategories: async (params?: ProfitabilityFilter): Promise<PaginatedResponse<CategoryProfit>> => {
    const response = await httpClient.get('/profitability/categories', { params })
    return response.data
  },

  /**
   * Obtiene ingresos por acopios.
   */
  getStockpiles: async (params?: ProfitabilityFilter): Promise<PaginatedResponse<StockpileIncome>> => {
    const response = await httpClient.get('/profitability/stockpiles', { params })
    return response.data
  },

  /**
   * Obtiene la lista de gastos con paginación y filtros.
   */
  getExpenses: async (params?: ProfitabilityFilter): Promise<PaginatedResponse<ExpenseOut>> => {
    const response = await httpClient.get('/profitability/expenses', { params })
    return response.data
  },

  /**
   * Crea un nuevo gasto.
   */
  createExpense: async (data: ExpenseCreate): Promise<ExpenseOut> => {
    const response = await httpClient.post('/profitability/expenses', data)
    return response.data
  },

  /**
   * Actualiza un gasto existente.
   */
  updateExpense: async (id: string, data: ExpenseUpdate): Promise<ExpenseOut> => {
    const response = await httpClient.put(`/profitability/expenses/${id}`, data)
    return response.data
  },

  /**
   * Elimina un gasto (soft delete).
   */
  deleteExpense: async (id: string): Promise<void> => {
    await httpClient.delete(`/profitability/expenses/${id}`)
  },

  /**
   * Obtiene la lista de categorías de gasto activas.
   */
  getExpenseCategories: async (): Promise<ExpenseCategoryOut[]> => {
    const response = await httpClient.get('/profitability/expenses/categories')
    return response.data
  },

  /**
   * Crea una nueva categoría de gasto.
   */
  createExpenseCategory: async (data: ExpenseCategoryCreate): Promise<ExpenseCategoryOut> => {
    const response = await httpClient.post('/profitability/expenses/categories', data)
    return response.data
  },

  /**
   * Obtiene el resumen de cuenta corriente de un cliente.
   */
  getAccountSummary: async (clientId: string): Promise<AccountSummary> => {
    const response = await httpClient.get(`/clients/${clientId}/account-summary`)
    return response.data
  },

  /**
   * Obtiene la evolución temporal de rentabilidad.
   */
  getEvolution: async (params?: ProfitabilityFilters): Promise<EvolutionPoint[]> => {
    const response = await httpClient.get('/profitability/evolution', { params })
    return response.data
  },

  /**
   * Obtiene rentabilidad desglosada por marca.
   */
  getBrands: async (params?: ProfitabilityFilters): Promise<PaginatedResponse<BrandProfit>> => {
    const response = await httpClient.get('/profitability/brands', { params })
    return response.data
  },

  /**
   * Obtiene rentabilidad desglosada por vendedor.
   */
  getSellers: async (params?: ProfitabilityFilters): Promise<PaginatedResponse<SellerProfit>> => {
    const response = await httpClient.get('/profitability/sellers', { params })
    return response.data
  },

  /**
   * Obtiene rentabilidad desglosada por documento.
   */
  getDocuments: async (params?: ProfitabilityFilters): Promise<PaginatedResponse<DocumentProfit>> => {
    const response = await httpClient.get('/profitability/documents', { params })
    return response.data
  },

  /**
   * Obtiene alertas de rentabilidad (márgenes negativos/bajos, productos sin costo).
   */
  getAlerts: async (params?: ProfitabilityFilters): Promise<AlertSummary> => {
    const response = await httpClient.get('/profitability/alerts', { params })
    return response.data
  },

  /**
   * Exporta datos de rentabilidad en el formato indicado.
   */
  exportProfitability: async (format: 'excel' | 'csv', tab: string, params?: ProfitabilityFilters): Promise<Blob> => {
    const response = await httpClient.get(`/profitability/export/${format}`, {
      params: { ...params, tab },
      responseType: 'blob',
    })
    return response.data
  },
}

export default profitabilityService
