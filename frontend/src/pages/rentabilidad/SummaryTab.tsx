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

const marginAccent = (pct: number): 'emerald' | 'rose' => (pct >= 0 ? 'emerald' : 'rose')
const neutralAccent = (v: number): 'emerald' | 'rose' => (v >= 0 ? 'emerald' : 'rose')

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
          tooltip="Todo lo que facturaste en el período. Incluye todas las ventas registradas, sin descontar costos ni impuestos."
        />
        <KpiCard
          title="Costo (COGS)"
          value={summary ? formatCurrency(summary.total_cost) : '—'}
          subtitle="Mercadería vendida"
          icon={ShoppingCart}
          color="orange"
          isLoading={isLoading}
          comparison={cmp ? { value: computeDelta(summary.total_cost, cmp.cost_change_pct), pct: cmp.cost_change_pct, isUp: cmp.cost_change_pct >= 0 } : undefined}
          tooltip="Costo de la mercadería que vendiste (COGS). Es lo que te costó comprar o producir exactamente lo que salió. No incluye gastos operativos."
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
          tooltip="Ingreso Total menos el Costo de mercadería. Te dice cuánto generás antes de pagar gastos operativos. El porcentaje indica qué fracción de cada venta es ganancia bruta."
        />
        <KpiCard
          title="Gastos Operativos"
          value={summary ? formatCurrency(summary.total_expenses) : '—'}
          subtitle="Gastos del período"
          icon={CreditCard}
          color="rose"
          isLoading={isLoading}
          tooltip="Gastos fijos y variables del negocio: alquiler, sueldos, servicios, etc. Se restan del Margen Bruto para obtener la Ganancia Neta."
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
          tooltip="Lo que realmente te quedó: Margen Bruto menos todos los Gastos Operativos. Si es negativo, el negocio perdió plata en el período."
        />
        <KpiCard
          title="Margen Neto %"
          value={
            summary && summary.total_revenue > 0
              ? `${((summary.net_profit / summary.total_revenue) * 100).toFixed(1)}%`
              : '—'
          }
          subtitle="Ganancia Neta / Ingreso"
          icon={Percent}
          color={summary ? neutralAccent(summary.net_profit) : 'amber'}
          isLoading={isLoading}
          tooltip="De cada $100 que vendiste, cuántos pesos te quedaron limpios después de costos y gastos. Un 10% significa que por cada $100 vendidos te quedaron $10."
        />
        <KpiCard
          title="Unidades Vendidas"
          value={summary ? String(summary.units_sold) : '—'}
          subtitle={summary ? `${summary.invoice_count} comprobante${summary.invoice_count !== 1 ? 's' : ''}` : '—'}
          icon={ShoppingBag}
          color="blue"
          isLoading={isLoading}
          tooltip="Cantidad total de unidades vendidas en el período. Abajo se muestra la cantidad de comprobantes (facturas/remitos) que generaron esas ventas."
        />
        <KpiCard
          title="Ticket Promedio"
          value={summary ? formatCurrency(summary.avg_ticket) : '—'}
          subtitle="Por comprobante"
          icon={Receipt}
          color="slate"
          isLoading={isLoading}
          tooltip="Valor promedio de cada comprobante emitido. Se calcula dividiendo el Ingreso Total por la cantidad de comprobantes. Útil para medir si tus ventas están creciendo en volumen o en valor."
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
          tooltip="Cobros recibidos que están vinculados a acopios (anticipos de clientes para reservar mercadería). Se muestran separados porque no siempre representan una venta cerrada."
        />
        <KpiCard
          title="Comprobantes"
          value={summary ? String(summary.invoice_count) : '—'}
          subtitle="Total del período"
          icon={FileText}
          color="slate"
          isLoading={isLoading}
          tooltip="Cantidad total de facturas, remitos o notas emitidas en el período. Combinado con el Ticket Promedio te ayuda a entender si vendés más veces o en montos más altos."
        />
      </div>

      {/* Evolution chart */}
      <div className="mt-4">
        <EvolutionChart dateFrom={dateFrom} dateTo={dateTo} filters={filters} />
      </div>
    </div>
  )
}
