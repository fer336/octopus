/**
 * Servicio API para exportación de reportes.
 */
import { httpClient } from './httpClient'

export const REPORT_FORMAT = {
  PDF: 'pdf',
  EXCEL: 'xlsx',
  CSV: 'csv',
} as const

export type ReportFormat = (typeof REPORT_FORMAT)[keyof typeof REPORT_FORMAT]

export const REPORT_TYPE = {
  STOCK: 'stock',
  SALES: 'sales',
  TOP_PRODUCTS: 'top-products',
  CLIENT_ACCOUNTS: 'client-accounts',
  INVENTORY_COUNT: 'inventory-count',
  CATEGORY: 'category',
  SUPPLIER: 'supplier',
  PURCHASE_ORDER_HISTORY: 'purchase-order-history',
  STOCKPILE_WITHDRAWALS: 'stockpile-withdrawals',
  CURRENT_ACCOUNT_WITHDRAWALS: 'current-account-withdrawals',
} as const

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE]

export interface ReportFilters {
  search?: string
  categoryId?: string
  supplierId?: string
  lowStockOnly?: boolean
  includeInactive?: boolean
  includeReceipts?: boolean
  onlyWithBalance?: boolean
  onlyWithStock?: boolean
  dateFrom?: string
  dateTo?: string
  limit?: number
  status?: string
  stockpileId?: string
  clientId?: string
}

const endpointByType: Record<ReportType, string> = {
  [REPORT_TYPE.STOCK]: '/reports/stock',
  [REPORT_TYPE.SALES]: '/reports/sales',
  [REPORT_TYPE.TOP_PRODUCTS]: '/reports/top-products',
  [REPORT_TYPE.CLIENT_ACCOUNTS]: '/reports/client-accounts',
  [REPORT_TYPE.INVENTORY_COUNT]: '/reports/inventory-count',
  [REPORT_TYPE.CATEGORY]: '/reports/category',
  [REPORT_TYPE.SUPPLIER]: '/reports/supplier',
  [REPORT_TYPE.PURCHASE_ORDER_HISTORY]: '/reports/purchase-order-history',
  [REPORT_TYPE.STOCKPILE_WITHDRAWALS]: '/reports/stockpile-withdrawals',
  [REPORT_TYPE.CURRENT_ACCOUNT_WITHDRAWALS]: '/reports/current-account-withdrawals',
}

const filenameByType: Record<ReportType, string> = {
  [REPORT_TYPE.STOCK]: 'stock',
  [REPORT_TYPE.SALES]: 'ventas',
  [REPORT_TYPE.TOP_PRODUCTS]: 'productos_mas_vendidos',
  [REPORT_TYPE.CLIENT_ACCOUNTS]: 'cuentas_corrientes',
  [REPORT_TYPE.INVENTORY_COUNT]: 'planilla_conteo',
  [REPORT_TYPE.CATEGORY]: 'categorias',
  [REPORT_TYPE.SUPPLIER]: 'proveedores',
  [REPORT_TYPE.PURCHASE_ORDER_HISTORY]: 'historial_ordenes',
  [REPORT_TYPE.STOCKPILE_WITHDRAWALS]: 'retiros_acopio',
  [REPORT_TYPE.CURRENT_ACCOUNT_WITHDRAWALS]: 'retiros_cuenta_corriente',
}

function appendIfPresent(params: URLSearchParams, key: string, value?: string | number | boolean) {
  if (value !== undefined && value !== '') {
    params.append(key, String(value))
  }
}

function buildReportParams(format: ReportFormat, filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams({ format })

  appendIfPresent(params, 'search', filters.search)
  appendIfPresent(params, 'category_id', filters.categoryId)
  appendIfPresent(params, 'supplier_id', filters.supplierId)
  appendIfPresent(params, 'low_stock_only', filters.lowStockOnly)
  appendIfPresent(params, 'include_inactive', filters.includeInactive)
  appendIfPresent(params, 'include_receipts', filters.includeReceipts)
  appendIfPresent(params, 'only_with_balance', filters.onlyWithBalance)
  appendIfPresent(params, 'only_with_stock', filters.onlyWithStock)
  appendIfPresent(params, 'date_from', filters.dateFrom)
  appendIfPresent(params, 'date_to', filters.dateTo)
  appendIfPresent(params, 'limit', filters.limit)
  appendIfPresent(params, 'status', filters.status)
  appendIfPresent(params, 'stockpile_id', filters.stockpileId)
  appendIfPresent(params, 'client_id', filters.clientId)

  return params
}

function getExtension(format: ReportFormat): string {
  return format === REPORT_FORMAT.EXCEL ? 'xlsx' : format
}

function getDownloadFilename(type: ReportType, format: ReportFormat): string {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '_')
  return `reporte_${filenameByType[type]}_${today}.${getExtension(format)}`
}

function getMimeType(format: ReportFormat): string {
  if (format === REPORT_FORMAT.PDF) return 'application/pdf'
  if (format === REPORT_FORMAT.EXCEL) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return 'text/csv;charset=utf-8'
}

function triggerDownload(data: BlobPart, type: ReportType, format: ReportFormat) {
  const blob = new Blob([data], { type: getMimeType(format) })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', getDownloadFilename(type, format))

  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

const reportsService = {
  async downloadReport(
    type: ReportType,
    format: ReportFormat,
    filters: ReportFilters = {}
  ): Promise<void> {
    const params = buildReportParams(format, filters)
    const response = await httpClient.get(endpointByType[type], {
      params,
      responseType: 'blob',
    })

    triggerDownload(response.data, type, format)
  },
}

export default reportsService
