/**
 * Servicio API para exportación de reportes.
 */
import { httpClient } from './httpClient'

export type ReportType = 'sales' | 'products' | 'stock' | 'accounts'
export type ReportPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

interface DateRange {
  dateFrom?: string
  dateTo?: string
}

function getDateRange(period: ReportPeriod): DateRange {
  const now = new Date()
  const toIsoDate = (date: Date) => date.toISOString().split('T')[0]

  if (period === 'custom') {
    return {}
  }

  const end = new Date(now)
  let start = new Date(now)

  if (period === 'today') {
    // start/end hoy
  } else if (period === 'week') {
    const day = now.getDay() || 7
    start.setDate(now.getDate() - day + 1)
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (period === 'quarter') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    start = new Date(now.getFullYear(), quarterStartMonth, 1)
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1)
  }

  return {
    dateFrom: toIsoDate(start),
    dateTo: toIsoDate(end),
  }
}

const endpointByType: Record<ReportType, string> = {
  sales: '/reports/sales/pdf',
  products: '/reports/products/pdf',
  stock: '/reports/stock/pdf',
  accounts: '/reports/accounts/pdf',
}

const reportsService = {
  async downloadPdf(type: ReportType, period: ReportPeriod): Promise<void> {
    const endpoint = endpointByType[type]
    const range = getDateRange(period)
    const params = new URLSearchParams()

    if (range.dateFrom) params.append('date_from', range.dateFrom)
    if (range.dateTo) params.append('date_to', range.dateTo)

    const query = params.toString()
    const response = await httpClient.get(query ? `${endpoint}?${query}` : endpoint, {
      responseType: 'blob',
    })

    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '_')
    link.setAttribute('download', `reporte_${type}_${today}.pdf`)

    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  },
}

export default reportsService
