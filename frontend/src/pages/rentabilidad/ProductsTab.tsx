/**
 * ProductsTab — Rentabilidad desglosada por producto con markup.
 * Tabla paginada con búsqueda y columna de markup agregada.
 */
import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters, ProductProfit } from '../../api/profitabilityService'
import { Table, Pagination, SearchBar } from '../../components/ui'
import { useDebounce } from '../../hooks/useDebounce'

// ── Props ────────────────────────────────────────────────────────────

interface TabProps {
  dateFrom: string
  dateTo: string
  filters?: ProfitabilityFilters
}

// ── Color accent map ─────────────────────────────────────────────────

const accentMap = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  rose: 'text-rose-600 dark:text-rose-400',
} as const

const marginAccent = (pct: number) => (pct >= 0 ? 'emerald' : 'rose') as keyof typeof accentMap

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Component ────────────────────────────────────────────────────────

export default function ProductsTab({ dateFrom, dateTo, filters }: TabProps) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)

  // Reset page on date change
  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  const query = useQuery({
    queryKey: ['profitability', 'products', dateFrom, dateTo, page, debouncedSearch, filters],
    queryFn: () =>
      profitabilityService.getProducts({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        per_page: 20,
        search: debouncedSearch || undefined,
      }),
    placeholderData: keepPreviousData,
    retry: false,
  })

  const data = query.data
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <SearchBar
        value={search}
        onChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        placeholder="Buscar por código o descripción..."
        className="max-w-sm"
      />

      {query.isError ? (
        <div className="text-center py-8 text-red-500">
          Error al cargar productos.{' '}
          <button onClick={() => query.refetch()} className="underline">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'code', header: 'Código' },
              { key: 'description', header: 'Descripción' },
              {
                key: 'category_name',
                header: 'Categoría',
                render: (row: ProductProfit) => row.category_name ?? '—',
              },
              {
                key: 'quantity_sold',
                header: 'Cant.',
                render: (row: ProductProfit) => Number(row.quantity_sold).toFixed(2),
              },
              {
                key: 'revenue',
                header: 'Ingreso',
                render: (row: ProductProfit) => formatCurrency(row.revenue),
                className: 'text-right tabular-nums',
              },
              {
                key: 'cost',
                header: 'Costo',
                render: (row: ProductProfit) => formatCurrency(row.cost),
                className: 'text-right tabular-nums',
              },
              {
                key: 'margin',
                header: 'Margen $',
                render: (row: ProductProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {formatCurrency(row.margin)}
                  </span>
                ),
                className: 'text-right font-medium tabular-nums',
              },
              {
                key: 'margin_pct',
                header: 'Margen %',
                render: (row: ProductProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {row.margin_pct.toFixed(1)}%
                  </span>
                ),
                className: 'text-right font-medium tabular-nums',
              },
              // Markup column
              {
                key: 'markup_pct',
                header: 'Markup %',
                render: (row: ProductProfit) => (
                  <span className={accentMap[marginAccent(row.markup_pct)]}>
                    {row.markup_pct.toFixed(1)}%
                  </span>
                ),
                className: 'text-right tabular-nums',
              },
            ]}
            data={items}
            isLoading={query.isLoading}
            emptyMessage="No hay productos con ventas en este período"
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
