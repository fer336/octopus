/**
 * ProductSearchModal — Modal de búsqueda rápida de productos (F8).
 *
 * Cinco modos de búsqueda:
 *   📝 Descripción → busca por description en backend
 *   🔢 Código     → busca por code en backend
 *   📦 Cod. Prov. → busca por supplier_code en backend
 *   📁 Categoría  → muestra categorías, al elegir una muestra sus productos
 *   🏭 Proveedor  → muestra proveedores, al elegir uno muestra sus productos
 *
 * Filtros combinables: categoría y proveedor como dropdowns adicionales.
 * F8 cicla entre modos. Enter = staging. ESC con items staged = confirmar y cerrar.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Search,
  X,
  Hash,
  Package,
  Building2,
  FolderOpen,
  FileText,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import productsService from '../../api/productsService'
import categoriesService from '../../api/categoriesService'
import suppliersService from '../../api/suppliersService'
import { useDebounce } from '../../hooks/useDebounce'

// ── Types ──────────────────────────────────────────────────

type SearchMode = 'description' | 'code' | 'supplier_code' | 'category' | 'supplier'

interface ProductItem {
  id: string
  code: string
  supplier_code?: string
  description: string
  sale_price: number
  net_price: number
  current_stock?: number
  photo_url?: string
}

interface CategoryItem {
  id: string
  name: string
}

interface SupplierItem {
  id: string
  name: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onAddProducts: (products: ProductItem[]) => void
}

// ── Helpers ────────────────────────────────────────────────

const safeNumber = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const formatPrice = (v: number): string =>
  v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Modes config ───────────────────────────────────────────

const MODES: Array<{ value: SearchMode; label: string; icon: typeof Search }> = [
  { value: 'description', label: 'Descripción', icon: FileText },
  { value: 'code', label: 'Código', icon: Hash },
  { value: 'supplier_code', label: 'Cod. Prov.', icon: Package },
  { value: 'category', label: 'Categoría', icon: FolderOpen },
  { value: 'supplier', label: 'Proveedor', icon: Building2 },
]

const MODE_PLACEHOLDER: Record<SearchMode, string> = {
  description: 'Buscar por nombre del producto...',
  code: 'Buscar por código interno...',
  supplier_code: 'Buscar por código de proveedor/fábrica...',
  category: 'Filtrar categorías...',
  supplier: 'Filtrar proveedores...',
}

// ── Component ──────────────────────────────────────────────

export default function ProductSearchModal({ isOpen, onClose, onAddProducts }: Props) {
  const [mode, setMode] = useState<SearchMode>('description')
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [staged, setStaged] = useState<ProductItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const debouncedSearch = useDebounce(search, 300)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('description')
      setSearch('')
      setSelectedCategoryId(null)
      setSelectedSupplierId(null)
      setSelectedIndex(0)
      setStaged([])
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // F8 cycles through modes while modal is open
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F8') return
      e.preventDefault()
      setMode((prev) => {
        const idx = MODES.findIndex((m) => m.value === prev)
        const next = MODES[(idx + 1) % MODES.length]
        setSearch('')
        setSelectedIndex(0)
        setSelectedCategoryId(null)
        setSelectedSupplierId(null)
        return next.value
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen])

  // Focus input when mode changes
  useEffect(() => {
    if (isOpen && mode !== 'category' && mode !== 'supplier') {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [mode, isOpen])

  // ── Queries ──────────────────────────────────────────────

  // Categories for the filter dropdown and category mode
  const categoriesQuery = useQuery({
    queryKey: ['categories-for-search-modal'],
    queryFn: () => categoriesService.getAll(),
    enabled: isOpen,
    staleTime: 60_000,
  })
  const allCategories: CategoryItem[] = useMemo(
    () => (Array.isArray(categoriesQuery.data) ? categoriesQuery.data : []),
    [categoriesQuery.data],
  )

  // Suppliers for the filter dropdown and supplier mode
  const suppliersQuery = useQuery({
    queryKey: ['suppliers-for-search-modal'],
    queryFn: () => suppliersService.getAll({ per_page: 100 }),
    enabled: isOpen,
    staleTime: 60_000,
  })
  const allSuppliers: SupplierItem[] = useMemo(
    () => (Array.isArray(suppliersQuery.data?.items) ? suppliersQuery.data.items : []),
    [suppliersQuery.data],
  )

  // Products search
  const shouldFetchProducts = useMemo(() => {
    if (!isOpen) return false
    if (mode === 'category' && !selectedCategoryId && !debouncedSearch) return false
    if (mode === 'supplier' && !selectedSupplierId && !debouncedSearch) return false
    return debouncedSearch.length >= 2 || selectedCategoryId !== null || selectedSupplierId !== null
  }, [isOpen, mode, selectedCategoryId, selectedSupplierId, debouncedSearch])

  const productsQuery = useQuery({
    queryKey: ['product-search-results', mode, debouncedSearch, selectedCategoryId, selectedSupplierId],
    queryFn: () => {
      const params: Record<string, unknown> = { per_page: 50, is_active: true, page: 1 }
      if (selectedCategoryId) params.category_id = selectedCategoryId
      if (selectedSupplierId) params.supplier_id = selectedSupplierId

      if (debouncedSearch) {
        params.search = debouncedSearch
        if (mode === 'code') {
          params.search_field = 'code'
        } else if (mode === 'supplier_code') {
          params.search_field = 'supplier_code'
        } else {
          params.search_field = 'description'
        }
      }

      return productsService.getAll(params as any)
    },
    enabled: shouldFetchProducts,
    staleTime: 10_000,
  })

  const products: ProductItem[] = useMemo(
    () => (Array.isArray(productsQuery.data?.items) ? productsQuery.data.items : []),
    [productsQuery.data],
  )
  const totalResults = productsQuery.data?.total ?? 0

  // ── Filtered lists for category/supplier modes ───────────

  const filteredCategories = useMemo(() => {
    if (!search) return allCategories
    const q = search.toLowerCase()
    return allCategories.filter((c) => c.name.toLowerCase().includes(q))
  }, [allCategories, search])

  const filteredSuppliers = useMemo(() => {
    if (!search) return allSuppliers
    const q = search.toLowerCase()
    return allSuppliers.filter((s) => s.name.toLowerCase().includes(q))
  }, [allSuppliers, search])

  // Reset selectedIndex when results change
  useEffect(() => { setSelectedIndex(0) }, [products.length, filteredCategories.length, filteredSuppliers.length, mode])

  // Scroll selected row into view
  useEffect(() => {
    if (!listRef.current) return
    const row = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // ── Staging helpers ──────────────────────────────────────

  const toggleStaging = useCallback((p: ProductItem) => {
    setStaged((prev) =>
      prev.some((s) => s.id === p.id)
        ? prev.filter((s) => s.id !== p.id)
        : [...prev, p],
    )
  }, [])

  const confirmStaged = useCallback(() => {
    onAddProducts(staged)
    onClose()
  }, [staged, onAddProducts, onClose])

  // ── Keyboard navigation ──────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // F8 is handled by the window listener above — skip here to avoid double-fire
      if (e.key === 'F8') return

      const isCategoryList = mode === 'category' && !selectedCategoryId
      const isSupplierList = mode === 'supplier' && !selectedSupplierId
      const listLength = isCategoryList ? filteredCategories.length
        : isSupplierList ? filteredSuppliers.length
        : products.length

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, listLength - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (isCategoryList && filteredCategories[selectedIndex]) {
          setSelectedCategoryId(filteredCategories[selectedIndex].id)
          setSearch('')
          setSelectedIndex(0)
        } else if (isSupplierList && filteredSuppliers[selectedIndex]) {
          setSelectedSupplierId(filteredSuppliers[selectedIndex].id)
          setSearch('')
          setSelectedIndex(0)
        } else if (products[selectedIndex]) {
          toggleStaging(products[selectedIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (staged.length > 0) {
          confirmStaged()
        } else if (mode === 'category' && selectedCategoryId) {
          setSelectedCategoryId(null)
          setSearch('')
        } else if (mode === 'supplier' && selectedSupplierId) {
          setSelectedSupplierId(null)
          setSearch('')
        } else {
          onClose()
        }
      }
    },
    [mode, selectedCategoryId, selectedSupplierId, filteredCategories, filteredSuppliers, products, selectedIndex, staged, toggleStaging, confirmStaged, onClose],
  )

  // ── Render helpers ───────────────────────────────────────

  const renderModeTabs = () => (
    <div className="flex flex-wrap gap-1">
      {MODES.map((m) => {
        const isActive = mode === m.value
        return (
          <button
            key={m.value}
            onClick={() => { setMode(m.value); setSearch(''); setSelectedIndex(0); setSelectedCategoryId(null); setSelectedSupplierId(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isActive
                ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <m.icon size={14} />
            {m.label}
          </button>
        )
      })}
    </div>
  )

  const renderSearchInput = (placeholder?: string) => (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0) }}
        placeholder={placeholder ?? MODE_PLACEHOLDER[mode]}
        className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-primary-400 dark:focus:ring-primary-500 focus:border-transparent text-gray-800 dark:text-gray-200 placeholder-gray-400"
      />
    </div>
  )

  const renderFilterDropdowns = () => (
    <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
      <span className="font-medium">Filtros:</span>

      {/* Category filter */}
      <select
        value={selectedCategoryId ?? ''}
        onChange={(e) => { setSelectedCategoryId(e.target.value || null); setSelectedIndex(0) }}
        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
      >
        <option value="">Todas las categorías</option>
        {allCategories.map((cat) => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>

      {/* Supplier filter */}
      <select
        value={selectedSupplierId ?? ''}
        onChange={(e) => { setSelectedSupplierId(e.target.value || null); setSelectedIndex(0) }}
        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
      >
        <option value="">Todos los proveedores</option>
        {allSuppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {(selectedCategoryId || selectedSupplierId) && (
        <button
          onClick={() => { setSelectedCategoryId(null); setSelectedSupplierId(null) }}
          className="text-red-500 hover:text-red-700 dark:hover:text-red-400 underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )

  const renderResults = () => {
    const isLoading = productsQuery.isFetching && shouldFetchProducts
    const isEmpty = !isLoading && products.length === 0 && shouldFetchProducts

    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Count */}
        {shouldFetchProducts && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            {isLoading ? 'Buscando...' : `${totalResults} resultado${totalResults !== 1 ? 's' : ''}`}
          </div>
        )}

        {/* Table */}
        <div ref={listRef} className="flex-1 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          {isEmpty ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Sin resultados
            </div>
          ) : (
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-20" />
                <col className="w-20 hidden md:table-column" />
                <col />
                <col className="w-16" />
                <col className="w-24" />
              </colgroup>
              <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 dark:text-gray-400 text-xs">Código</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 dark:text-gray-400 text-xs hidden md:table-cell">Cod. Prov.</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 dark:text-gray-400 text-xs">Descripción</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-600 dark:text-gray-400 text-xs">Stock</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-600 dark:text-gray-400 text-xs">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {products.map((p, i) => {
                  const isStaged = staged.some((s) => s.id === p.id)
                  const isHighlighted = i === selectedIndex
                  return (
                    <tr
                      key={p.id}
                      data-index={i}
                      onClick={() => toggleStaging(p)}
                      className={`cursor-pointer text-xs transition-colors ${
                        isStaged
                          ? 'bg-green-50 dark:bg-green-900/30'
                          : isHighlighted
                          ? 'bg-primary-100 dark:bg-primary-900'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <td className="px-2 py-2 font-medium truncate">
                        {isStaged && (
                          <span className="text-green-600 dark:text-green-400 mr-1 font-bold">✓</span>
                        )}
                        {p.code}
                      </td>
                      <td className="px-2 py-2 text-gray-500 dark:text-gray-400 truncate hidden md:table-cell">{p.supplier_code || '—'}</td>
                      <td className="px-2 py-2 truncate" title={p.description}>{p.description}</td>
                      <td className="px-2 py-2 text-right">{p.current_stock ?? '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold">${formatPrice(safeNumber(p.sale_price))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer help */}
        {!isEmpty && (
          <div className="text-xs text-gray-400 mt-1.5 text-center">
            {staged.length > 0
              ? `${staged.length} seleccionado${staged.length !== 1 ? 's' : ''} · ESC: Agregar y cerrar · Enter: Seleccionar/Deseleccionar`
              : '↑↓ Navegar · Enter: Seleccionar · ESC: Cerrar · F8: Siguiente modo'}
          </div>
        )}
      </div>
    )
  }

  const renderCategoryMode = () => {
    const isLoading = categoriesQuery.isFetching

    if (selectedCategoryId) {
      // Category selected: show products
      const catName = allCategories.find((c) => c.id === selectedCategoryId)?.name ?? 'Categoría'
      return (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedCategoryId(null); setSearch(''); setSelectedIndex(0) }}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              ← Volver a categorías
            </button>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{catName}</span>
          </div>
          {renderSearchInput('Buscar dentro de esta categoría...')}
          {renderResults()}
        </div>
      )
    }

    // Category list
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        {renderSearchInput('Filtrar categorías...')}

        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">Cargando categorías...</div>
        ) : filteredCategories.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">Sin categorías</div>
        ) : (
          <div ref={listRef} className="flex-1 overflow-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredCategories.map((cat, i) => (
                <button
                  key={cat.id}
                  data-index={i}
                  onClick={() => { setSelectedCategoryId(cat.id); setSearch(''); setSelectedIndex(0) }}
                  className={`text-left px-3 py-3 rounded-lg border text-sm transition-colors ${
                    i === selectedIndex
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <FolderOpen size={16} className="inline mr-1.5 text-gray-400" />
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderSupplierMode = () => {
    const isLoading = suppliersQuery.isFetching

    if (selectedSupplierId) {
      const suppName = allSuppliers.find((s) => s.id === selectedSupplierId)?.name ?? 'Proveedor'
      return (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedSupplierId(null); setSearch(''); setSelectedIndex(0) }}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              ← Volver a proveedores
            </button>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{suppName}</span>
          </div>
          {renderSearchInput('Buscar dentro de este proveedor...')}
          {renderResults()}
        </div>
      )
    }

    return (
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        {renderSearchInput('Filtrar proveedores...')}

        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">Cargando proveedores...</div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">Sin proveedores</div>
        ) : (
          <div ref={listRef} className="flex-1 overflow-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredSuppliers.map((s, i) => (
                <button
                  key={s.id}
                  data-index={i}
                  onClick={() => { setSelectedSupplierId(s.id); setSearch(''); setSelectedIndex(0) }}
                  className={`text-left px-3 py-3 rounded-lg border text-sm transition-colors ${
                    i === selectedIndex
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Building2 size={16} className="inline mr-1.5 text-gray-400" />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────

  if (!isOpen) return null

  const isCategoryOrSupplier = mode === 'category' || mode === 'supplier'
  const showBody = !isCategoryOrSupplier || (mode === 'category' && selectedCategoryId) || (mode === 'supplier' && selectedSupplierId)

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[8vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Buscar producto</h2>
            {!showBody && productsQuery.data?.total !== undefined && (
              <span className="text-xs text-gray-400">
                {productsQuery.data.total} producto{productsQuery.data.total !== 1 ? 's' : ''}
              </span>
            )}
            {staged.length > 0 && (
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full">
                {staged.length} seleccionado{staged.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col p-4 gap-3 min-h-0 overflow-hidden">
          {/* Mode tabs */}
          {renderModeTabs()}

          {/* Category mode */}
          {mode === 'category' && renderCategoryMode()}

          {/* Supplier mode */}
          {mode === 'supplier' && renderSupplierMode()}

          {/* Text/code modes */}
          {!isCategoryOrSupplier && (
            <>
              {renderSearchInput()}
              {renderFilterDropdowns()}
              {renderResults()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-xs text-gray-400 flex justify-between">
          <span>F8: Ciclar modo · Enter: Seleccionar · ESC: {staged.length > 0 ? 'Agregar y cerrar' : 'Cerrar'}</span>
          {staged.length > 0 && (
            <button
              onClick={confirmStaged}
              className="text-green-600 dark:text-green-400 font-semibold hover:underline"
            >
              Agregar {staged.length} producto{staged.length !== 1 ? 's' : ''} →
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
