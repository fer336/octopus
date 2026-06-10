/**
 * RemitosResumen — aggregated product summary across selected receipts.
 * Receives selectedReceipts as prop (no extra fetch).
 */
import { useMemo } from 'react'
import { Voucher } from '../../api/vouchersService'

export interface RemitosResumenProps {
  selectedReceipts: Voucher[]
  itemQuantityOverrides: Map<string, number>
}

interface ProductLine {
  code: string
  description: string
  unit: string
  totalQty: number
  avgUnitPrice: number
  subtotal: number
}

export default function RemitosResumen({
  selectedReceipts,
  itemQuantityOverrides,
}: RemitosResumenProps) {
  const lines = useMemo<ProductLine[]>(() => {
    const byCode = new Map<
      string,
      { description: string; unit: string; qty: number; totalPrice: number }
    >()

    for (const voucher of selectedReceipts) {
      for (const item of voucher.items) {
        const qty = itemQuantityOverrides.has(item.id)
          ? itemQuantityOverrides.get(item.id)!
          : item.quantity

        if (qty === 0) continue

        const existing = byCode.get(item.code)
        if (existing) {
          existing.qty += qty
          existing.totalPrice += qty * item.unit_price
        } else {
          byCode.set(item.code, {
            description: item.description,
            unit: item.unit,
            qty,
            totalPrice: qty * item.unit_price,
          })
        }
      }
    }

    return Array.from(byCode.entries()).map(([code, v]) => ({
      code,
      description: v.description,
      unit: v.unit,
      totalQty: v.qty,
      avgUnitPrice: v.qty > 0 ? v.totalPrice / v.qty : 0,
      subtotal: v.totalPrice,
    }))
  }, [selectedReceipts, itemQuantityOverrides])

  const grandTotal = useMemo(
    () => lines.reduce((acc, l) => acc + l.subtotal, 0),
    [lines]
  )

  if (selectedReceipts.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Seleccioná remitos para ver el resumen de productos.
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        Los remitos seleccionados no tienen ítems con cantidad activa.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        {selectedReceipts.length} remito{selectedReceipts.length !== 1 ? 's' : ''} seleccionado
        {selectedReceipts.length !== 1 ? 's' : ''} · {lines.length} producto
        {lines.length !== 1 ? 's' : ''} distintos
      </p>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/70 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Unidad</th>
              <th className="px-3 py-2 text-right">Qty total</th>
              <th className="px-3 py-2 text-right">Precio prom.</th>
              <th className="px-3 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.code}
                className="border-t border-gray-100 dark:border-gray-700"
              >
                <td className="px-3 py-2 text-gray-900 dark:text-white">
                  {line.description}
                </td>
                <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400">
                  {line.code}
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                  {line.unit}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-900 dark:text-white">
                  {line.totalQty.toLocaleString('es-AR')}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                  $
                  {line.avgUnitPrice.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                  })}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-gray-900 dark:text-white">
                  $
                  {line.subtotal.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/70">
              <td
                colSpan={5}
                className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 text-right"
              >
                Total general
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">
                $
                {grandTotal.toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {lines.map((line) => (
          <div
            key={line.code}
            className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {line.description}
              </span>
              <span className="font-mono font-semibold text-gray-900 dark:text-white shrink-0">
                $
                {line.subtotal.toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-3">
              <span>{line.code}</span>
              <span>
                {line.totalQty.toLocaleString('es-AR')} {line.unit}
              </span>
              <span>
                @ $
                {line.avgUnitPrice.toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        ))}

        <div className="rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 p-3 flex justify-between items-center">
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Total general
          </span>
          <span className="font-mono font-bold text-gray-900 dark:text-white">
            $
            {grandTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  )
}
