/**
 * AlertsTab — Alertas de rentabilidad con sistema de semáforo.
 * Tarjetas de resumen con conteos + tabla de alertas detalladas.
 */
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  TrendingDown,
  HelpCircle,
  Package,
} from 'lucide-react'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters, ProfitabilityAlert } from '../../api/profitabilityService'
import KpiCard from './KpiCard'

// ── Props ────────────────────────────────────────────────────────────

interface TabProps {
  dateFrom: string
  dateTo: string
  filters?: ProfitabilityFilters
}

// ── Traffic-light colors ─────────────────────────────────────────────

const TRAFFIC_LIGHT = {
  red: {
    dot: 'bg-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800/40',
    text: 'text-red-700 dark:text-red-300',
  },
  yellow: {
    dot: 'bg-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800/40',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  gray: {
    dot: 'bg-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800/40',
    border: 'border-slate-200 dark:border-slate-700/40',
    text: 'text-slate-600 dark:text-slate-400',
  },
}

function getAlertColor(alert: ProfitabilityAlert): keyof typeof TRAFFIC_LIGHT {
  if (alert.type === 'negative_margin') return 'red'
  if (alert.type === 'low_margin') return 'yellow'
  return 'gray'
}

// ── Helpers ──────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Component ────────────────────────────────────────────────────────

export default function AlertsTab({ dateFrom, dateTo, filters }: TabProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['profitability', 'alerts', dateFrom, dateTo, filters],
    queryFn: () =>
      profitabilityService.getAlerts({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        ...(filters ?? {}),
      }),
    retry: false,
  })

  if (isError) {
    return (
      <div className="text-center py-8 text-red-500">
        Error al cargar alertas.{' '}
        <button onClick={() => refetch()} className="underline">
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Márgenes Negativos"
          value={data?.negative_margin_count ?? 0}
          subtitle="Productos vendidos por debajo del costo"
          icon={TrendingDown}
          color="rose"
          isLoading={isLoading}
        />
        <KpiCard
          title="Márgenes Bajos"
          value={data?.low_margin_count ?? 0}
          subtitle="Productos con margen &lt; 10%"
          icon={AlertTriangle}
          color="amber"
          isLoading={isLoading}
        />
        <KpiCard
          title="Sin Costo"
          value={data?.no_cost_count ?? 0}
          subtitle="Productos sin precio de costo registrado"
          icon={HelpCircle}
          color="slate"
          isLoading={isLoading}
        />
      </div>

      {/* Detailed alerts table */}
      {data && data.alerts.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Alertas Detalladas
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-4" />
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Ingreso
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Costo
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Margen
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.alerts.map((alert, idx) => {
                  const color = TRAFFIC_LIGHT[getAlertColor(alert)]
                  return (
                    <tr
                      key={`${alert.type}-${alert.product_name}-${idx}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <span className={`block w-2.5 h-2.5 rounded-full ${color.dot}`} />
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <Package size={13} className="text-slate-400 shrink-0" />
                          {alert.product_name}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-slate-600 dark:text-slate-400">
                        {alert.client_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-right tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(alert.revenue)}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-right tabular-nums text-slate-900 dark:text-slate-100">
                        {alert.cost != null ? formatCurrency(alert.cost) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-right tabular-nums">
                        <span className={color.text}>
                          {alert.margin_pct != null ? `${alert.margin_pct.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-slate-500 dark:text-slate-400">
                        {alert.reason}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.alerts.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
          <AlertTriangle size={40} className="mb-3 opacity-40" />
          <p className="text-sm">No hay alertas en este período</p>
        </div>
      )}
    </div>
  )
}
