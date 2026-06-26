/**
 * KpiCard — Tarjeta de indicador KPI con valor, ícono y delta de comparación.
 * Soporta formato de moneda, porcentaje y número, con skeleton de carga.
 */
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Props ────────────────────────────────────────────────────────────

interface Comparison {
  value: number
  pct: number
  isUp: boolean
}

export interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  color?: 'emerald' | 'rose' | 'amber' | 'blue' | 'violet' | 'orange' | 'slate'
  featured?: boolean
  comparison?: Comparison | null
  isLoading?: boolean
}

// ── Color map ────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { text: string; bg: string; icon: string; ring: string; bar: string }> = {
  emerald: {
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/25',
    icon: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-200 dark:ring-emerald-800/50',
    bar: 'bg-emerald-500 dark:bg-emerald-400',
  },
  rose: {
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-900/25',
    icon: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-200 dark:ring-rose-800/50',
    bar: 'bg-rose-500 dark:bg-rose-400',
  },
  amber: {
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/25',
    icon: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-200 dark:ring-amber-800/50',
    bar: 'bg-amber-500 dark:bg-amber-400',
  },
  blue: {
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/25',
    icon: 'text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-200 dark:ring-blue-800/50',
    bar: 'bg-blue-500 dark:bg-blue-400',
  },
  violet: {
    text: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-900/25',
    icon: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-200 dark:ring-violet-800/50',
    bar: 'bg-violet-500 dark:bg-violet-400',
  },
  orange: {
    text: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/25',
    icon: 'text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-200 dark:ring-orange-800/50',
    bar: 'bg-orange-500 dark:bg-orange-400',
  },
  slate: {
    text: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-800/40',
    icon: 'text-slate-600 dark:text-slate-400',
    ring: 'ring-slate-200 dark:ring-slate-700/50',
    bar: 'bg-slate-500 dark:bg-slate-400',
  },
}

// ── Helpers ──────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatPct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`

// ── Skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm animate-pulse">
      <div className="h-1 rounded-t-xl bg-slate-200 dark:bg-slate-700" />
      <div className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-7 w-7 rounded-lg bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-7 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────

export default function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  featured = false,
  comparison,
  isLoading,
}: KpiCardProps) {
  if (isLoading) return <Skeleton />

  const a = COLOR_MAP[color] ?? COLOR_MAP.blue

  const displayValue =
    typeof value === 'number'
      ? formatCurrency(value)
      : value

  return (
    <div
      className={`group relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-all duration-200 hover:-translate-y-0.5 ${
        featured
          ? 'shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.02]'
          : 'shadow-sm hover:shadow-md'
      }`}
    >
      <div className={`h-1 rounded-t-xl ${a.bar}`} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-[0.08em] pt-0.5">
            {title}
          </span>
          {Icon && (
            <div className={`p-2 rounded-lg ${a.bg} ${a.icon} shrink-0 transition-transform duration-200 group-hover:scale-110`}>
              <Icon size={featured ? 18 : 15} />
            </div>
          )}
        </div>

        <p className={`text-xl font-bold tabular-nums tracking-tight ${a.text}`}>
          {displayValue}
        </p>

        {comparison && (
          <div className="flex items-center gap-1 mt-1.5">
            {comparison.isUp ? (
              <TrendingUp size={13} className="text-emerald-500" />
            ) : comparison.pct === 0 ? (
              <Minus size={13} className="text-slate-400" />
            ) : (
              <TrendingDown size={13} className="text-red-500" />
            )}
            <span
              className={`text-xs font-medium tabular-nums ${
                comparison.isUp
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : comparison.pct === 0
                    ? 'text-slate-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatCurrency(comparison.value)} ({formatPct(comparison.pct)})
            </span>
          </div>
        )}

        {subtitle && !comparison && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-tight">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}
