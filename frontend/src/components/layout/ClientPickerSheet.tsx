/**
 * Bottom sheet for searching/selecting a client on the "Nueva venta" screen.
 * Reuses the same search-input visual pattern as MobileProducts. Fetches via
 * `clientsService.search(query)` (dedicated, server-side-filtered, capped at
 * 10 results) — debounced, since the design decision explicitly calls this
 * out (unlike Productos' search, which PR3 documented as intentionally not
 * debounced).
 */
import { useEffect, useState } from 'react'
import { Search, User, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import clientsService, { type Client } from '../../api/clientsService'
import { formatErrorMessage } from '../../utils/errorHelpers'

interface ClientPickerSheetProps {
  open: boolean
  onClose: () => void
  onSelect: (client: Client | null) => void
}

const DEBOUNCE_MS = 300

export default function ClientPickerSheet({ open, onClose, onSelect }: ClientPickerSheetProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
    }
  }, [open])

  const hasQuery = debouncedQuery.trim().length > 0

  const { data: results, isLoading, isError, error } = useQuery({
    queryKey: ['mobile-client-search', debouncedQuery],
    queryFn: () => clientsService.search(debouncedQuery),
    enabled: open && hasQuery,
    retry: false,
  })

  if (!open) return null

  const handleSelect = (client: Client | null) => {
    onSelect(client)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-label="Buscar cliente"
      className="fixed inset-x-0 bottom-0 z-[400] flex max-h-[78%] flex-col overflow-hidden rounded-t-[26px] bg-white"
    >
      <div className="flex items-center gap-[10px] px-[18px] pb-3 pt-4" style={{ background: '#f7f4fb' }}>
        <p className="flex-1 text-base font-extrabold text-[#121325]">Buscar cliente</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar buscador de cliente"
          className="flex h-8 w-8 items-center justify-center rounded-[9px]"
          style={{ background: '#ece6f6' }}
        >
          <X size={16} color="#5b5570" />
        </button>
      </div>

      <div className="px-[18px] py-3">
        <div className="flex h-[46px] items-center gap-2 rounded-[13px] border border-[#ece6f6] bg-white px-3">
          <Search size={18} color="#9089a0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o documento"
            className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pb-6">
        {/* "Sin cliente" clears back to the empty/prompt state — explicitly
            NOT labeled "Consumidor final", which a real user flagged as
            misleading (looks like a real default customer, but isn't one).
            Only shown when there's no active search — once the user is
            searching, real results (which may include an actual Client
            record literally named "Consumidor Final" in this tenant's data)
            are shown instead, to avoid a confusing visual duplicate. */}
        {!hasQuery && (
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className="flex w-full items-center gap-[11px] rounded-[13px] p-3 text-left"
            style={{ background: '#f7f4fb' }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: '#ece6f6' }}>
              <User size={17} color="#7c5ca8" />
            </div>
            <span className="text-sm font-bold text-[#121325]">Sin cliente</span>
          </button>
        )}

        {isLoading && hasQuery && (
          <div role="status" aria-label="Buscando clientes" className="flex justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary-600" />
          </div>
        )}

        {isError && (
          <p role="alert" className="mt-2 px-1 text-[10.5px] font-semibold text-[#c0392b]">
            {formatErrorMessage(error)}
          </p>
        )}

        {!isLoading && !isError && hasQuery && (results ?? []).length === 0 && (
          <p className="mt-2 px-1 text-[10.5px] text-[#9089a0]">No encontramos clientes para esa búsqueda.</p>
        )}

        <div className="mt-2 flex flex-col gap-[7px]">
          {(results ?? []).map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client)}
              className="flex w-full items-center gap-[11px] rounded-[13px] border border-[#ece6f6] p-3 text-left"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: '#ece6f6' }}>
                <User size={17} color="#7c5ca8" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#121325]">{client.name}</p>
                <p className="text-[11px] text-[#9089a0]">{client.document_number}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
