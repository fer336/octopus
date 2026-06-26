/**
 * ClientsTab — Rentabilidad desglosada por cliente.
 * Tabla paginada con búsqueda por nombre.
 */
import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters, ClientProfit } from '../../api/profitabilityService'
import { Table, Pagination, SearchBar } from '../../components/ui'
import { useDebounce } from '../../hooks/useDebounce'

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

export default function ClientsTab({ dateFrom, dateTo, filters }: TabProps) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  const query = useQuery({
    queryKey: ['profitability', 'clients', dateFrom, dateTo, page, debouncedSearch, filters],
    queryFn: () =>
      profitabilityService.getClients({
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
        placeholder="Buscar por nombre de cliente..."
        className="max-w-sm"
      />

      {query.isError ? (
        <div className="text-center py-8 text-red-500">
          Error al cargar clientes.{' '}
          <button onClick={() => query.refetch()} className="underline">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'name', header: 'Cliente' },
              {
                key: 'total_billed',
                header: 'Facturado',
                render: (row: ClientProfit) => formatCurrency(row.total_billed),
                className: 'text-right tabular-nums',
              },
              {
                key: 'total_cost',
                header: 'Costo',
                render: (row: ClientProfit) => formatCurrency(row.total_cost),
                className: 'text-right tabular-nums',
              },
              {
                key: 'margin',
                header: 'Margen $',
                render: (row: ClientProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {formatCurrency(row.margin)}
                  </span>
                ),
                className: 'text-right font-medium tabular-nums',
              },
              {
                key: 'margin_pct',
                header: 'Margen %',
                render: (row: ClientProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {row.margin_pct.toFixed(1)}%
                  </span>
                ),
                className: 'text-right font-medium tabular-nums',
              },
              {
                key: 'invoice_count',
                header: 'Cant.',
                render: (row: ClientProfit) => row.invoice_count,
                className: 'text-right',
              },
            ]}
            data={items}
            isLoading={query.isLoading}
            emptyMessage="No hay clientes con ventas en este período"
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
