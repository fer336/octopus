/**
 * Tab de Ingresos por Acopios.
 * Muestra la lista de acopios con ingresos generados.
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database } from 'lucide-react'
import { Table, Pagination } from '../../components/ui'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters } from '../../api/profitabilityService'

interface StockpilesTabProps {
  dateFrom: string
  dateTo: string
  filters?: ProfitabilityFilters
}

export default function StockpilesTab({ dateFrom, dateTo, filters }: StockpilesTabProps) {
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['profitability', 'stockpiles', dateFrom, dateTo, page, filters],
    queryFn: () => profitabilityService.getStockpiles({
      date_from: dateFrom,
      date_to: dateTo,
      page,
      per_page: 20,
      ...(filters ?? {}),
    }),
  })

  if (isError) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <p className="text-center text-red-500">Error al cargar ingresos por acopios</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <Database size={18} className="text-blue-500" />
        <h3 className="font-semibold text-gray-900 dark:text-white">Ingresos por Acopios</h3>
      </div>
      <Table
        columns={[
          { key: 'client_name', header: 'Cliente' },
          { key: 'total_paid', header: 'Total Pagado', render: (row: any) => `$${Number(row.total_paid).toLocaleString()}` },
          { key: 'total_withdrawn', header: 'Total Retirado', render: (row: any) => `$${Number(row.total_withdrawn).toLocaleString()}` },
          { key: 'remaining', header: 'Saldo', render: (row: any) => `$${Number(row.remaining).toLocaleString()}` },
          {
            key: 'status',
            header: 'Estado',
            render: (row: any) => (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                row.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                row.status === 'closed' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {row.status === 'active' ? 'Activo' : row.status === 'closed' ? 'Cerrado' : row.status}
              </span>
            ),
          },
        ]}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No hay acopios en este período"
        density="compact"
      />
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <Pagination
          currentPage={page}
          totalPages={data?.pages ?? 1}
          onPageChange={setPage}
          totalItems={data?.total}
          itemsPerPage={20}
        />
      </div>
    </div>
  )
}
