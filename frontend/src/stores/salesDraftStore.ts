/**
 * Sales draft persistence via localStorage.
 * Scoped per user+business to avoid cross-user bleed on shared browsers.
 * The draft is cleared when the user successfully generates any voucher.
 */

const DRAFT_VERSION = 1

export interface SalesDraftData {
  _v: number
  items: unknown[]
  selectedClient: unknown | null
  selectedOperatingClientId: string
  voucherType: string
  generalDiscount: number
  showPrices: boolean
  paymentSelections: Record<string, unknown>
  payInCurrentAccount: boolean
  currentAccountDays: number
  acopioName: string
  acopioDescription: string
  acopioAmount: string
  acopioDiscount: number
  acopioCurrency: string
  acopioGenerateInvoice: boolean
  loadedBudgets: unknown[]
  loadedBudgetsPriceStrategy: string
}

function draftKey(userId: string | null, businessId: string | null): string {
  return `ot:sales-draft:${businessId ?? 'anon'}:${userId ?? 'anon'}`
}

export function readSalesDraft(userId: string | null, businessId: string | null): SalesDraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(userId, businessId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SalesDraftData
    if (parsed._v !== DRAFT_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function writeSalesDraft(data: Omit<SalesDraftData, '_v'>, userId: string | null, businessId: string | null): void {
  try {
    localStorage.setItem(draftKey(userId, businessId), JSON.stringify({ ...data, _v: DRAFT_VERSION }))
  } catch (_e) {
    // localStorage unavailable (private mode / quota exceeded) — silently skip
  }
}

export function clearSalesDraft(userId: string | null, businessId: string | null): void {
  try {
    localStorage.removeItem(draftKey(userId, businessId))
  } catch (_e) {
    // localStorage unavailable — silently skip
  }
}
