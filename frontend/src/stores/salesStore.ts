/**
 * Store Zustand de Ventas.
 * Gestiona el carrito de ventas y permite precargar ítems desde el Agente IA.
 */
import { create } from 'zustand'
import { AIDraftItem } from '../types'

export interface SaleItem {
  productId: string
  code: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  total: number
  ivaRate: number
}

interface SalesState {
  items: SaleItem[]
  preloadedFromAI: boolean

  /** Precarga ítems desde un draft de cotización del Agente IA */
  preloadItems: (draftItems: AIDraftItem[]) => void

  /** Agrega un ítem manualmente */
  addItem: (item: SaleItem) => void

  /** Actualiza la cantidad de un ítem */
  updateQty: (productId: string, qty: number) => void

  /** Elimina un ítem del carrito */
  removeItem: (productId: string) => void

  /** Limpia el carrito */
  clear: () => void
}

export const useSalesStore = create<SalesState>((set) => ({
  items: [],
  preloadedFromAI: false,

  preloadItems: (draftItems) => {
    const items: SaleItem[] = draftItems
      .filter((d) => d.product !== null)
      .map((d) => ({
        productId: d.product!.id,
        code: d.product!.code,
        description: d.product!.description,
        qty: d.qty,
        unit: d.product!.unit,
        unitPrice: d.product!.sale_price,
        total: d.qty * d.product!.sale_price,
        ivaRate: d.product!.iva_rate,
      }))

    set({ items, preloadedFromAI: true })
  },

  addItem: (item) =>
    set((s) => {
      const existing = s.items.find((i) => i.productId === item.productId)
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.productId === item.productId
              ? { ...i, qty: i.qty + item.qty, total: (i.qty + item.qty) * i.unitPrice }
              : i,
          ),
        }
      }
      return { items: [...s.items, item] }
    }),

  updateQty: (productId, qty) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.productId === productId
          ? { ...i, qty, total: qty * i.unitPrice }
          : i,
      ),
    })),

  removeItem: (productId) =>
    set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),

  clear: () => set({ items: [], preloadedFromAI: false }),
}))
