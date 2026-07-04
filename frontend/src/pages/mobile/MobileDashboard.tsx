/**
 * Native mobile Inicio (Dashboard) screen: greeting, "Ingresado en caja"
 * hero, 2 metric cards, revenue-composition donut and a 2x2 quick-access
 * grid. Self-fetching via `dashboardService.getSummary()` — reuses the same
 * service the desktop Dashboard already consumes, no new endpoint needed.
 *
 * V1 explicitly excludes an "Actividad reciente" section (no backing
 * endpoint yet) — do not add it here even as an empty placeholder.
 */
import { useQuery } from '@tanstack/react-query'
import { CreditCard, TrendingUp, ShoppingCart, FileText, Package, Users } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import dashboardService from '../../api/dashboardService'
import type { MobileNavTarget } from '../../components/layout/MobileDrawer'

interface MobileDashboardProps {
  onNavigate: (target: MobileNavTarget) => void
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Shortened currency for tight spaces (e.g. donut center): $624k for 624563.65. */
const formatCurrencyShort = (value: number) =>
  value >= 1000 ? `$${Math.floor(value / 1000)}k` : formatCurrency(value)

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function todayLabel(date: Date = new Date()) {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()]}`
}

const DONUT_SLICES = [
  { key: 'paid_invoices', label: 'Facturas', color: '#3d8c47' },
  { key: 'paid_stockpiles', label: 'Acopios', color: '#7c5ca8' },
  { key: 'other_income', label: 'Otros', color: '#c3abdf' },
] as const

export default function MobileDashboard({ onNavigate }: MobileDashboardProps) {
  const user = useAuthStore((state) => state.user)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['mobile-dashboard-summary'],
    queryFn: () => dashboardService.getSummary(),
    retry: false,
  })

  const donutTotal =
    (summary?.paid_invoices || 0) + (summary?.paid_stockpiles || 0) + (summary?.other_income || 0)

  const donutSlices = DONUT_SLICES.map((slice) => {
    const value = summary?.[slice.key] || 0
    const pct = donutTotal > 0 ? Math.round((value / donutTotal) * 100) : 0
    return { ...slice, value, pct }
  })

  let acc = 0
  const gradientStops = donutSlices
    .map((slice) => {
      const from = acc
      acc += slice.pct
      return `${slice.color} ${from}% ${acc}%`
    })
    .join(', ')

  const quickAccessItems = [
    {
      key: 'ventas',
      label: 'Nueva venta',
      subtitle: 'Cotización · remito · factura',
      icon: ShoppingCart,
      onClick: () => onNavigate({ screen: 'ventas' }),
    },
    {
      key: 'productos',
      label: 'Consultar precio',
      subtitle: 'Buscar o escanear',
      icon: Package,
      onClick: () => onNavigate({ screen: 'productos' }),
    },
    {
      key: 'caja',
      label: 'Caja diaria',
      subtitle: 'Registrar movimiento',
      icon: CreditCard,
      onClick: () => onNavigate({ screen: 'caja' }),
    },
    {
      key: 'cuenta',
      label: 'Cuenta corriente',
      subtitle: 'Saldos por cliente',
      icon: Users,
      onClick: () => onNavigate({ screen: 'cuenta' }),
    },
  ] as const

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="px-4 pb-[110px] pt-4">
      <p className="mb-3.5 text-sm text-[#7b6b95]">
        Hola <span className="font-bold text-[#5c3a8c]">{user?.name || ''}</span> — {todayLabel()}
      </p>

      {/* Hero: Ingresado en caja */}
      <div
        className="relative overflow-hidden rounded-[20px] p-[18px] pb-4 text-white"
        style={{ background: 'linear-gradient(150deg,#1a3d1f,#3d8c47)', boxShadow: '0 14px 30px rgba(26,61,31,.30)' }}
      >
        <div
          className="absolute -right-[30px] -top-[30px] h-[130px] w-[130px] rounded-full"
          style={{ background: 'rgba(126,207,134,.25)', filter: 'blur(10px)' }}
        />
        <div className="relative">
          <div
            className="flex items-center gap-[7px] text-[11px] font-semibold uppercase tracking-[.14em]"
            style={{ color: 'rgba(224,245,226,.85)' }}
          >
            <CreditCard size={15} color="#7ecf86" strokeWidth={2} />
            Ingresado en caja
          </div>
          <p className="font-display mt-1.5 text-[38px] font-extrabold leading-[1.05] tracking-tight">
            {formatCurrency(summary?.cash_income || 0)}
          </p>
          <div className="flex items-center gap-[5px] text-xs" style={{ color: 'rgba(224,245,226,.8)' }}>
            <TrendingUp size={13} color="#7ecf86" strokeWidth={2.5} />
            Movimientos reales de caja
          </div>
          <div
            className="mt-3.5 flex gap-0 border-t pt-3"
            style={{ borderColor: 'rgba(255,255,255,.16)' }}
          >
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[.1em]" style={{ color: 'rgba(224,245,226,.7)' }}>
                Facturado
              </p>
              <p className="mt-0.5 text-[15px] font-bold">{formatCurrency(summary?.total_sales || 0)}</p>
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[.1em]" style={{ color: 'rgba(224,245,226,.7)' }}>
                Pendiente
              </p>
              <p className="mt-0.5 text-[15px] font-bold">
                {formatCurrency(summary?.pending_customer_balance || 0)}
              </p>
            </div>
            <div className="w-[62px] flex-none">
              <p className="text-[10px] uppercase tracking-[.1em]" style={{ color: 'rgba(224,245,226,.7)' }}>
                Facturas
              </p>
              <p className="mt-0.5 text-[15px] font-bold">{summary?.total_invoices || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="mt-3 grid grid-cols-2 gap-[11px]">
        <div className="rounded-2xl border border-[#ece6f6] bg-white p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#7b6b95]">
            <ShoppingCart size={14} color="#7c5ca8" strokeWidth={2} />
            Ventas hoy
          </div>
          <p className="font-display mt-1.5 text-[22px] font-extrabold text-[#121325]">
            {formatCurrency(summary?.today_sales || 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#ece6f6] bg-white p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#7b6b95]">
            <FileText size={14} color="#7c5ca8" strokeWidth={2} />
            Comprob.
          </div>
          <p className="font-display mt-1.5 text-[22px] font-extrabold text-[#121325]">
            {summary?.today_vouchers_count ?? 0}
          </p>
        </div>
      </div>

      {/* Revenue composition donut */}
      <div className="mt-3 flex items-center gap-[18px] rounded-2xl border border-[#ece6f6] bg-white p-4">
        <div
          data-testid="dashboard-donut"
          className="flex h-[84px] w-[84px] flex-none items-center justify-center rounded-full"
          style={{ background: donutTotal > 0 ? `conic-gradient(${gradientStops})` : '#ece6f6' }}
        >
          <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-white">
            <span className="font-display text-[13px] font-extrabold text-[#121325]">
              {formatCurrencyShort(summary?.cash_income || 0)}
            </span>
          </div>
        </div>
        <div className="flex-1">
          <p className="mb-2 text-sm font-bold text-[#121325]">Composición de ingresos</p>
          <div data-testid="donut-legend" className="flex flex-col gap-1.5 text-xs text-[#5b5570]">
            {donutSlices.map((slice) => (
              <div key={slice.key} className="flex items-center gap-[7px]">
                <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: slice.color }} />
                {slice.label}
                <b className="ml-auto text-[#121325]">{slice.pct}%</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick access */}
      <p className="mb-2.5 mt-5 text-xs font-semibold uppercase tracking-[.12em] text-[#7b6b95]">
        Accesos rápidos
      </p>
      <div className="grid grid-cols-2 gap-[11px]">
        {quickAccessItems.map(({ key, label, subtitle, icon: Icon, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            className="rounded-2xl border border-[#ece6f6] bg-white p-3.5 text-left"
          >
            <div
              className="mb-2.5 flex h-[38px] w-[38px] items-center justify-center rounded-[11px]"
              style={{ background: '#ece6f6' }}
            >
              <Icon size={19} color="#7c5ca8" strokeWidth={2} />
            </div>
            <p className="text-sm font-bold text-[#121325]">{label}</p>
            <p className="mt-0.5 text-[11px] text-[#7b6b95]">{subtitle}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
