/**
 * DocumentsTab — Rentabilidad desglosada por documento.
 * Tabla paginada con datos del comprobante, cliente, vendedor, montos y márgenes.
 */
import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import profitabilityService from '../../api/profitabilityService'
import type { ProfitabilityFilters, DocumentProfit } from '../../api/profitabilityService'
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

const formatDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const docTypeLabels: Record<string, string> = {
  invoice: 'Factura',
  receipt: 'Remito',
  quotation: 'Cotización',
  credit_note: 'Nota de Crédito',
  debit_note: 'Nota de Débito',
}

// ── Component ────────────────────────────────────────────────────────

export default function DocumentsTab({ dateFrom, dateTo, filters }: TabProps) {
  const [page, setPage] = useState(1)
  const navigate = useNavigate()

  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  const query = useQuery({
    queryKey: ['profitability', 'documents', dateFrom, dateTo, page, filters],
    queryFn: () =>
      profitabilityService.getDocuments({
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

  const handleRowClick = (row: DocumentProfit) => {
    navigate(`/vouchers/${row.voucher_id}`)
  }

  return (
    <div className="space-y-4">
      {query.isError ? (
        <div className="text-center py-8 text-red-500">
          Error al cargar documentos.{' '}
          <button onClick={() => query.refetch()} className="underline">
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <Table
            columns={[
              {
                key: 'document_type',
                header: 'Documento',
                render: (row: DocumentProfit) => (
                  <span className="font-medium">
                    {docTypeLabels[row.document_type] ?? row.document_type}{' '}
                    <span className="text-slate-400">{row.document_number}</span>
                  </span>
                ),
              },
              {
                key: 'date',
                header: 'Fecha',
                render: (row: DocumentProfit) => formatDate(row.date),
              },
              { key: 'client_name', header: 'Cliente' },
              { key: 'seller_name', header: 'Vendedor' },
              {
                key: 'revenue',
                header: 'Venta',
                render: (row: DocumentProfit) => formatCurrency(row.revenue),
                className: 'text-right tabular-nums',
              },
              {
                key: 'cost',
                header: 'Costo',
                render: (row: DocumentProfit) => formatCurrency(row.cost),
                className: 'text-right tabular-nums',
              },
              {
                key: 'profit',
                header: 'Ganancia',
                render: (row: DocumentProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {formatCurrency(row.profit)}
                  </span>
                ),
                className: 'text-right font-medium tabular-nums',
              },
              {
                key: 'margin_pct',
                header: 'Margen %',
                render: (row: DocumentProfit) => (
                  <span className={accentMap[marginAccent(row.margin_pct)]}>
                    {row.margin_pct.toFixed(1)}%
                  </span>
                ),
                className: 'text-right tabular-nums',
              },
              {
                key: 'status',
                header: 'Estado',
                render: (row: DocumentProfit) => {
                  const colors: Record<string, string> = {
                    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
                    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                  }
                  return (
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        colors[row.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {row.status === 'completed'
                        ? 'Completado'
                        : row.status === 'pending'
                          ? 'Pendiente'
                          : row.status === 'cancelled'
                            ? 'Cancelado'
                            : row.status}
                    </span>
                  )
                },
              },
            ]}
            data={items}
            isLoading={query.isLoading}
            emptyMessage="No hay documentos en este período"
            density="compact"
            onRowClick={handleRowClick}
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
