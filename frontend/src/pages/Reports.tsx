/**
 * Página de Reportes.
 * Informes de ventas, stock y cuentas corrientes.
 */
import { BarChart3, TrendingUp, Package, Users, Calendar, Download } from 'lucide-react'
import { Button, Select } from '../components/ui'

const reportTypes = [
  {
    id: 'sales',
    title: 'Ventas por período',
    description: 'Resumen de ventas, totales y comparativas',
    icon: TrendingUp,
    color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
  },
  {
    id: 'products',
    title: 'Productos más vendidos',
    description: 'Ranking de productos por cantidad y monto',
    icon: Package,
    color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
  },
  {
    id: 'stock',
    title: 'Estado de stock',
    description: 'Inventario actual y productos con stock bajo',
    icon: BarChart3,
    color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
  },
  {
    id: 'accounts',
    title: 'Cuentas corrientes',
    description: 'Saldos de clientes y antigüedad de deuda',
    icon: Users,
    color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
  },
]

export default function Reports() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Reportes
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Informes y estadísticas del negocio
        </p>
      </div>

      {/* Filtros de período */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <Calendar size={20} />
            <span>Período:</span>
          </div>
          <Select
            options={[
              { value: 'today', label: 'Hoy' },
              { value: 'week', label: 'Esta semana' },
              { value: 'month', label: 'Este mes' },
              { value: 'quarter', label: 'Este trimestre' },
              { value: 'year', label: 'Este año' },
              { value: 'custom', label: 'Personalizado' },
            ]}
            className="w-48"
          />
        </div>
      </div>

      {/* Grid de reportes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportTypes.map((report) => (
          <div
            key={report.id}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${report.color}`}>
                <report.icon size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {report.title}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  {report.description}
                </p>
                <div className="flex gap-2 mt-4">
                  <Button size="sm">
                    Ver reporte
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download size={16} />
                    Exportar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mensaje informativo */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
        <p className="text-blue-800 dark:text-blue-200">
          <strong>Próximamente:</strong> Gráficos interactivos, comparativas con períodos anteriores y exportación a Excel.
        </p>
      </div>
    </div>
  )
}
