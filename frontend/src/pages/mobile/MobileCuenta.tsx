/**
 * Native mobile "Cuenta corriente" screen (PR6) — read-only. Self-fetching
 * via `clientsService.getAll` directly (same raw useQuery pattern as
 * `MobileDashboard`, no dedicated hook file), reusing the real
 * `GET /clients?has_balance=true&per_page=100` endpoint — no new endpoint
 * invented.
 *
 * Read-only by design: the mockup (design_handoff_mobile/README.md section
 * "Cuenta corriente") does not show a payment flow, and the backend has no
 * generic "pay a client's total current-account balance" endpoint (only a
 * single-invoice payment, out of scope here). Do not add any mutation.
 *
 * Hero computation (per spec): "Total por cobrar" sums ONLY the clients with
 * a positive `current_balance` (debtors); "N clientes con saldo deudor"
 * counts that same positive-balance subset. The list below, however, renders
 * EVERY client the `has_balance=true` filter returns (debtors AND clients
 * with a balance in their favor) — it is not filtered to the hero's subset.
 *
 * `per_page: 100` brings back the full has-balance list in one request (no
 * server-side pagination), same shortcut already used by desktop's
 * `CurrentAccount.tsx` — the search box below filters that in-memory list
 * locally, no debounce/server round-trip needed.
 *
 * `ClientResponse` only exposes `client_type_id` (a UUID), not a human-readable
 * name — same as desktop's `CurrentAccount.tsx`, resolved with a second
 * `clientTypesService.getAll()` query joined locally via a `typeById` Map
 * (no backend change needed, mirrors the existing desktop pattern).
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import clientsService, { type Client } from '../../api/clientsService'
import clientTypesService from '../../api/clientTypesService'
import { formatErrorMessage } from '../../utils/errorHelpers'

// ─── Pure helpers (exported for direct unit testing) ──────────────────────

export type BalanceStatus = 'debe' | 'a_favor' | 'al_dia'

export const BALANCE_STATUS_LABELS: Record<BalanceStatus, string> = {
  debe: 'Debe',
  a_favor: 'A favor',
  al_dia: 'Al día',
}

export const BALANCE_STATUS_COLORS: Record<BalanceStatus, string> = {
  debe: '#c0392b',
  a_favor: '#3d8c47',
  al_dia: '#9089a0',
}

/** current_balance > 0 -> Debe (client owes); < 0 -> A favor (credit); === 0 -> Al día. */
export function resolveBalanceStatus(balance: number): BalanceStatus {
  if (balance > 0) return 'debe'
  if (balance < 0) return 'a_favor'
  return 'al_dia'
}

/** "Total por cobrar" and debtor count consider ONLY clients with a positive balance. */
export function computeReceivableSummary(
  clients: Client[]
): { totalReceivable: number; debtorCount: number } {
  return clients.reduce(
    (acc, c) =>
      c.current_balance > 0
        ? { totalReceivable: acc.totalReceivable + c.current_balance, debtorCount: acc.debtorCount + 1 }
        : acc,
    { totalReceivable: 0, debtorCount: 0 }
  )
}

/** Local, case-insensitive filter over the already-fetched client list. */
export function filterClientsByQuery(clients: Client[], query: string): Client[] {
  const q = query.trim().toLowerCase()
  if (!q) return clients
  return clients.filter((c) => c.name.toLowerCase().includes(q))
}

/** First letter of each of the first two words, e.g. "Constructora Belgrano S.A." -> "CB". */
export function getClientInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// ─── Formatting ─────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ─── Main screen ────────────────────────────────────────────────────────────

export default function MobileCuenta() {
  const [query, setQuery] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mobile-cuenta-clients'],
    queryFn: () => clientsService.getAll({ has_balance: true, per_page: 100 }),
    retry: false,
  })

  const { data: clientTypes } = useQuery({
    queryKey: ['mobile-cuenta-client-types'],
    queryFn: () => clientTypesService.getAll(),
    retry: false,
  })

  const typeById = useMemo(
    () => new Map((clientTypes ?? []).map((t) => [t.id, t])),
    [clientTypes]
  )

  const clients = data?.items ?? []
  const { totalReceivable, debtorCount } = useMemo(() => computeReceivableSummary(clients), [clients])
  const filteredClients = useMemo(() => filterClientsByQuery(clients, query), [clients, query])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center px-7 py-14 text-center">
        <p className="max-w-[260px] text-sm leading-relaxed text-[#7b6b95]">
          No pudimos cargar los saldos de cuenta corriente.
        </p>
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-[#c0392b]">
          {formatErrorMessage(error)}
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-[110px] pt-4">
      {/* Hero: Total por cobrar */}
      <div
        className="relative overflow-hidden rounded-[20px] p-[18px] pb-4 text-white"
        style={{ background: 'linear-gradient(140deg,#2f1d4d,#5c3a8c)', boxShadow: '0 14px 30px rgba(47,29,77,.30)' }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-[.12em]"
          style={{ color: 'rgba(255,255,255,.65)' }}
        >
          Total por cobrar
        </p>
        <p className="font-display mt-1.5 text-[32px] font-extrabold leading-[1.05] tracking-tight">
          {formatCurrency(totalReceivable)}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,.7)' }}>
          {debtorCount} {debtorCount === 1 ? 'cliente con saldo deudor' : 'clientes con saldo deudor'}
        </p>
      </div>

      {/* Búsqueda de cliente */}
      <div className="mt-3 flex h-[46px] items-center gap-2 rounded-[13px] border border-[#ece6f6] bg-white px-3">
        <Search size={18} color="#9089a0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente"
          aria-label="Buscar cliente"
          className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
        />
      </div>

      {/* Lista de clientes */}
      <div className="mt-3 flex flex-col gap-[9px]">
        {filteredClients.length === 0 ? (
          <div className="rounded-[15px] border border-dashed border-[#d9caeb] bg-white p-[24px_18px] text-center text-[#9089a0]">
            <p className="text-[13.5px]">No hay clientes con saldo para mostrar.</p>
          </div>
        ) : (
          filteredClients.map((client) => {
            const status = resolveBalanceStatus(client.current_balance)
            const color = BALANCE_STATUS_COLORS[status]
            return (
              <div
                key={client.id}
                className="flex items-center gap-3 rounded-[15px] border border-[#ece6f6] bg-white p-[13px_14px]"
              >
                <div
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                  style={{ background: '#ece6f6', color: '#7c5ca8' }}
                >
                  <span className="font-display text-[15px] font-extrabold">
                    {getClientInitials(client.name)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#121325]">{client.name}</p>
                  <p className="text-[11.5px] text-[#9089a0]">
                    {(client.client_type_id ? typeById.get(client.client_type_id)?.name : undefined) ??
                      'Sin tipo'}
                  </p>
                </div>
                <div className="flex-none text-right">
                  <p className="font-display text-[15px] font-extrabold" style={{ color }}>
                    {formatCurrency(Math.abs(client.current_balance))}
                  </p>
                  <p className="text-[10.5px] font-semibold" style={{ color }}>
                    {BALANCE_STATUS_LABELS[status]}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
