/**
 * EvolutionChart — Gráfico de evolución temporal de rentabilidad.
 * Usa Recharts con agrupación por día/semana/mes.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters } from '../../api/profitabilityService'

// ── Props ────────────────────────────────────────────────────────────

interface EvolutionChartProps {
  dateFrom: string
  dateTo: string
  filters?: Omit<ProfitabilityFilters, 'date_from' | 'date_to' | 'group_by'>
}

// ── Helpers ──────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatPct = (value: number) => `${value.toFixed(1)}%`

// ── Custom Tooltip ───────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
      {payload.map((entry: any) => {
        const isPct = entry.name === 'Margen %'
        return (
          <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {isPct ? formatPct(entry.value) : formatCurrency(entry.value)}
          </p>
        )
      })}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────

export default function EvolutionChart({ dateFrom, dateTo, filters }: EvolutionChartProps) {
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('month')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['profitability', 'evolution', dateFrom, dateTo, groupBy, filters],
    queryFn: () =>
      profitabilityService.getEvolution({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        group_by: groupBy,
        ...(filters ?? {}),
      }),
    enabled: !!dateFrom,
  })

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mt-4 animate-pulse">
        <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
        <div className="h-[300px] bg-slate-100 dark:bg-slate-800 rounded" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mt-4">
        <p className="text-sm text-red-500 text-center">
          Error al cargar la evolución.{' '}
          <button onClick={() => window.location.reload()} className="underline">
            Reintentar
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 mt-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Evolución Temporal
        </h3>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as any)}
          className="h-8 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 focus:ring-2 focus:ring-primary-500"
        >
          <option value="day">Día</option>
          <option value="week">Semana</option>
          <option value="month">Mes</option>
        </select>
      </div>

      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={2}
              name="Ventas"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="cost"
              stroke="#ef4444"
              strokeWidth={2}
              name="Costo"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="profit"
              stroke="#22c55e"
              strokeWidth={2}
              name="Ganancia"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="margin_pct"
              stroke="#a855f7"
              strokeWidth={2}
              name="Margen %"
              dot={false}
              activeDot={{ r: 4 }}
              strokeDasharray="4 2"
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
          No hay datos de evolución para el período seleccionado
        </div>
      )}
    </div>
  )
}
