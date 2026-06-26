/**
 * AdvancedFilterBar — Barra de filtros colapsable con todos los criterios
 * de búsqueda para la sección de rentabilidad.
 */
import { useState } from 'react'
import { Filter, ChevronDown, ChevronUp, RotateCcw, Search } from 'lucide-react'
import { Button, Input, Select } from '../../components/ui'
import type { ProfitabilityFilters } from '../../api/profitabilityService'

// ── Props ────────────────────────────────────────────────────────────

interface AdvancedFilterBarProps {
  filters: ProfitabilityFilters
  onChange: (filters: ProfitabilityFilters) => void
  onClear: () => void
}

// ── Options ──────────────────────────────────────────────────────────

const DOCUMENT_TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'invoice', label: 'Factura' },
  { value: 'receipt', label: 'Remito' },
  { value: 'quotation', label: 'Cotización' },
  { value: 'credit_note', label: 'Nota de Crédito' },
  { value: 'debit_note', label: 'Nota de Débito' },
]

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'completed', label: 'Completado' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'cancelled', label: 'Cancelado' },
]

// ── Component ────────────────────────────────────────────────────────

export default function AdvancedFilterBar({ filters, onChange, onClear }: AdvancedFilterBarProps) {
  const [isOpen, setIsOpen] = useState(false)

  const hasActiveFilters = Object.entries(filters).some(
    ([key, val]) => key !== 'page' && key !== 'per_page' && key !== 'search' && val !== undefined && val !== ''
  )

  const updateFilter = (key: keyof ProfitabilityFilters, value: string) => {
    onChange({ ...filters, [key]: value || undefined })
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      {/* Toggle header */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <Filter size={15} />
          Filtros avanzados
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-primary-500" />
          )}
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <RotateCcw size={13} />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible content */}
      {isOpen && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                value={filters.search ?? ''}
                onChange={(e) => updateFilter('search', e.target.value)}
                placeholder="Buscar..."
                className="w-full h-9 pl-8 pr-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Seller */}
            <Input
              placeholder="ID de vendedor"
              value={filters.seller_id ?? ''}
              onChange={(e) => updateFilter('seller_id', e.target.value)}
            />

            {/* Client */}
            <Input
              placeholder="ID de cliente"
              value={filters.client_id ?? ''}
              onChange={(e) => updateFilter('client_id', e.target.value)}
            />

            {/* Category */}
            <Input
              placeholder="ID de categoría"
              value={filters.category_id ?? ''}
              onChange={(e) => updateFilter('category_id', e.target.value)}
            />

            {/* Brand */}
            <Input
              placeholder="ID de marca"
              value={filters.brand_id ?? ''}
              onChange={(e) => updateFilter('brand_id', e.target.value)}
            />

            {/* Document type */}
            <Select
              value={filters.document_type ?? ''}
              onChange={(e) => updateFilter('document_type', e.target.value)}
              options={DOCUMENT_TYPE_OPTIONS}
            />

            {/* Status */}
            <Select
              value={filters.status ?? ''}
              onChange={(e) => updateFilter('status', e.target.value)}
              options={STATUS_OPTIONS}
            />

            {/* Branch */}
            <Input
              placeholder="ID de sucursal"
              value={filters.branch_id ?? ''}
              onChange={(e) => updateFilter('branch_id', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
