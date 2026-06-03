/**
 * RemitosTable — paginated table of CC receipts for a given titular.
 * Supports row expansion (item detail), qty overrides, and bulk selection.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { Pagination } from '../ui'
import vouchersService, { Voucher, VoucherItem } from '../../api/vouchersService'

export interface RemitosTableProps {
  titularId: string
  selectedIds: Set<string>
  itemQuantityOverrides: Map<string, number>
  page: number
  onPageChange: (p: number) => void
  onToggleReceipt: (id: string) => void
  onToggleAll: (ids: string[]) => void
  onItemQtyChange: (itemId: string, qty: number) => void
}

const PER_PAGE = 15

export default function RemitosTable({
  titularId,
  selectedIds,
  itemQuantityOverrides,
  page,
  onPageChange,
  onToggleReceipt,
  onToggleAll,
  onItemQtyChange,
}: RemitosTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['current-account-receipts', titularId, page, PER_PAGE],
    queryFn: () =>
      vouchersService.getCurrentAccountReceipts({
        billing_client_id: titularId,
        page,
        per_page: PER_PAGE,
        pending_only: true,
      }),
    staleTime: 15_000,
  })

  const vouchers: Voucher[] = data?.items ?? []
  const totalPages = data?.pages ?? 1
  const totalItems = data?.total ?? 0

  const pendingIds = useMemo(
    () => vouchers.filter((v) => !v.invoiced_voucher_id).map((v) => v.id),
    [vouchers]
  )

  const allPendingSelected =
    pendingIds.length > 0 && pendingIds.every((id) => selectedIds.has(id))

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
        Cargando remitos...
      </div>
    )
  }

  if (vouchers.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No hay remitos pendientes de Cuenta Corriente para este titular.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Desktop table */}
      <div className="hidden lg:block overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/70 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={allPendingSelected}
                  onChange={() => onToggleAll(pendingIds)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </th>
              <th className="px-3 py-2 text-left">Remito</th>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Cliente operativo</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-center w-10">Det.</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher) => {
              const isLocked = !!voucher.invoiced_voucher_id
              const isSelected = selectedIds.has(voucher.id)
              const isExpanded = expandedIds.has(voucher.id)
              const operatingName =
                voucher.operating_client?.name ?? '—'

              return (
                <>
                  <tr
                    key={voucher.id}
                    className={[
                      'border-t border-gray-100 dark:border-gray-700',
                      isSelected
                        ? 'bg-primary-50 dark:bg-primary-900/10'
                        : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleReceipt(voucher.id)}
                        disabled={isLocked}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-gray-900 dark:text-white">
                        {voucher.sale_point}-{voucher.number}
                      </span>
                      {isLocked && (
                        <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-1.5 py-0.5 text-[10px] font-medium">
                          <AlertTriangle size={10} />
                          Cerrado
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {new Date(`${voucher.date}T00:00:00`).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                      {operatingName}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                      $
                      {Number(voucher.total).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => toggleExpand(voucher.id)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
                        title={isExpanded ? 'Ocultar ítems' : 'Ver ítems'}
                      >
                        {isExpanded ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded items */}
                  {isExpanded &&
                    voucher.items.map((item) => (
                      <ExpandedItemRow
                        key={item.id}
                        item={item}
                        isReceiptSelected={isSelected}
                        override={itemQuantityOverrides.get(item.id)}
                        onQtyChange={(qty) => onItemQtyChange(item.id, qty)}
                      />
                    ))}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {vouchers.map((voucher) => {
          const isLocked = !!voucher.invoiced_voucher_id
          const isSelected = selectedIds.has(voucher.id)
          const isExpanded = expandedIds.has(voucher.id)

          return (
            <div
              key={voucher.id}
              className={[
                'rounded-xl border p-3 shadow-sm',
                isSelected
                  ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleReceipt(voucher.id)}
                    disabled={isLocked}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {voucher.sale_point}-{voucher.number}
                  </span>
                </label>
                <span className="font-mono font-bold text-gray-900 dark:text-white">
                  $
                  {Number(voucher.total).toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-gray-500 dark:text-gray-400">
                  {new Date(`${voucher.date}T00:00:00`).toLocaleDateString('es-AR')}
                </span>
                {isLocked ? (
                  <span className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
                    <AlertTriangle size={10} />
                    Cerrado
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300">
                    <CheckCircle2 size={10} />
                    Pendiente
                  </span>
                )}
              </div>

              <button
                onClick={() => toggleExpand(voucher.id)}
                className="w-full flex items-center justify-center gap-1 text-xs text-primary-600 hover:text-primary-700"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp size={12} /> Ocultar ítems
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} /> Ver ítems ({voucher.items.length})
                  </>
                )}
              </button>

              {isExpanded && (
                <div className="mt-2 space-y-1 border-t border-gray-100 dark:border-gray-700 pt-2">
                  {voucher.items.map((item) => (
                    <div
                      key={item.id}
                      className="text-xs text-gray-700 dark:text-gray-300 flex items-center justify-between gap-2"
                    >
                      <span className="flex-1 truncate">{item.description}</span>
                      {isSelected ? (
                        <input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={itemQuantityOverrides.get(item.id) ?? item.quantity}
                          onChange={(e) =>
                            onItemQtyChange(item.id, Number(e.target.value))
                          }
                          className="w-16 px-1 py-0.5 border border-gray-300 rounded text-right text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      ) : (
                        <span className="font-mono">{item.quantity} {item.unit}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        totalItems={totalItems}
        itemsPerPage={PER_PAGE}
      />
    </div>
  )
}

// Sub-component: expanded item row for the desktop table
function ExpandedItemRow({
  item,
  isReceiptSelected,
  override,
  onQtyChange,
}: {
  item: VoucherItem
  isReceiptSelected: boolean
  override: number | undefined
  onQtyChange: (qty: number) => void
}) {
  const displayQty = override ?? item.quantity

  return (
    <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs border-t border-dashed border-gray-200 dark:border-gray-700">
      <td />
      <td
        colSpan={2}
        className="px-3 py-1.5 text-gray-700 dark:text-gray-300 pl-8"
      >
        <span className="font-mono text-gray-500 mr-2">{item.code}</span>
        {item.description}
      </td>
      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">
        {isReceiptSelected ? (
          <input
            type="number"
            min={0}
            max={item.quantity}
            value={displayQty}
            onChange={(e) => onQtyChange(Number(e.target.value))}
            className="w-20 px-2 py-0.5 border border-gray-300 rounded text-right text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        ) : (
          <span className="font-mono">
            {displayQty} {item.unit}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">
        $
        {Number(item.unit_price).toLocaleString('es-AR', {
          minimumFractionDigits: 2,
        })}
      </td>
      <td />
    </tr>
  )
}
