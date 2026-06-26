/**
 * SummaryTab — Panel de resumen con KPIs del período y gráfico de evolución.
 */
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Wallet,
  CreditCard,
  Receipt,
  Package,
  FileText,
  Percent,
  ShoppingBag,
} from 'lucide-react'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters } from '../../api/profitabilityService'
import KpiCard from './KpiCard'
import EvolutionChart from './EvolutionChart'

// ── Props ────────────────────────────────────────────────────────────

interface TabProps {
  dateFrom: string
  dateTo: string
  filters?: ProfitabilityFilters
}

// ── Helpers ──────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const marginAccent = (pct: number) => (pct >= 0 ? 'emerald' : 'rose') as const
const neutralAccent = (v: number) => (v >= 0 ? 'emerald' : 'rose') as const

/** Calcula el delta absoluto a partir del valor actual y el cambio porcentual. */
const computeDelta = (current: number, changePct: number): number =>
  changePct === -100 ? -current : current * changePct / (100 + changePct)

// ── Component ────────────────────────────────────────────────────────

export default function SummaryTab({ dateFrom, dateTo, filters }: TabProps) {
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['profitability-summary', dateFrom, dateTo, filters],
    queryFn: () => profitabilityService.getSummary({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    retry: false,
  })

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-8 text-center border border-red-200 dark:border-red-800/40">
        <p className="text-sm text-red-600 dark:text-red-400">
          Error al cargar resumen de rentabilidad
        </p>
      </div>
    )
  }

  const cmp = summary?.comparison

  return (
    <div>
      {/* Row 1 — KPI principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Ingreso Total"
          value={summary ? formatCurrency(summary.total_revenue) : '—'}
          subtitle="Ventas del período"
          icon={DollarSign}
          color="emerald"
          isLoading={isLoading}
          comparison={cmp ? { value: computeDelta(summary.total_revenue, cmp.revenue_change_pct), pct: cmp.revenue_change_pct, isUp: cmp.revenue_change_pct >= 0 } : undefined}
        />
        <KpiCard
          title="Costo (COGS)"
          value={summary ? formatCurrency(summary.total_cost) : '—'}
          subtitle="Mercadería vendida"
          icon={ShoppingCart}
          color="orange"
          isLoading={isLoading}
          comparison={cmp ? { value: computeDelta(summary.total_cost, cmp.cost_change_pct), pct: cmp.cost_change_pct, isUp: cmp.cost_change_pct >= 0 } : undefined}
        />
        <KpiCard
          title="Margen Bruto"
          value={
            summary
              ? `${formatCurrency(summary.gross_margin)} (${summary.gross_margin_pct.toFixed(1)}%)`
              : '—'
          }
          subtitle="Ingreso − Costo"
          icon={TrendingUp}
          color={summary ? marginAccent(summary.gross_margin_pct) : 'blue'}
          featured
          isLoading={isLoading}
          comparison={cmp ? { value: computeDelta(summary.gross_margin, cmp.profit_change_pct), pct: cmp.profit_change_pct, isUp: cmp.profit_change_pct >= 0 } : undefined}
        />
        <KpiCard
          title="Gastos Operativos"
          value={summary ? formatCurrency(summary.total_expenses) : '—'}
          subtitle="Gastos del período"
          icon={CreditCard}
          color="rose"
          isLoading={isLoading}
        />
      </div>

      {/* Row 2 — KPIs secundarios */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <KpiCard
          title="Ganancia Neta"
          value={summary ? formatCurrency(summary.net_profit) : '—'}
          subtitle="Margen − Gastos"
          icon={Wallet}
          color={summary ? neutralAccent(summary.net_profit) : 'blue'}
          featured
          isLoading={isLoading}
        />
        <KpiCard
          title="Markup %"
          value={summary ? `${summary.markup_pct.toFixed(1)}%` : '—'}
          subtitle="Margen / Costo × 100"
          icon={Percent}
          color="amber"
          isLoading={isLoading}
        />
        <KpiCard
          title="Unidades Vendidas"
          value={summary ? String(summary.units_sold) : '—'}
          subtitle={summary ? `${summary.invoice_count} comprobante${summary.invoice_count !== 1 ? 's' : ''}` : '—'}
          icon={ShoppingBag}
          color="blue"
          isLoading={isLoading}
        />
        <KpiCard
          title="Ticket Promedio"
          value={summary ? formatCurrency(summary.avg_ticket) : '—'}
          subtitle="Por comprobante"
          icon={Receipt}
          color="slate"
          isLoading={isLoading}
        />
      </div>

      {/* Row 3 — KPIs extra + chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <KpiCard
          title="Ingresos x Acopios"
          value={summary ? formatCurrency(summary.stockpile_income) : '—'}
          subtitle="Cobros vinculados a acopios"
          icon={Package}
          color="violet"
          isLoading={isLoading}
        />
        <KpiCard
          title="Comprobantes"
          value={summary ? String(summary.invoice_count) : '—'}
          subtitle="Total del período"
          icon={FileText}
          color="slate"
          isLoading={isLoading}
        />
      </div>

      {/* Evolution chart */}
      <div className="mt-4">
        <EvolutionChart dateFrom={dateFrom} dateTo={dateTo} filters={filters} />
      </div>
    </div>
  )
}
