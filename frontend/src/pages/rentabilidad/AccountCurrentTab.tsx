/**
 * Tab de Cuenta Corriente por Cliente.
 * Resumen de deuda, vencido, pagos y antigüedad.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Users, AlertTriangle } from 'lucide-react'
import { Table, Input } from '../../components/ui'
import { useDebounce } from '../../hooks/useDebounce'
import clientsService from '../../api/clientsService'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters } from '../../api/profitabilityService'

interface AccountCurrentTabProps {
  dateFrom: string
  dateTo: string
  filters?: ProfitabilityFilters
}

export default function AccountCurrentTab({ dateFrom: _dateFrom, dateTo: _dateTo, filters }: AccountCurrentTabProps) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const { data: clients } = useQuery({
    queryKey: ['clients', 'search', debouncedSearch],
    queryFn: () => clientsService.getAll({ search: debouncedSearch, per_page: 50 }),
  })

  const selectedClientId = filters?.client_id

  const { data: accountSummary, isLoading } = useQuery({
    queryKey: ['profitability', 'account-summary', selectedClientId],
    queryFn: () => (selectedClientId ? profitabilityService.getAccountSummary(selectedClientId) : null),
    enabled: !!selectedClientId,
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Client selector */}
      <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-purple-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Seleccionar Cliente</h3>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="mt-3 space-y-1 max-h-96 overflow-y-auto">
          {(clients?.items ?? []).map((client: any) => (
            <button
              key={client.id}
              onClick={() => /* set selected client */ {}}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedClientId === client.id
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
              }`}
            >
              {client.name}
              {client.current_account_mode && (
                <span className="ml-2 text-xs text-gray-400">({client.current_account_mode})</span>
              )}
            </button>
          ))}
          {!clients?.items?.length && (
            <p className="text-sm text-gray-400 text-center py-4">Sin resultados</p>
          )}
        </div>
      </div>

      {/* Account details */}
      <div className="lg:col-span-2">
        {!selectedClientId ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
            <Users size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Seleccioná un cliente para ver su cuenta corriente</p>
          </div>
        ) : isLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ) : accountSummary ? (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{accountSummary.client_name}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Deuda Total</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">${accountSummary.total_debt.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Vencido</p>
                  <p className={`text-lg font-bold ${accountSummary.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    ${accountSummary.overdue.toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pagado este Mes</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">${accountSummary.paid_this_month.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Antigüedad</p>
                  <p className={`text-lg font-bold flex items-center gap-1 ${accountSummary.aging_days > 30 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {accountSummary.aging_days > 30 && <AlertTriangle size={16} />}
                    {accountSummary.aging_days} días
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Detalle</h4>
              <Table
                columns={[
                  { key: 'total_debt', header: 'Deuda Total', render: (row: any) => `$${row.total_debt.toLocaleString()}` },
                  { key: 'overdue', header: 'Vencido', render: (row: any) => `$${row.overdue.toLocaleString()}` },
                  { key: 'paid_this_month', header: 'Pagado en el Mes', render: (row: any) => `$${row.paid_this_month.toLocaleString()}` },
                  { key: 'balance', header: 'Saldo', render: (row: any) => `$${row.balance.toLocaleString()}` },
                  { key: 'aging_days', header: 'Días de Antigüedad', render: (row: any) => `${row.aging_days} días` },
                ]}
                data={[accountSummary]}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">No se encontró información de cuenta corriente para este cliente</p>
          </div>
        )}
      </div>
    </div>
  )
}
