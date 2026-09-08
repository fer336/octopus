/**
 * Página de Reportes.
 * Centro de descargas PDF, Excel y CSV para los reportes del negocio.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  BarChart3,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  FolderTree,
  Package,
  ReceiptText,
  Truck,
  Users,
  WalletCards,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Input, Select } from '../components/ui'
import categoriesService from '../api/categoriesService'
import clientsService from '../api/clientsService'
import reportsService, {
  REPORT_FORMAT,
  REPORT_TYPE,
  ReportFilters,
  ReportFormat,
  ReportType,
} from '../api/reportsService'
import stockpileService from '../api/stockpileService'
import suppliersService from '../api/suppliersService'

const REPORT_FIELD = {
  SEARCH: 'search',
  CATEGORY_ID: 'categoryId',
  SUPPLIER_ID: 'supplierId',
  LOW_STOCK_ONLY: 'lowStockOnly',
  INCLUDE_INACTIVE: 'includeInactive',
  INCLUDE_RECEIPTS: 'includeReceipts',
  ONLY_WITH_BALANCE: 'onlyWithBalance',
  ONLY_WITH_STOCK: 'onlyWithStock',
  DATE_FROM: 'dateFrom',
  DATE_TO: 'dateTo',
  LIMIT: 'limit',
  STATUS: 'status',
  STOCKPILE_ID: 'stockpileId',
  CLIENT_ID: 'clientId',
} as const

type ReportField = (typeof REPORT_FIELD)[keyof typeof REPORT_FIELD]

interface ReportDefinition {
  id: ReportType
  title: string
  description: string
  icon: typeof BarChart3
  color: string
  fields: ReportField[]
}

interface SelectOption {
  value: string
  label: string
}

interface ExportingReport {
  type: ReportType
  format: ReportFormat
}

const reportTypes: ReportDefinition[] = [
  {
    id: REPORT_TYPE.STOCK,
    title: 'Control de stock',
    description: 'Inventario actual, stock bajo y valorización.',
    icon: BarChart3,
    color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    fields: [
      REPORT_FIELD.SEARCH,
      REPORT_FIELD.CATEGORY_ID,
      REPORT_FIELD.SUPPLIER_ID,
      REPORT_FIELD.LOW_STOCK_ONLY,
      REPORT_FIELD.INCLUDE_INACTIVE,
    ],
  },
  {
    id: REPORT_TYPE.SALES,
    title: 'Ventas por período',
    description: 'Comprobantes confirmados dentro del rango elegido.',
    icon: ReceiptText,
    color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    fields: [REPORT_FIELD.DATE_FROM, REPORT_FIELD.DATE_TO, REPORT_FIELD.INCLUDE_RECEIPTS],
  },
  {
    id: REPORT_TYPE.TOP_PRODUCTS,
    title: 'Productos más vendidos',
    description: 'Ranking de productos vendidos por cantidad e importe.',
    icon: Package,
    color: 'text-primary-600 bg-primary-100 dark:bg-primary-900/30',
    fields: [REPORT_FIELD.DATE_FROM, REPORT_FIELD.DATE_TO, REPORT_FIELD.LIMIT],
  },
  {
    id: REPORT_TYPE.CLIENT_ACCOUNTS,
    title: 'Cuentas corrientes',
    description: 'Saldos de clientes con deuda o crédito disponible.',
    icon: Users,
    color: 'text-primary-600 bg-primary-100 dark:bg-primary-900/30',
    fields: [REPORT_FIELD.ONLY_WITH_BALANCE],
  },
  {
    id: REPORT_TYPE.INVENTORY_COUNT,
    title: 'Planilla de conteo',
    description: 'Control físico de inventario por proveedor o categoría.',
    icon: ClipboardList,
    color: 'text-slate-600 bg-slate-100 dark:bg-slate-900/30',
    fields: [REPORT_FIELD.CATEGORY_ID, REPORT_FIELD.SUPPLIER_ID],
  },
  {
    id: REPORT_TYPE.CATEGORY,
    title: 'Por categoría',
    description: 'Productos agrupados por categoría y valor de stock.',
    icon: FolderTree,
    color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
    fields: [REPORT_FIELD.DATE_FROM, REPORT_FIELD.DATE_TO, REPORT_FIELD.CATEGORY_ID],
  },
  {
    id: REPORT_TYPE.SUPPLIER,
    title: 'Por proveedor',
    description: 'Productos, precios, stock y márgenes por proveedor.',
    icon: Truck,
    color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30',
    fields: [
      REPORT_FIELD.DATE_FROM,
      REPORT_FIELD.DATE_TO,
      REPORT_FIELD.SUPPLIER_ID,
      REPORT_FIELD.ONLY_WITH_STOCK,
    ],
  },
  {
    id: REPORT_TYPE.PURCHASE_ORDER_HISTORY,
    title: 'Historial de órdenes',
    description: 'Órdenes de pedido filtradas por período, proveedor y estado.',
    icon: FileSpreadsheet,
    color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30',
    fields: [REPORT_FIELD.DATE_FROM, REPORT_FIELD.DATE_TO, REPORT_FIELD.SUPPLIER_ID, REPORT_FIELD.STATUS],
  },
  {
    id: REPORT_TYPE.STOCKPILE_WITHDRAWALS,
    title: 'Retiros de acopio',
    description: 'Mercadería retirada desde acopios confirmados.',
    icon: Archive,
    color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    fields: [REPORT_FIELD.DATE_FROM, REPORT_FIELD.DATE_TO, REPORT_FIELD.STOCKPILE_ID],
  },
  {
    id: REPORT_TYPE.CURRENT_ACCOUNT_WITHDRAWALS,
    title: 'Retiros de cuenta corriente',
    description: 'Mercadería retirada mediante remitos de cuenta corriente.',
    icon: WalletCards,
    color: 'text-rose-600 bg-rose-100 dark:bg-rose-900/30',
    fields: [REPORT_FIELD.DATE_FROM, REPORT_FIELD.DATE_TO, REPORT_FIELD.CLIENT_ID],
  },
]

const exportFormats = [
  { format: REPORT_FORMAT.PDF, label: 'PDF', icon: FileText },
  { format: REPORT_FORMAT.EXCEL, label: 'Excel', icon: FileSpreadsheet },
  { format: REPORT_FORMAT.CSV, label: 'CSV', icon: Download },
]

const defaultFilters: Record<ReportType, ReportFilters> = {
  [REPORT_TYPE.STOCK]: { lowStockOnly: false, includeInactive: false },
  [REPORT_TYPE.SALES]: { includeReceipts: true },
  [REPORT_TYPE.TOP_PRODUCTS]: { limit: 30 },
  [REPORT_TYPE.CLIENT_ACCOUNTS]: { onlyWithBalance: true },
  [REPORT_TYPE.INVENTORY_COUNT]: {},
  [REPORT_TYPE.CATEGORY]: {},
  [REPORT_TYPE.SUPPLIER]: { onlyWithStock: false },
  [REPORT_TYPE.PURCHASE_ORDER_HISTORY]: {},
  [REPORT_TYPE.STOCKPILE_WITHDRAWALS]: {},
  [REPORT_TYPE.CURRENT_ACCOUNT_WITHDRAWALS]: {},
}

function buildOptions(items: Array<{ id: string; name: string }>, emptyLabel: string): SelectOption[] {
  return [{ value: '', label: emptyLabel }, ...items.map((item) => ({ value: item.id, label: item.name }))]
}

function validateFilters(type: ReportType, filters: ReportFilters): string | null {
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    return 'La fecha desde no puede ser posterior a la fecha hasta.'
  }

  if (type === REPORT_TYPE.INVENTORY_COUNT && !filters.supplierId && !filters.categoryId) {
    return 'Seleccioná un proveedor o una categoría para la planilla de conteo.'
  }

  return null
}

function CheckboxField({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      {label}
    </label>
  )
}

function FilterSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-10 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
      ))}
    </div>
  )
}

function ReportFiltersPanel({
  report,
  filters,
  categoryOptions,
  supplierOptions,
  clientOptions,
  stockpileOptions,
  isLoadingOptions,
  onChange,
}: {
  report: ReportDefinition
  filters: ReportFilters
  categoryOptions: SelectOption[]
  supplierOptions: SelectOption[]
  clientOptions: SelectOption[]
  stockpileOptions: SelectOption[]
  isLoadingOptions: boolean
  onChange: (field: keyof ReportFilters, value: string | number | boolean | undefined) => void
}) {
  if (isLoadingOptions) return <FilterSkeleton />

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {report.fields.includes(REPORT_FIELD.SEARCH) && (
        <Input label="Buscar" value={filters.search ?? ''} onChange={(event) => onChange('search', event.target.value)} />
      )}
      {report.fields.includes(REPORT_FIELD.DATE_FROM) && (
        <Input label="Desde" type="date" value={filters.dateFrom ?? ''} onChange={(event) => onChange('dateFrom', event.target.value)} />
      )}
      {report.fields.includes(REPORT_FIELD.DATE_TO) && (
        <Input label="Hasta" type="date" value={filters.dateTo ?? ''} onChange={(event) => onChange('dateTo', event.target.value)} />
      )}
      {report.fields.includes(REPORT_FIELD.CATEGORY_ID) && (
        <Select label="Categoría" value={filters.categoryId ?? ''} options={categoryOptions} onChange={(event) => onChange('categoryId', event.target.value)} />
      )}
      {report.fields.includes(REPORT_FIELD.SUPPLIER_ID) && (
        <Select label="Proveedor" value={filters.supplierId ?? ''} options={supplierOptions} onChange={(event) => onChange('supplierId', event.target.value)} />
      )}
      {report.fields.includes(REPORT_FIELD.STOCKPILE_ID) && (
        <Select label="Acopio" value={filters.stockpileId ?? ''} options={stockpileOptions} onChange={(event) => onChange('stockpileId', event.target.value)} />
      )}
      {report.fields.includes(REPORT_FIELD.CLIENT_ID) && (
        <Select label="Cliente" value={filters.clientId ?? ''} options={clientOptions} onChange={(event) => onChange('clientId', event.target.value)} />
      )}
      {report.fields.includes(REPORT_FIELD.LIMIT) && (
        <Input label="Límite" type="number" min={1} max={200} value={filters.limit ?? 30} onChange={(event) => onChange('limit', Number(event.target.value))} />
      )}
      {report.fields.includes(REPORT_FIELD.STATUS) && (
        <Select
          label="Estado"
          value={filters.status ?? ''}
          options={[
            { value: '', label: 'Todos' },
            { value: 'draft', label: 'Borrador' },
            { value: 'confirmed', label: 'Confirmada' },
          ]}
          onChange={(event) => onChange('status', event.target.value)}
        />
      )}
      <div className="flex flex-col justify-end gap-2">
        {report.fields.includes(REPORT_FIELD.LOW_STOCK_ONLY) && (
          <CheckboxField checked={Boolean(filters.lowStockOnly)} label="Solo stock bajo" onChange={(value) => onChange('lowStockOnly', value)} />
        )}
        {report.fields.includes(REPORT_FIELD.INCLUDE_INACTIVE) && (
          <CheckboxField checked={Boolean(filters.includeInactive)} label="Incluir inactivos" onChange={(value) => onChange('includeInactive', value)} />
        )}
        {report.fields.includes(REPORT_FIELD.INCLUDE_RECEIPTS) && (
          <CheckboxField checked={filters.includeReceipts !== false} label="Incluir remitos" onChange={(value) => onChange('includeReceipts', value)} />
        )}
        {report.fields.includes(REPORT_FIELD.ONLY_WITH_BALANCE) && (
          <CheckboxField checked={filters.onlyWithBalance !== false} label="Solo con saldo" onChange={(value) => onChange('onlyWithBalance', value)} />
        )}
        {report.fields.includes(REPORT_FIELD.ONLY_WITH_STOCK) && (
          <CheckboxField checked={Boolean(filters.onlyWithStock)} label="Solo con stock" onChange={(value) => onChange('onlyWithStock', value)} />
        )}
      </div>
    </div>
  )
}

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState<ReportType>(REPORT_TYPE.STOCK)
  const [filtersByReport, setFiltersByReport] = useState<Record<ReportType, ReportFilters>>(defaultFilters)
  const [exportingReport, setExportingReport] = useState<ExportingReport | null>(null)

  const categoriesQuery = useQuery({ queryKey: ['report-categories'], queryFn: categoriesService.getAll })
  const suppliersQuery = useQuery({ queryKey: ['report-suppliers'], queryFn: () => suppliersService.getAll({ per_page: 200 }) })
  const clientsQuery = useQuery({ queryKey: ['report-clients'], queryFn: () => clientsService.getAll({ per_page: 200 }) })
  const stockpilesQuery = useQuery({ queryKey: ['report-stockpiles'], queryFn: () => stockpileService.getAll({ per_page: 200 }) })

  const activeReport = reportTypes.find((report) => report.id === selectedReport) ?? reportTypes[0]
  const activeFilters = filtersByReport[selectedReport]
  const isLoadingOptions = categoriesQuery.isLoading || suppliersQuery.isLoading || clientsQuery.isLoading || stockpilesQuery.isLoading
  const categoryOptions = buildOptions(categoriesQuery.data ?? [], 'Todas')
  const supplierOptions = buildOptions(suppliersQuery.data?.items ?? [], 'Todos')
  const clientOptions = buildOptions(clientsQuery.data?.items ?? [], 'Todos')
  const stockpileOptions = buildOptions(stockpilesQuery.data?.items ?? [], 'Todos')

  const updateFilter = (field: keyof ReportFilters, value: string | number | boolean | undefined) => {
    setFiltersByReport((current) => ({
      ...current,
      [selectedReport]: {
        ...current[selectedReport],
        [field]: value === '' ? undefined : value,
      },
    }))
  }

  const handleExport = async (type: ReportType, format: ReportFormat) => {
    const filters = filtersByReport[type]
    const validationError = validateFilters(type, filters)

    if (validationError) {
      toast.error(validationError)
      return
    }

    setExportingReport({ type, format })
    try {
      await reportsService.downloadReport(type, format, filters)
      toast.success('Reporte descargado correctamente', { icon: '✅' })
    } catch (error) {
      toast.error('No se pudo descargar el reporte')
      console.error(error)
    } finally {
      setExportingReport(null)
    }
  }

  return (
    <div className="space-y-4 -mt-1">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Reportes</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Elegí un reporte, ajustá sus filtros y descargalo en PDF, Excel o CSV.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reportTypes.map((report) => (
          <button
            key={report.id}
            type="button"
            onClick={() => setSelectedReport(report.id)}
            className={`text-left bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border transition-colors ${
              selectedReport === report.id
                ? 'border-primary-500 ring-2 ring-primary-100 dark:ring-primary-900/40'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-3 rounded-lg ${report.color}`}>
                <report.icon size={22} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{report.title}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{report.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{activeReport.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Filtros disponibles para este reporte.</p>
        </div>

        <ReportFiltersPanel
          report={activeReport}
          filters={activeFilters}
          categoryOptions={categoryOptions}
          supplierOptions={supplierOptions}
          clientOptions={clientOptions}
          stockpileOptions={stockpileOptions}
          isLoadingOptions={isLoadingOptions}
          onChange={updateFilter}
        />

        <div className="flex flex-wrap gap-2 pt-2">
          {exportFormats.map((item) => (
            <Button
              key={item.format}
              size="sm"
              variant={item.format === REPORT_FORMAT.PDF ? 'primary' : 'outline'}
              onClick={() => handleExport(selectedReport, item.format)}
              isLoading={exportingReport?.type === selectedReport && exportingReport.format === item.format}
              disabled={isLoadingOptions}
            >
              <item.icon size={16} />
              {item.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
