/**
 * Dashboard principal.
 * Muestra panorama financiero cash-basis con gráficos modernos.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Receipt,
  Landmark,
  PiggyBank,
  FileCheck,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import dashboardService from '../api/dashboardService'
import { Button } from '../components/ui'
import WhatsAppStatusCard from '../components/messaging/WhatsAppStatusCard'

interface ChartPayload {
  name: string
  color: string
  value: number
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ChartPayload[]
  label?: string
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatShortDate = (value: string) => {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

// ── Paleta de colores ───────────────────────────────────────────
const COLORS = {
  emerald: '#10b981',
  cyan: '#06b6d4',
  violet: '#8b5cf6',
  sky: '#0ea5e9',
  emeraldBg: '#d1fae5',
  cyanBg: '#cffafe',
  violetBg: '#ede9fe',
  skyBg: '#e0f2fe',
}

const PIE_COLORS = [COLORS.emerald, COLORS.cyan, COLORS.violet, COLORS.sky]
const BAR_COLORS = { cash: '#3b82f6', sales: '#94a3b8' }

// ── Tooltip personalizado ──────────────────────────────────────
function CustomTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{label}</p>
      {payload.map(entry => (
        <p key={entry.name} className="flex items-center gap-2" style={{ color: entry.color }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <strong className="ml-1">{formatCurrency(entry.value)}</strong>
        </p>
      ))}
    </div>
  )
}

function DonutTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-900 dark:text-white">{d.name}</p>
      <p style={{ color: d.color }} className="font-bold text-lg">{formatCurrency(d.value)}</p>
    </div>
  )
}

export default function Dashboard() {
  const today = new Date()
  const [filterMonth, setFilterMonth] = useState(today.getMonth() + 1)
  const [filterYear, setFilterYear] = useState(today.getFullYear())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const hasDateRange = Boolean(dateFrom || dateTo)

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary', filterMonth, filterYear, dateFrom, dateTo],
    queryFn: () => dashboardService.getSummary({
      month: filterMonth,
      year: filterYear,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    retry: false,
  })

  const { data: trend = [] } = useQuery({
    queryKey: ['dashboard-trend'],
    queryFn: () => dashboardService.getTrend(6),
    retry: false,
  })

  // ── Navegación de mes ──────────────────────────────────────
  const goPrevMonth = () => {
    setDateFrom('')
    setDateTo('')
    if (filterMonth === 1) {
      setFilterMonth(12)
      setFilterYear(y => y - 1)
    } else {
      setFilterMonth(m => m - 1)
    }
  }
  const goNextMonth = () => {
    if (filterMonth === today.getMonth() + 1 && filterYear === today.getFullYear()) return
    setDateFrom('')
    setDateTo('')
    if (filterMonth === 12) {
      setFilterMonth(1)
      setFilterYear(y => y + 1)
    } else {
      setFilterMonth(m => m + 1)
    }
  }
  const isCurrentMonth = filterMonth === today.getMonth() + 1 && filterYear === today.getFullYear()
  const periodLabel = hasDateRange && summary
    ? `${formatShortDate(summary.filter_date_from)} al ${formatShortDate(summary.filter_date_to)}`
    : `${MONTH_NAMES[filterMonth - 1]} ${filterYear}`

  // ── Datos para donut ───────────────────────────────────────
  const donutData = [
    { name: 'Facturas', value: summary?.paid_invoices || 0 },
    { name: 'Acopios', value: summary?.paid_stockpiles || 0 },
    { name: 'Cta. Cte.', value: summary?.current_account_collected || 0 },
    { name: 'Otros', value: summary?.other_income || 0 },
  ].filter(d => d.value > 0)

  // ── Estados de carga ───────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-full mb-4">
            <Users className="h-8 w-8 text-primary-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Bienvenido a OctopusTrack
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
            Para ver el resumen de tu negocio, por favor inicia sesión.
          </p>
          <Button onClick={() => window.location.href = '/login'}>Iniciar Sesión</Button>
        </div>
      )
    }
    return (
      <div className="p-6 text-center text-red-600 bg-red-50 rounded-xl">
        Error al cargar el dashboard.
      </div>
    )
  }

  const hasLowStock = (summary?.low_stock_products || 0) > 0

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ═══ Selector de mes ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Resumen financiero basado en movimientos reales de caja
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={event => setDateFrom(event.target.value)}
            className="h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 text-xs text-gray-700 dark:text-gray-200"
            aria-label="Fecha desde"
          />
          <input
            type="date"
            value={dateTo}
            onChange={event => setDateTo(event.target.value)}
            className="h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 text-xs text-gray-700 dark:text-gray-200"
            aria-label="Fecha hasta"
          />
          {hasDateRange && (
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo('') }}>
              Limpiar
            </Button>
          )}
          <button
            onClick={goPrevMonth}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Mes anterior"
          >
            <ChevronLeft size={16} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 min-w-[160px] text-center">
            {periodLabel}
            {isCurrentMonth && !hasDateRange && (
              <span className="ml-1.5 text-[10px] text-primary-600 dark:text-primary-400 font-semibold uppercase tracking-wide">actual</span>
            )}
          </div>
          <button
            onClick={goNextMonth}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Mes siguiente"
          >
            <ChevronRight size={16} className="text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: 'Ventas de Hoy',
            value: formatCurrency(summary?.today_sales || 0),
            subtitle: 'Cobrado hoy por facturas confirmadas',
            icon: Wallet,
            bg: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
          },
          {
            title: 'Facturado Hoy',
            value: formatCurrency(summary?.today_invoiced || 0),
            subtitle: 'Total de comprobantes confirmados hoy',
            icon: ShoppingCart,
            bg: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
          },
          {
            title: 'Comprobantes Hoy',
            value: String(summary?.today_vouchers_count || 0),
            subtitle: 'Facturas A/B/C confirmadas',
            icon: Receipt,
            bg: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
          },
        ].map(card => (
          <div key={card.title} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)] border border-slate-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${card.bg}`}>
                <card.icon size={15} />
              </div>
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {card.title}
              </span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{card.value}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{card.subtitle}</p>
          </div>
        ))}
      </div>

      {/* ═══ Hero + Donut ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Hero metric */}
        <div className="lg:col-span-2 bg-gradient-to-br from-emerald-600 to-emerald-800 dark:from-emerald-700 dark:to-emerald-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={18} className="text-emerald-200" />
              <span className="text-emerald-100 text-xs font-medium uppercase tracking-wider">
                Ingresado en Caja
              </span>
            </div>
            <p className="text-3xl font-bold mt-1 tracking-tight">
              {formatCurrency(summary?.cash_income || 0)}
            </p>
            <p className="text-emerald-200 text-xs mt-2 flex items-center gap-1">
              <TrendingUp size={12} />
              Basado en movimientos reales de caja
            </p>
            <div className="flex gap-4 mt-4 pt-3 border-t border-emerald-500/30">
              <div>
                <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Facturado</p>
                <p className="text-sm font-semibold">{formatCurrency(summary?.total_sales || 0)}</p>
              </div>
              <div>
                <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Pendiente</p>
                <p className="text-sm font-semibold">{formatCurrency(summary?.pending_customer_balance || 0)}</p>
              </div>
              <div>
                <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Facturas</p>
                <p className="text-sm font-semibold">{summary?.total_invoices || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Donut chart */}
        <div className="lg:col-span-3 bg-gradient-to-br from-white to-slate-50 dark:from-gray-800 dark:to-gray-800 rounded-2xl p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary-50 dark:bg-primary-900/20 rounded-lg text-primary-600 dark:text-primary-400">
                <PiggyBank size={16} />
              </div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Composición de Ingresos
              </h2>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{periodLabel}</span>
          </div>
          {donutData.length > 0 ? (
            <div className="flex items-center justify-center h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                  <Legend
                    verticalAlign="middle"
                    align="right"
                    layout="vertical"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => (
                      <span className="text-xs text-gray-600 dark:text-gray-300">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-gray-400 dark:text-gray-500 text-sm">
              Sin ingresos registrados en este período
            </div>
          )}
        </div>
      </div>

      {/* ═══ Cards secundarias ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          {
            title: 'Facturas Cobradas',
            value: formatCurrency(summary?.paid_invoices || 0),
            subtitle: 'Ventas cobradas en el período',
            icon: Receipt,
            bg: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
            border: 'border-emerald-200 dark:border-emerald-800/40',
          },
          {
            title: 'Acopios Cobrados',
            value: formatCurrency(summary?.paid_stockpiles || 0),
            subtitle: 'Cobros vinculados a acopios',
            icon: Package,
            bg: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400',
            border: 'border-cyan-200 dark:border-cyan-800/40',
          },
          {
            title: 'Ctas. Ctes. Cobradas',
            value: formatCurrency(summary?.current_account_collected || 0),
            subtitle: 'Pagos recibidos de clientes',
            icon: Landmark,
            bg: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
            border: 'border-violet-200 dark:border-violet-800/40',
          },
          {
            title: 'Ctas. Ctes. Cerradas',
            value: formatCurrency(summary?.closed_current_accounts_total || 0),
            subtitle: `${summary?.closed_current_accounts ?? 0} cierre${(summary?.closed_current_accounts ?? 0) !== 1 ? 's' : ''} en el período`,
            icon: FileCheck,
            bg: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
            border: 'border-amber-200 dark:border-amber-800/40',
          },
          {
            title: 'Otros Ingresos',
            value: formatCurrency(summary?.other_income || 0),
            subtitle: 'Ingresos manuales registrados',
            icon: ArrowUpRight,
            bg: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400',
            border: 'border-sky-200 dark:border-sky-800/40',
          },
        ].map((card, i) => (
          <div
            key={i}
            className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)] border ${card.border} hover:shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition-shadow`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${card.bg}`}>
                <card.icon size={14} />
              </div>
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {card.title}
              </span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {card.value}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              {card.subtitle}
            </p>
          </div>
        ))}
      </div>

      {/* ═══ WhatsApp Status ═══ */}
      <WhatsAppStatusCard />

      {/* ═══ Bar Chart — Facturado vs Cobrado ═══ */}
      <div className="bg-gradient-to-br from-white to-slate-50 dark:from-gray-800 dark:to-gray-800 rounded-2xl p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
            <TrendingUp size={16} />
          </div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Facturado vs Cobrado
          </h2>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
            Últimos 6 meses
          </span>
        </div>
        {trend.length > 0 ? (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barGap={2} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#e2e8f0', className: 'dark:opacity-20' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{value}</span>
                  )}
                />
                <Bar
                  name="Cobrado"
                  dataKey="cash_income"
                  fill={BAR_COLORS.cash}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  name="Facturado"
                  dataKey="total_sales"
                  fill={BAR_COLORS.sales}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[220px] text-gray-400 dark:text-gray-500 text-sm">
            Sin datos de tendencia disponibles
          </div>
        )}
      </div>

      {/* ═══ Alertas + Métricas secundarias ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alertas de stock */}
        <div className="lg:col-span-2 bg-gradient-to-br from-white to-slate-50 dark:from-gray-800 dark:to-gray-800 rounded-xl p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${hasLowStock ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'}`}>
                <AlertTriangle size={16} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Alertas de Stock</h3>
            </div>
            {hasLowStock && (
              <span className="text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 px-2 py-0.5 rounded-full">
                {summary?.low_stock_products} productos
              </span>
            )}
          </div>
          {hasLowStock ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Tenés {summary?.low_stock_products} producto{summary?.low_stock_products !== 1 ? 's' : ''} con stock crítico.
              </p>
              <Button variant="outline" size="sm" onClick={() => window.location.href = '/products?low_stock=true'}>
                Ver Productos
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-gray-400 dark:text-gray-500">
              <Package size={20} className="opacity-30" />
              <p className="text-sm">Todo en orden — el inventario está saludable.</p>
            </div>
          )}
        </div>

        {/* Mini cards operativas */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: 'Productos',
              value: summary?.total_products.toString() || '0',
              sub: hasLowStock ? `${summary?.low_stock_products} bajo stock` : 'Stock saludable',
              icon: Package,
              color: hasLowStock ? 'text-orange-600' : 'text-primary-600',
              bg: hasLowStock ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-primary-50 dark:bg-primary-900/20',
            },
            {
              label: 'Facturado del Mes',
              value: formatCurrency(summary?.total_sales || 0),
              sub: summary?.total_invoices ? `${summary.total_invoices} factura${summary.total_invoices !== 1 ? 's' : ''}` : 'Sin facturas',
              icon: ShoppingCart,
              color: 'text-slate-600 dark:text-slate-300',
              bg: 'bg-slate-50 dark:bg-slate-700/60',
            },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-[0_4px_12px_rgba(15,23,42,0.04)] border border-slate-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className={`p-1 rounded-md ${item.bg} ${item.color}`}>
                  <item.icon size={12} />
                </div>
                <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {item.label}
                </span>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{item.value}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
