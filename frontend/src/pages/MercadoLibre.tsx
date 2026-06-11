import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ExternalLink,
  Link2,
  Pause,
  Play,
  Plus,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Button, Pagination } from '../components/ui'
import meliService from '../api/meliService'
import type { MeliListing } from '../types/meli'
import PublishWizard from '../components/meli/PublishWizard'
import LinkListingModal from '../components/meli/LinkListingModal'
import toast from 'react-hot-toast'

const STATUS_FILTER = [
  { key: '', label: 'Todos' },
  { key: 'active', label: 'Activos' },
  { key: 'paused', label: 'Pausados' },
  { key: 'closed', label: 'Cerrados' },
] as const

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active:       { label: 'activo',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  paused:       { label: 'pausado',   cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  closed:       { label: 'cerrado',   cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  under_review: { label: 'revisión',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#5c3a8c]/40 disabled:opacity-50',
        checked ? 'bg-[#5c3a8c]' : 'bg-gray-200 dark:bg-gray-600',
      )}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  )
}

function RelativeTime({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-[#9d84bf]">—</span>
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 2) return <span className="text-[#7b6b95] text-xs">hace un momento</span>
  if (m < 60) return <span className="text-[#7b6b95] text-xs">hace {m} min</span>
  const h = Math.floor(m / 60)
  if (h < 24) return <span className="text-[#7b6b95] text-xs">hace {h}h</span>
  return <span className="text-[#7b6b95] text-xs">hace {Math.floor(h / 24)}d</span>
}

const PAGE_SIZE = 20

export default function MercadoLibre() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showPublish, setShowPublish] = useState(false)
  const [showLink, setShowLink] = useState(false)

  const offset = (page - 1) * PAGE_SIZE

  const { data: statusData } = useQuery({
    queryKey: ['meli-status'],
    queryFn: meliService.getStatus,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['meli-listings', statusFilter, offset],
    queryFn: () => meliService.getListings({ status: statusFilter || null, offset, limit: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof meliService.patchListing>[1] }) =>
      meliService.patchListing(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meli-listings'] }),
    onError: () => toast.error('Error al actualizar la publicación'),
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'activate' }) =>
      action === 'pause' ? meliService.pauseListing(id) : meliService.activateListing(id),
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['meli-listings'] })
      toast.success(action === 'pause' ? 'Pausa encolada' : 'Activación encolada')
    },
    onError: () => toast.error('Error al procesar la acción'),
  })

  const handleConnect = async () => {
    try {
      const { url } = await meliService.getAuthorizeUrl()
      window.location.href = url
    } catch {
      toast.error('No se pudo obtener la URL de conexión')
    }
  }

  const listings = data?.items ?? []
  const total = data?.total ?? 0

  const filtered = search.trim()
    ? listings.filter(
        (l) =>
          l.meli_item_id.toLowerCase().includes(search.toLowerCase()),
      )
    : listings

  const isConnected = statusData?.connected

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#fff159] flex items-center justify-center text-[11px] font-black text-[#2d3277] flex-shrink-0">
            ML
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Mercado Libre</h1>
        </div>

        {isConnected && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowLink(true)} className="gap-1.5">
              <Link2 size={14} />
              Vincular existente
            </Button>
            <Button size="sm" onClick={() => setShowPublish(true)} className="gap-1.5">
              <Plus size={14} />
              Nueva publicación
            </Button>
          </div>
        )}
      </div>

      {/* Connection banner */}
      {isConnected ? (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            Conectado como <span className="font-semibold">{statusData?.meli_nickname}</span>
            {statusData?.expires_at && (
              <span className="text-green-600/70 dark:text-green-400/70 text-xs">
                · expira {new Date(statusData.expires_at).toLocaleDateString('es-AR')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              try { await meliService.disconnect(); qc.invalidateQueries({ queryKey: ['meli-status'] }); toast.success('Cuenta desconectada') }
              catch { toast.error('Error al desconectar') }
            }}
            className="text-xs text-[#7b6b95] hover:text-red-500 transition-colors"
          >
            Desconectar
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-[#d9caeb] dark:border-gray-700 shadow-sm">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Cuenta no conectada</p>
            <p className="text-xs text-[#7b6b95]">Conectá tu cuenta de Mercado Libre para publicar y sincronizar productos.</p>
          </div>
          <Button size="sm" onClick={handleConnect} className="gap-1.5 flex-shrink-0">
            <div className="w-4 h-4 rounded bg-[#fff159] flex items-center justify-center text-[8px] font-black text-[#2d3277]">ML</div>
            Conectar cuenta
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          {STATUS_FILTER.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setStatusFilter(f.key); setPage(1) }}
              className={clsx(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                statusFilter === f.key
                  ? 'bg-[#5c3a8c] text-white'
                  : 'border border-[#d9caeb] dark:border-gray-600 text-[#7b6b95] dark:text-gray-400 hover:border-[#9d84bf] bg-white dark:bg-gray-800',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por MLA..."
          className="border border-[#d9caeb] dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-[#9d84bf] focus:outline-none focus:ring-2 focus:ring-[#5c3a8c]/40 w-52"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#d9caeb] dark:border-gray-700 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5c3a8c]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#f5f2fa] dark:bg-gray-700 flex items-center justify-center">
              <div className="w-7 h-7 rounded-lg bg-[#fff159] flex items-center justify-center text-[10px] font-black text-[#2d3277]">ML</div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Sin publicaciones</p>
              <p className="text-xs text-[#7b6b95] mt-0.5">
                {isConnected ? 'Publicá tu primer producto desde el botón "Nueva publicación".' : 'Conectá tu cuenta de ML para empezar.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f2fa] dark:bg-gray-700/50">
                  {['ITEM ML', 'PRECIO ML', 'STOCK', 'SYNC PRECIO', 'SYNC STOCK', 'ESTADO', 'ÚLTIMA SYNC', 'ACCIONES'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7b6b95] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ecf7] dark:divide-gray-700">
                {filtered.map((listing: MeliListing) => {
                  const badge = STATUS_BADGE[listing.status] ?? STATUS_BADGE.closed
                  const isPatching = patchMutation.isPending
                  const isActioning = actionMutation.isPending
                  return (
                    <tr key={listing.id} className="hover:bg-[#fdfcff] dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <a
                          href={listing.meli_permalink ?? `https://articulo.mercadolibre.com.ar/${listing.meli_item_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[#5c3a8c] dark:text-[#9d84bf] hover:underline text-xs flex items-center gap-1"
                        >
                          {listing.meli_item_id}
                          <ExternalLink size={11} />
                        </a>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {listing.price_markup_pct && parseFloat(listing.price_markup_pct) !== 0 && (
                          <span className="inline-flex mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                            +{listing.price_markup_pct}%
                          </span>
                        )}
                        <span className="text-[#9d84bf] text-xs">precio local</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">—</td>
                      <td className="px-4 py-3">
                        <Toggle
                          checked={listing.sync_price}
                          disabled={isPatching}
                          onChange={(v) => patchMutation.mutate({ id: listing.id, body: { sync_price: v } })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Toggle
                          checked={listing.sync_stock}
                          disabled={isPatching}
                          onChange={(v) => patchMutation.mutate({ id: listing.id, body: { sync_stock: v } })}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', badge.cls)}>
                            {badge.label}
                          </span>
                          {listing.last_sync_error && (
                            <span title={listing.last_sync_error}>
                              <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <RelativeTime iso={listing.last_synced_at} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {listing.status === 'active' ? (
                            <button
                              type="button"
                              disabled={isActioning}
                              onClick={() => actionMutation.mutate({ id: listing.id, action: 'pause' })}
                              title="Pausar"
                              className="p-1.5 rounded-lg text-[#7b6b95] hover:bg-[#f5f2fa] hover:text-[#5c3a8c] dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              <Pause size={14} />
                            </button>
                          ) : listing.status === 'paused' ? (
                            <button
                              type="button"
                              disabled={isActioning}
                              onClick={() => actionMutation.mutate({ id: listing.id, action: 'activate' })}
                              title="Activar"
                              className="p-1.5 rounded-lg text-[#7b6b95] hover:bg-[#f5f2fa] hover:text-[#5c3a8c] dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              <Play size={14} />
                            </button>
                          ) : null}
                          {listing.last_sync_error && (
                            <button
                              type="button"
                              title="Reintentar sync"
                              onClick={() => patchMutation.mutate({ id: listing.id, body: { sync_stock: listing.sync_stock } })}
                              className="p-1.5 rounded-lg text-[#7b6b95] hover:bg-[#f5f2fa] hover:text-[#5c3a8c] dark:hover:bg-gray-700 transition-colors"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#d9caeb] dark:border-gray-700">
            <span className="text-xs text-[#7b6b95]">
              Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total} publicaciones
            </span>
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(total / PAGE_SIZE)}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      <PublishWizard
        isOpen={showPublish}
        onClose={() => setShowPublish(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['meli-listings'] })}
      />

      <LinkListingModal
        isOpen={showLink}
        onClose={() => setShowLink(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['meli-listings'] })}
      />
    </div>
  )
}
