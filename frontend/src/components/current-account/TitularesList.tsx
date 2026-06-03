/**
 * TitularesList — sidebar list of CC-enabled billing clients.
 * Shows search, pagination (10/page), balance, mode badge, and selection state.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import clientsService, { Client } from '../../api/clientsService'

const ITEMS_PER_PAGE = 10

const MODE_LABELS: Record<string, string> = {
  disabled: 'Deshabilitada',
  limited: 'Con límite',
  unlimited: 'Sin límite',
}

const MODE_COLORS: Record<string, string> = {
  limited:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  unlimited:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  disabled:
    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

export interface TitularesListProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function TitularesList({ selectedId, onSelect }: TitularesListProps) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['clients', 'titulares-list'],
    queryFn: () => clientsService.getAll({ page: 1, per_page: 100 }),
    staleTime: 30_000,
  })

  const allClients: Client[] = data?.items ?? []

  const activeTitulares = useMemo(
    () => allClients.filter((c) => (c.current_account_mode ?? 'disabled') !== 'disabled'),
    [allClients]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeTitulares
    return activeTitulares.filter((c) => c.name.toLowerCase().includes(q))
  }, [activeTitulares, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const slice = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  if (isLoading) {
    return (
      <div className="p-3 text-sm text-gray-500 dark:text-gray-400">
        Cargando titulares...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 text-sm text-red-600 dark:text-red-400">
        Error al cargar clientes
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar titular..."
            className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">
        {slice.length === 0 && (
          <div className="p-4 text-sm text-center text-gray-500 dark:text-gray-400">
            {activeTitulares.length === 0
              ? 'No hay titulares con CC habilitada'
              : 'Sin resultados para la búsqueda'}
          </div>
        )}

        {slice.map((client) => {
          const mode = client.current_account_mode ?? 'disabled'
          const isSelected = selectedId === client.id
          const hasBalance = Number(client.current_balance ?? 0) > 0

          return (
            <button
              key={client.id}
              onClick={() => onSelect(client.id)}
              className={[
                'w-full text-left px-3 py-2.5 transition-colors',
                isSelected
                  ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-500'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-l-2 border-transparent',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-1 mb-1">
                <span
                  className={[
                    'text-sm font-medium leading-tight truncate',
                    isSelected
                      ? 'text-primary-700 dark:text-primary-300'
                      : 'text-gray-900 dark:text-white',
                  ].join(' ')}
                >
                  {client.name}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${MODE_COLORS[mode] ?? MODE_COLORS.disabled}`}
                >
                  {MODE_LABELS[mode] ?? mode}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                {client.credit_limit != null ? (
                  <span>
                    Límite: $
                    {Number(client.credit_limit).toLocaleString('es-AR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                ) : (
                  <span>Sin límite</span>
                )}
                <span
                  className={hasBalance ? 'text-red-600 dark:text-red-400 font-semibold' : ''}
                >
                  $
                  {Number(client.current_balance ?? 0).toLocaleString('es-AR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          <span>
            {(safePage - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} de {filtered.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
