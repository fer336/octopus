/**
 * RemitosHistorial — list of past CC closures for a given titular.
 * Each closure is expandable to show the receipts included.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import vouchersService from '../../api/vouchersService'

export interface RemitosHistorialProps {
  titularId: string
}

export default function RemitosHistorial({ titularId }: RemitosHistorialProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const { data, isLoading, error } = useQuery({
    queryKey: ['current-account-history', titularId],
    queryFn: () => vouchersService.getCurrentAccountHistory(titularId),
    staleTime: 30_000,
  })

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Cargando historial...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-red-600 dark:text-red-400">
        Error al cargar el historial de cierres.
      </div>
    )
  }

  const closures = data?.closures ?? []

  if (closures.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No hay cierres registrados para este titular.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        {closures.length} cierre{closures.length !== 1 ? 's' : ''} registrado
        {closures.length !== 1 ? 's' : ''}
      </p>

      {closures.map((closure) => {
        const isExpanded = expandedIds.has(closure.closure_voucher_id)

        return (
          <div
            key={closure.closure_voucher_id}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
          >
            {/* Closure header */}
            <button
              onClick={() => toggleExpand(closure.closure_voucher_id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-4 text-sm">
                <span className="font-mono font-semibold text-gray-900 dark:text-white">
                  {closure.closure_number}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {new Date(closure.closure_date).toLocaleDateString('es-AR')}
                </span>
                <span className="text-gray-600 dark:text-gray-300">
                  {closure.total_receipts} remito{closure.total_receipts !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-gray-900 dark:text-white">
                  $
                  {closure.total.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                  })}
                </span>
                {isExpanded ? (
                  <ChevronUp size={16} className="text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="text-gray-400" />
                )}
              </div>
            </button>

            {/* Expanded receipts */}
            {isExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {closure.notes && (
                  <div className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50">
                    Obs.: {closure.notes}
                  </div>
                )}

                {/* Subtotals */}
                <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 flex gap-4">
                  <span>
                    Subtotal: $
                    {closure.subtotal.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                  <span>
                    IVA: $
                    {closure.iva_amount.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                {closure.receipts.map((r) => (
                  <div
                    key={r.receipt_id}
                    className="flex items-center justify-between px-6 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-gray-700 dark:text-gray-300">
                        {r.receipt_number}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">
                        {new Date(r.receipt_date).toLocaleDateString('es-AR')}
                      </span>
                      {r.operating_client_name && (
                        <span className="text-gray-600 dark:text-gray-400 text-xs">
                          {r.operating_client_name}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-gray-900 dark:text-white">
                      $
                      {r.total.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
