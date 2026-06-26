/**
 * Página de Rentabilidad y Análisis Financiero.
 * Orquestador — delega el contenido de cada tab a sus sub-componentes.
 */
import { useState } from 'react'
import { Calendar, TrendingUp, Package, Users, FolderTree, Tag, UserCheck, FileText, Bell, Database, Receipt, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../components/ui'
import type { ProfitabilityFilters } from '../api/profitabilityService'
import AdvancedFilterBar from './rentabilidad/AdvancedFilterBar'
import SummaryTab from './rentabilidad/SummaryTab'
import ProductsTab from './rentabilidad/ProductsTab'
import ClientsTab from './rentabilidad/ClientsTab'
import CategoriesTab from './rentabilidad/CategoriesTab'
import BrandsTab from './rentabilidad/BrandsTab'
import SellersTab from './rentabilidad/SellersTab'
import DocumentsTab from './rentabilidad/DocumentsTab'
import AlertsTab from './rentabilidad/AlertsTab'
import StockpilesTab from './rentabilidad/StockpilesTab'
import ExpensesTab from './rentabilidad/ExpensesTab'
import AccountCurrentTab from './rentabilidad/AccountCurrentTab'

// ── Tab definitions ──────────────────────────────────────────────────

interface TabDefinition {
  id: string
  label: string
  icon: LucideIcon
  component: React.ComponentType<{
    dateFrom: string
    dateTo: string
    filters?: ProfitabilityFilters
  }>
}

const TABS: TabDefinition[] = [
  { id: 'summary', label: 'Resumen', icon: TrendingUp, component: SummaryTab },
  { id: 'products', label: 'Productos', icon: Package, component: ProductsTab },
  { id: 'clients', label: 'Clientes', icon: Users, component: ClientsTab },
  { id: 'categories', label: 'Categorías', icon: FolderTree, component: CategoriesTab },
  { id: 'brands', label: 'Marcas', icon: Tag, component: BrandsTab },
  { id: 'sellers', label: 'Vendedores', icon: UserCheck, component: SellersTab },
  { id: 'documents', label: 'Documentos', icon: FileText, component: DocumentsTab },
  { id: 'alerts', label: 'Alertas', icon: Bell, component: AlertsTab },
  { id: 'stockpiles', label: 'Acopios', icon: Database, component: StockpilesTab },
  { id: 'expenses', label: 'Gastos', icon: Receipt, component: ExpensesTab },
  { id: 'account', label: 'Cta. Cte.', icon: CreditCard, component: AccountCurrentTab },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Helpers ──────────────────────────────────────────────────────────

const getToday = () => new Date().toISOString().slice(0, 10)

const getFirstOfMonth = () => {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

// ── Component ────────────────────────────────────────────────────────

export default function Rentabilidad() {
  // ── Date range ─────────────────────────────────────────────────
  const [fromDate, setFromDate] = useState(getFirstOfMonth)
  const [toDate, setToDate] = useState(getToday)

  // ── Active tab ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('summary')

  // ── Advanced filters ───────────────────────────────────────────
  const [filters, setFilters] = useState<ProfitabilityFilters>({})

  const clearFilters = () => setFilters({})

  // ── Resolve active tab component ───────────────────────────────
  const activeTabDef = TABS.find((t) => t.id === activeTab) ?? TABS[0]
  const TabComponent = activeTabDef.component

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      {/* ═══ Header — Glass Card ═══ */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Rentabilidad
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Análisis de márgenes y rendimiento del negocio
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2.5 py-1.5 border border-slate-200 dark:border-slate-700">
              <Calendar size={14} className="text-slate-400 shrink-0" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-7 rounded bg-transparent border-0 px-1 text-xs text-slate-700 dark:text-slate-200 focus:ring-0 [color-scheme:light] dark:[color-scheme:dark]"
                aria-label="Fecha desde"
              />
              <span className="text-xs text-slate-400">—</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-7 rounded bg-transparent border-0 px-1 text-xs text-slate-700 dark:text-slate-200 focus:ring-0 [color-scheme:light] dark:[color-scheme:dark]"
                aria-label="Fecha hasta"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFromDate(getFirstOfMonth())
                setToDate(getToday())
              }}
            >
              Este mes
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ Advanced Filter Bar ═══ */}
      <AdvancedFilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
      />

      {/* ═══ Tabs — Pill Style ═══ */}
      <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1.5 inline-flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm border border-slate-200 dark:border-slate-700'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/40'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ═══ Tab Content ═══ */}
      <TabComponent
        dateFrom={fromDate}
        dateTo={toDate}
        filters={filters}
      />
    </div>
  )
}
