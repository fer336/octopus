/**
 * CategoriesTab — Rentabilidad desglosada por categoría.
 * Tabla paginada con ingresos, costos y márgenes.
 */
import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters, CategoryProfit } from '../../api/profitabilityService'
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

export default function CategoriesTab({ dateFrom, dateTo, filters }: TabProps) {
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  const query = useQuery({
    queryKey: ['profitability', 'categories', dateFrom, dateTo, page, filters],
    queryFn: () =>
      profitabilityService.getCategories({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        per_page: 20,
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
          Error al cargar categorías.{' '}
          <button onClick={() => query.refetch()} className="underline">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'name', header: 'Categoría' },
              {
                key: 'revenue',
                header: 'Ingreso',
                render: (row: CategoryProfit) => formatCurrency(row.revenue),
                className: 'text-right tabular-nums',
              },
              {
                key: 'cost',
                header: 'Costo',
                render: (row: CategoryProfit) => formatCurrency(row.cost),
                className: 'text-right tabular-nums',
              },
              {
                key: 'margin',
                header: 'Margen $',
                render: (row: CategoryProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {formatCurrency(row.margin)}
                  </span>
                ),
                className: 'text-right font-medium tabular-nums',
              },
              {
                key: 'margin_pct',
                header: 'Margen %',
                render: (row: CategoryProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {row.margin_pct.toFixed(1)}%
                  </span>
                ),
                className: 'text-right font-medium tabular-nums',
              },
              {
                key: 'item_count',
                header: 'Items',
                render: (row: CategoryProfit) => row.item_count,
                className: 'text-right',
              },
            ]}
            data={items}
            isLoading={query.isLoading}
            emptyMessage="No hay categorías con ventas en este período"
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
