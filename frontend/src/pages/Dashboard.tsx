/**
 * Dashboard principal.
 * Muestra resumen de ventas, métricas y alertas.
 */
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
} from 'lucide-react'
import dashboardService from '../api/dashboardService'
import { Button } from '../components/ui'

export default function Dashboard() {
  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardService.getSummary(),
    retry: false,
  })

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
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-full mb-4">
            <Users className="h-8 w-8 text-blue-500" />
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
      title: 'Ventas Totales',
      value: '$0', // TODO: Conectar cuando existan ventas
      change: 'Sin datos',
      trend: 'neutral',
      icon: TrendingUp,
      color: 'green',
    },
    {
      title: 'Productos',
      value: summary?.total_products.toString() || '0',
      change: summary?.low_stock_products 
        ? `${summary.low_stock_products} bajo stock` 
        : 'Stock saludable',
      trend: summary?.low_stock_products ? 'down' : 'neutral',
      icon: Package,
      color: summary?.low_stock_products ? 'orange' : 'indigo',
    },
    {
      title: 'Clientes',
      value: summary?.total_clients.toString() || '0',
      change: 'Activos',
      trend: 'up',
      icon: Users,
      color: 'blue',
    },
    {
      title: 'Valor Inventario',
      value: `$${(summary?.total_value || 0).toLocaleString()}`,
      change: 'Costo total',
      trend: 'neutral',
      icon: DollarSign,
      color: 'purple',
    },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Resumen de actividad y métricas del negocio
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className={`p-3 rounded-lg bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-600 dark:text-${stat.color}-400`}
              >
                <stat.icon size={24} />
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
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {stat.value}
            </p>
            <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Contenido adicional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertas de stock */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 h-full">
          <div className="flex items-center justify-between mb-6">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 h-full">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Acciones Rápidas
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => window.location.href = '/sales'}
              className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-dashed border-gray-200 dark:border-gray-600"
            >
              <ShoppingCart className="h-6 w-6 text-blue-500 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Nueva Venta</span>
            </button>
            <button 
              onClick={() => window.location.href = '/products'}
              className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-dashed border-gray-200 dark:border-gray-600"
            >
              <Package className="h-6 w-6 text-indigo-500 mb-2" />
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
              <TrendingUp className="h-6 w-6 text-purple-500 mb-2" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Ver Reportes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
