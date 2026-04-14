/**
 * Dashboard principal.
 * Muestra resumen de ventas, métricas y alertas con filtro por mes.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  AlertTriangle,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import dashboardService from '../api/dashboardService'
import { Button } from '../components/ui'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function Dashboard() {
  const today = new Date()
  const [filterMonth, setFilterMonth] = useState(today.getMonth() + 1) // 1-12
  const [filterYear, setFilterYear] = useState(today.getFullYear())

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary', filterMonth, filterYear],
    queryFn: () => dashboardService.getSummary({ month: filterMonth, year: filterYear }),
    retry: false,
  })

  // Navegar al mes anterior
  const goPrevMonth = () => {
    if (filterMonth === 1) {
      setFilterMonth(12)
      setFilterYear(y => y - 1)
    } else {
      setFilterMonth(m => m - 1)
    }
  }

  // Navegar al mes siguiente (no permitir futuro)
  const goNextMonth = () => {
    const isCurrentMonth = filterMonth === today.getMonth() + 1 && filterYear === today.getFullYear()
    if (isCurrentMonth) return
    if (filterMonth === 12) {
      setFilterMonth(1)
      setFilterYear(y => y + 1)
    } else {
      setFilterMonth(m => m + 1)
    }
  }

  const isCurrentMonth = filterMonth === today.getMonth() + 1 && filterYear === today.getFullYear()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
    const isUnauthorized = errorMessage.includes('401') || errorMessage.includes('Unauthorized')

    if (isUnauthorized) {
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
        Error al cargar el dashboard. Por favor intenta nuevamente.
      </div>
    )
  }

  const stats = [
    {
      title: 'Ventas del Mes',
      value: `$${(summary?.total_sales || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: summary?.total_invoices
        ? `${summary.total_invoices} factura${summary.total_invoices !== 1 ? 's' : ''} emitida${summary.total_invoices !== 1 ? 's' : ''}`
        : 'Sin facturas',
      trend: (summary?.total_sales || 0) > 0 ? 'up' : 'neutral',
      icon: TrendingUp,
      iconClasses: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    },
    {
      title: 'Productos',
      value: summary?.total_products.toString() || '0',
      change: summary?.low_stock_products
        ? `${summary.low_stock_products} bajo stock`
        : 'Stock saludable',
      trend: summary?.low_stock_products ? 'down' : 'neutral',
      icon: Package,
      iconClasses: summary?.low_stock_products 
        ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' 
        : 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400',
    },
    {
      title: 'Clientes',
      value: summary?.total_clients.toString() || '0',
      change: 'Activos',
      trend: 'up',
      icon: Users,
      iconClasses: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400',
    },
    {
      title: 'Valor Inventario',
      value: `$${(summary?.total_value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: 'Costo total',
      trend: 'neutral',
      icon: DollarSign,
      iconClasses: 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400',
    },
  ]

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Selector de mes */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrevMonth}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Mes anterior"
          >
            <ChevronLeft size={16} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 min-w-[160px] text-center">
            {MONTH_NAMES[filterMonth - 1]} {filterYear}
            {isCurrentMonth && (
              <span className="ml-1.5 text-[10px] text-primary-600 dark:text-primary-400 font-semibold uppercase tracking-wide">
                actual
              </span>
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-white to-slate-50 dark:from-gray-800 dark:to-gray-800 p-4 rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-200 dark:border-gray-700 hover:shadow-[0_10px_26px_rgba(15,23,42,0.10)] transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <div
                className={`p-2 rounded-lg ${stat.iconClasses}`}
              >
                <stat.icon size={20} />
              </div>
              {stat.trend !== 'neutral' && (
                <div
                  className={`flex items-center text-xs font-medium ${
                    stat.trend === 'up'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {stat.trend === 'up' ? (
                    <ArrowUpRight size={16} />
                  ) : (
                    <ArrowDownRight size={16} />
                  )}
                </div>
              )}
            </div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {stat.title}
              </h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
              {stat.value}
            </p>
            <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Contenido adicional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alertas de stock */}
        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-gray-800 dark:to-gray-800 rounded-xl p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-200 dark:border-gray-700 h-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-orange-600 dark:text-orange-400">
                <AlertTriangle size={20} />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Alertas de Stock
              </h2>
            </div>
            {summary?.low_stock_products && summary.low_stock_products > 0 && (
              <span className="text-xs font-medium bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                {summary.low_stock_products} productos
              </span>
            )}
          </div>

          {summary?.low_stock_products && summary.low_stock_products > 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Tienes productos con stock crítico.
              </p>
              <Button
                variant="outline"
                onClick={() => window.location.href = '/products?low_stock=true'}
              >
                Ver Productos
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center text-gray-500 dark:text-gray-400">
              <Package className="h-12 w-12 mb-3 opacity-20" />
              <p>¡Todo en orden! Tu inventario está saludable.</p>
            </div>
          )}
        </div>

        {/* Accesos Rápidos */}
        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-gray-800 dark:to-gray-800 rounded-xl p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border border-slate-200 dark:border-gray-700 h-full">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Acciones Rápidas
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => window.location.href = '/sales'}
              className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-dashed border-gray-200 dark:border-gray-600"
            >
              <ShoppingCart className="h-6 w-6 text-primary-500 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Nueva Venta</span>
            </button>
            <button
              onClick={() => window.location.href = '/products'}
              className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-dashed border-gray-200 dark:border-gray-600"
            >
              <Package className="h-6 w-6 text-primary-500 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Agregar Producto</span>
            </button>
            <button
              onClick={() => window.location.href = '/clients'}
              className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-dashed border-gray-200 dark:border-gray-600"
            >
              <Users className="h-6 w-6 text-green-500 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Nuevo Cliente</span>
            </button>
            <button
              onClick={() => window.location.href = '/reports'}
              className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-dashed border-gray-200 dark:border-gray-600"
            >
              <TrendingUp className="h-6 w-6 text-primary-500 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Ver Reportes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
