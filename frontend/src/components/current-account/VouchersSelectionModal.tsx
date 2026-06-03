import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { Modal, Button } from '../ui'
import type { Voucher, VoucherItem } from '../../api/vouchersService'
import priceListsService from '../../api/priceListsService'
import type { PriceListDetail } from '../../api/priceListsService'

export interface VoucherItemOverride {
  quantity: number
  unit_price: number
  discount_percent: number
}

export interface AppliedPriceList {
  list_id: string
  list_name: string
  item_prices: Record<string, number> // product_code → unit_price
}

export interface VouchersSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  selectedReceipts: Voucher[]
  closureNotes: string
  onNotesChange: (notes: string) => void
  specialListItems: string[]
  onSpecialListChange: (items: string[]) => void
  initialAppliedLists?: Map<string, AppliedPriceList>
  onConfirm: (overrides: Map<string, VoucherItemOverride>, appliedLists: Map<string, AppliedPriceList>) => void
}

const GRID = '3rem 1fr 5.5rem 4rem 7rem 5rem 7rem'

const EditableNumber = ({
  value,
  onChange,
  min = 0,
  max,
}: {
  value: number
  onChange: (v: string) => void
  min?: number
  max?: number
}) => (
  <input
    type="number"
    min={min}
    max={max}
    step="any"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="w-full text-right bg-transparent border-b border-transparent hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:bg-primary-50 dark:focus:bg-primary-900/20 font-mono text-xs transition-colors rounded-sm px-1 py-0.5"
  />
)

export default function VouchersSelectionModal({
  isOpen,
  onClose,
  selectedReceipts,
  closureNotes,
  onNotesChange,
  specialListItems,
  onSpecialListChange,
  initialAppliedLists,
  onConfirm,
}: VouchersSelectionModalProps) {
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [overrides, setOverrides] = useState<Map<string, Partial<VoucherItemOverride>>>(new Map())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [newItem, setNewItem] = useState('')

  // Price list import state
  const [appliedLists, setAppliedLists] = useState<Map<string, AppliedPriceList>>(new Map())
  const [importTarget, setImportTarget] = useState<string | null>(null)
  const [selectedListId, setSelectedListId] = useState('')

  useEffect(() => {
    if (isOpen) {
      setOrderedIds(selectedReceipts.map((v) => v.id))
      setOverrides(new Map())
      setExpandedIds(new Set(selectedReceipts.map((v) => v.id)))
      setNewItem('')
      setAppliedLists(initialAppliedLists ? new Map(initialAppliedLists) : new Map())
      setImportTarget(null)
      setSelectedListId('')
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const voucherById = new Map(selectedReceipts.map((v) => [v.id, v]))
  const orderedVouchers = orderedIds.map((id) => voucherById.get(id)).filter(Boolean) as Voucher[]

  // Fetch available lists only when import panel is open
  const { data: availableLists = [] } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => priceListsService.getAll(),
    enabled: importTarget !== null,
    staleTime: 60_000,
  })

  // Fetch detail of selected list for preview
  const { data: selectedListDetail } = useQuery({
    queryKey: ['price-lists', selectedListId],
    queryFn: () => priceListsService.getById(selectedListId),
    enabled: !!selectedListId,
    staleTime: 60_000,
  })

  const getVal = (item: VoucherItem, voucherId: string, field: keyof VoucherItemOverride): number => {
    const o = overrides.get(item.id)
    if (o && o[field] !== undefined) return o[field]!
    if (field === 'unit_price') {
      const applied = appliedLists.get(voucherId)
      if (applied && item.code && applied.item_prices[item.code] !== undefined) {
        return applied.item_prices[item.code]
      }
      return Number(item.unit_price)
    }
    if (field === 'quantity') return item.quantity
    return Number(item.discount_percent ?? 0)
  }

  const itemSubtotal = (item: VoucherItem, voucherId: string) => {
    const qty = getVal(item, voucherId, 'quantity')
    const price = getVal(item, voucherId, 'unit_price')
    const disc = getVal(item, voucherId, 'discount_percent')
    return qty * price * (1 - disc / 100)
  }

  const voucherTotal = (v: Voucher) => {
    const items = v.items ?? []
    if (items.length === 0) return Number(v.total ?? 0)
    return items.reduce((acc, item) => acc + itemSubtotal(item, v.id), 0)
  }

  const grandTotal = orderedVouchers.reduce((acc, v) => acc + voucherTotal(v), 0)

  const moveVoucher = (idx: number, dir: -1 | 1) => {
    const next = [...orderedIds]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setOrderedIds(next)
  }

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const updateOverride = (itemId: string, field: keyof VoucherItemOverride, raw: string) => {
    const val = parseFloat(raw)
    if (isNaN(val) || val < 0) return
    setOverrides((prev) => {
      const next = new Map(prev)
      next.set(itemId, { ...(next.get(itemId) ?? {}), [field]: val })
      return next
    })
  }

  const applyList = (voucherId: string, list: PriceListDetail) => {
    const prices: Record<string, number> = {}
    list.items.forEach((item) => {
      prices[item.product_code] = Number(item.unit_price)
    })
    setAppliedLists((prev) => {
      const next = new Map(prev)
      next.set(voucherId, { list_id: list.id, list_name: list.name, item_prices: prices })
      return next
    })
    setImportTarget(null)
    setSelectedListId('')
  }

  const revertList = (voucherId: string) => {
    setAppliedLists((prev) => {
      const next = new Map(prev)
      next.delete(voucherId)
      return next
    })
  }

  // Compute match count for import preview
  const matchCount = (() => {
    if (!importTarget || !selectedListDetail) return null
    const voucher = voucherById.get(importTarget)
    if (!voucher) return null
    const listCodes = new Set(selectedListDetail.items.map((i) => i.product_code))
    const voucherCodes = (voucher.items ?? []).map((i) => i.code).filter(Boolean)
    const matched = voucherCodes.filter((c) => listCodes.has(c!)).length
    return { matched, total: voucherCodes.length }
  })()

  const handleConfirm = () => {
    const result = new Map<string, VoucherItemOverride>()
    overrides.forEach((partial, itemId) => {
      for (const v of selectedReceipts) {
        const item = (v.items ?? []).find((i) => i.id === itemId)
        if (item) {
          result.set(itemId, {
            quantity: partial.quantity ?? item.quantity,
            unit_price: partial.unit_price ?? Number(item.unit_price),
            discount_percent: partial.discount_percent ?? Number(item.discount_percent ?? 0),
          })
          break
        }
      }
    })
    onConfirm(result, new Map(appliedLists))
  }

  const addSpecialItem = () => {
    const trimmed = newItem.trim()
    if (!trimmed) return
    onSpecialListChange([...specialListItems, trimmed])
    setNewItem('')
  }

  const removeSpecialItem = (idx: number) =>
    onSpecialListChange(specialListItems.filter((_, i) => i !== idx))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Workspace de selección" size="xl">
      <div className="flex flex-col gap-4">
        {/* Summary bar */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-500 dark:text-primary-400">
              Remitos seleccionados
            </p>
            <p className="text-2xl font-bold text-primary-900 dark:text-primary-100 tabular-nums">
              {orderedVouchers.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-500 dark:text-primary-400">
              Total
            </p>
            <p className="text-2xl font-bold font-mono text-primary-900 dark:text-primary-100 tabular-nums">
              ${grandTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Notes */}
        <input
          type="text"
          value={closureNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Descripción del cierre (opcional)..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
        />

        {/* Workspace table */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {/* Column headers */}
          <div
            className="grid bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
            style={{ gridTemplateColumns: GRID }}
          >
            <div />
            <div>Descripción</div>
            <div className="text-right pr-1">Cant.</div>
            <div className="text-center">Unid.</div>
            <div className="text-right pr-1">P. Unit.</div>
            <div className="text-right pr-1">Desc. %</div>
            <div className="text-right">Subtotal</div>
          </div>

          {/* Rows */}
          <div className="max-h-80 overflow-y-auto">
            {orderedVouchers.length === 0 ? (
              <p className="px-4 py-8 text-sm text-center text-gray-400 dark:text-gray-500 italic">
                No hay remitos seleccionados.
              </p>
            ) : (
              orderedVouchers.map((v, idx) => {
                const total = voucherTotal(v)
                const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0
                const isExpanded = expandedIds.has(v.id)
                const items = v.items ?? []
                const appliedList = appliedLists.get(v.id)
                const isImporting = importTarget === v.id
                const voucherLabel = `${v.sale_point}-${v.number}`

                return (
                  <div
                    key={v.id}
                    className="border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                  >
                    {/* Voucher header */}
                    <div className="flex items-center gap-2 px-2 py-2 bg-gray-50/60 dark:bg-gray-800/60 hover:bg-gray-100/80 dark:hover:bg-gray-700/40 transition-colors flex-wrap">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-px shrink-0 w-10">
                        <button
                          onClick={() => moveVoucher(idx, -1)}
                          disabled={idx === 0}
                          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed transition-colors"
                          aria-label="Mover arriba"
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          onClick={() => moveVoucher(idx, 1)}
                          disabled={idx === orderedVouchers.length - 1}
                          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed transition-colors"
                          aria-label="Mover abajo"
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>

                      {/* Expand + voucher number */}
                      <button
                        onClick={() => toggleExpand(v.id)}
                        className="flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown size={13} className="text-primary-500" />
                        ) : (
                          <ChevronRight size={13} className="text-gray-400" />
                        )}
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {voucherLabel}
                        </span>
                      </button>

                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        {new Date(`${v.date}T00:00:00`).toLocaleDateString('es-AR')}
                      </span>

                      {/* Applied list badge */}
                      {appliedList && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-[10px] font-semibold">
                            Con lista &quot;{appliedList.list_name}&quot;
                          </span>
                          <button
                            onClick={() => revertList(v.id)}
                            className="text-[10px] text-primary-500 hover:text-primary-700 dark:hover:text-primary-300 underline cursor-pointer"
                          >
                            Revertir
                          </button>
                        </div>
                      )}

                      {/* Import list button */}
                      <button
                        onClick={() => {
                          setImportTarget(isImporting ? null : v.id)
                          setSelectedListId('')
                        }}
                        className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                      >
                        {isImporting ? 'Cancelar' : 'Importar lista'}
                      </button>

                      {/* Right side: progress + % + total */}
                      <div className="flex-1 flex items-center gap-3 justify-end overflow-hidden">
                        <div className="hidden sm:block flex-1 max-w-28 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary-500 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-primary-600 dark:text-primary-400 tabular-nums shrink-0">
                          {pct.toFixed(1)}%
                        </span>
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white tabular-nums shrink-0">
                          ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Import sub-panel */}
                    {isImporting && (
                      <div className="mx-2 mb-2 mt-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                            Importar lista para {voucherLabel}
                          </p>
                          <button
                            onClick={() => {
                              setImportTarget(null)
                              setSelectedListId('')
                            }}
                            className="text-blue-400 hover:text-blue-600 cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        </div>

                        {availableLists.length === 0 ? (
                          <p className="text-xs text-blue-500 dark:text-blue-400 italic">
                            No hay listas de precios guardadas.
                          </p>
                        ) : (
                          <>
                            <select
                              value={selectedListId}
                              onChange={(e) => setSelectedListId(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">Seleccionar lista...</option>
                              {availableLists.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name} ({l.item_count} ítems)
                                </option>
                              ))}
                            </select>

                            {selectedListId && (
                              <p className="text-xs text-blue-600 dark:text-blue-400">
                                {matchCount !== null
                                  ? `${matchCount.matched} de ${matchCount.total} códigos coinciden`
                                  : 'Calculando coincidencias...'}
                              </p>
                            )}

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={!selectedListId || !selectedListDetail}
                                onClick={() => {
                                  if (selectedListDetail) applyList(v.id, selectedListDetail)
                                }}
                              >
                                Aplicar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setImportTarget(null)
                                  setSelectedListId('')
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Item rows */}
                    {isExpanded && items.length === 0 && (
                      <p className="pl-14 pr-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                        Sin ítems detallados.
                      </p>
                    )}

                    {isExpanded &&
                      items.map((item, iIdx) => {
                        const sub = itemSubtotal(item, v.id)
                        return (
                          <div
                            key={item.id}
                            className={`grid items-center gap-0 px-2 py-1 transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-900/10 text-xs ${
                              iIdx % 2 === 0
                                ? 'bg-white dark:bg-gray-900/20'
                                : 'bg-gray-50/40 dark:bg-gray-800/20'
                            }`}
                            style={{ gridTemplateColumns: GRID }}
                          >
                            {/* Spacer aligning with reorder buttons */}
                            <div />

                            {/* Code + description */}
                            <div className="flex items-center gap-1.5 min-w-0 pr-2">
                              <span className="font-mono text-[10px] text-gray-400 shrink-0">
                                {item.code}
                              </span>
                              <span className="truncate text-gray-700 dark:text-gray-300">
                                {item.description}
                              </span>
                            </div>

                            {/* Quantity */}
                            <EditableNumber
                              value={getVal(item, v.id, 'quantity')}
                              onChange={(val) => updateOverride(item.id, 'quantity', val)}
                            />

                            {/* Unit */}
                            <div className="text-center text-gray-400 dark:text-gray-500 truncate px-1">
                              {item.unit || '—'}
                            </div>

                            {/* Unit price */}
                            <EditableNumber
                              value={getVal(item, v.id, 'unit_price')}
                              onChange={(val) => updateOverride(item.id, 'unit_price', val)}
                            />

                            {/* Discount % */}
                            <EditableNumber
                              value={getVal(item, v.id, 'discount_percent')}
                              onChange={(val) => updateOverride(item.id, 'discount_percent', val)}
                              max={100}
                            />

                            {/* Subtotal */}
                            <div className="text-right font-mono font-semibold text-gray-900 dark:text-white tabular-nums">
                              ${sub.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Special list */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Lista especial
          </p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addSpecialItem()
              }}
              placeholder="Agregar ítem adicional..."
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
            />
            <Button size="sm" variant="outline" onClick={addSpecialItem} disabled={!newItem.trim()}>
              <Plus size={14} />
            </Button>
          </div>

          {specialListItems.length > 0 ? (
            <ul className="space-y-1">
              {specialListItems.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
                >
                  <span className="flex-1">{item}</span>
                  <button
                    onClick={() => removeSpecialItem(i)}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                    aria-label="Eliminar ítem"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
              Sin ítems en la lista especial.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={orderedVouchers.length === 0}>
            Aplicar y continuar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
