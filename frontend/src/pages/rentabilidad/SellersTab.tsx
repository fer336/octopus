/**
 * SellersTab — Rentabilidad desglosada por vendedor.
 * Tabla paginada con ventas, operaciones, descuentos, ganancia y margen.
 */
import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters, SellerProfit } from '../../api/profitabilityService'
import { Table, Pagination } from '../../components/ui'

// ── Props ────────────────────────────────────────────────────────────

interface TabProps {
  dateFrom: string
  dateTo: string
  filters?: ProfitabilityFilters
}

// ── Helpers ──────────────────────────────────────────────────────────

const accentMap = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  rose: 'text-rose-600 dark:text-rose-400',
} as const

const marginAccent = (pct: number) => (pct >= 0 ? 'emerald' : 'rose') as keyof typeof accentMap

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Component ────────────────────────────────────────────────────────

export default function SellersTab({ dateFrom, dateTo, filters }: TabProps) {
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  const query = useQuery({
    queryKey: ['profitability', 'sellers', dateFrom, dateTo, page, filters],
    queryFn: () =>
      profitabilityService.getSellers({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        per_page: 20,
        ...(filters ?? {}),
      }),
    placeholderData: keepPreviousData,
    retry: false,
  })

  const data = query.data
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      {query.isError ? (
        <div className="text-center py-8 text-red-500">
          Error al cargar vendedores.{' '}
          <button onClick={() => query.refetch()} className="underline">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'seller_name', header: 'Vendedor' },
              {
                key: 'revenue',
                header: 'Ventas',
                render: (row: SellerProfit) => formatCurrency(row.revenue),
                className: 'text-right tabular-nums',
              },
              {
                key: 'invoice_count',
                header: 'Operaciones',
                render: (row: SellerProfit) => row.invoice_count,
                className: 'text-right tabular-nums',
              },
              {
                key: 'discounts_total',
                header: 'Descuentos',
                render: (row: SellerProfit) => (
                  <span className="text-rose-600 dark:text-rose-400 tabular-nums">
                    {formatCurrency(row.discounts_total)}
                  </span>
                ),
                className: 'text-right tabular-nums',
              },
              {
                key: 'profit',
                header: 'Ganancia',
                render: (row: SellerProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {formatCurrency(row.profit)}
                  </span>
                ),
                className: 'text-right font-medium tabular-nums',
              },
              {
                key: 'margin_pct',
                header: 'Margen %',
                render: (row: SellerProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {row.margin_pct.toFixed(1)}%
                  </span>
                ),
                className: 'text-right tabular-nums',
              },
            ]}
            data={items}
            isLoading={query.isLoading}
            emptyMessage="No hay vendedores con actividad en este período"
            density="compact"
          />
          <Pagination
            currentPage={page}
            totalPages={data?.pages ?? 1}
            onPageChange={setPage}
            totalItems={data?.total}
            itemsPerPage={20}
          />
        </>
      )}
    </div>
  )
}
