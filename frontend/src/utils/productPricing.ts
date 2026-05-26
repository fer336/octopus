import type { ProductUpdate } from '../api/productsService'

export const PRODUCT_PRICE_CURRENCY = {
  ARS: 'ARS',
  USD: 'USD',
} as const

export type ProductPriceCurrency = (typeof PRODUCT_PRICE_CURRENCY)[keyof typeof PRODUCT_PRICE_CURRENCY]

export interface ProductPricingFields {
  price_currency?: ProductPriceCurrency | string | null
  list_price?: number | string | null
  list_price_usd?: number | string | null
}

export interface ProductPriceUpdateFields extends ProductPricingFields {
  discount_1?: number | string | null
  discount_2?: number | string | null
  discount_3?: number | string | null
  extra_cost?: number | string | null
  profit_margin?: number | string | null
  current_stock?: number | string | null
}

export const toNonNegativePriceNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, parsed)
}

export const isUsdPricedProduct = (product: ProductPricingFields): boolean => {
  return product.price_currency === PRODUCT_PRICE_CURRENCY.USD && product.list_price_usd != null
}

export const formatSourceListPrice = (product: ProductPricingFields): string => {
  const currency = isUsdPricedProduct(product) ? PRODUCT_PRICE_CURRENCY.USD : PRODUCT_PRICE_CURRENCY.ARS
  const prefix = currency === PRODUCT_PRICE_CURRENCY.USD ? 'U$S ' : '$'
  const value = getSourceListPrice(product)

  return `${prefix}${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const getSourceListPrice = (product: ProductPricingFields): number => {
  if (isUsdPricedProduct(product)) {
    return toNonNegativePriceNumber(product.list_price_usd)
  }

  return toNonNegativePriceNumber(product.list_price)
}

export const convertSourcePriceToArs = (product: ProductPricingFields, exchangeRate: number): number => {
  const sourcePrice = getSourceListPrice(product)
  if (!isUsdPricedProduct(product)) return sourcePrice

  return Math.round(sourcePrice * toNonNegativePriceNumber(exchangeRate) * 100) / 100
}

export const buildProductPriceUpdatePayload = (
  product: ProductPriceUpdateFields,
  exchangeRate: number,
): ProductUpdate => {
  const isUsd = isUsdPricedProduct(product)
  const sourceListPrice = getSourceListPrice(product)
  const listPriceArs = convertSourcePriceToArs(product, exchangeRate)

  return {
    price_currency: isUsd ? PRODUCT_PRICE_CURRENCY.USD : PRODUCT_PRICE_CURRENCY.ARS,
    list_price_usd: isUsd ? sourceListPrice : null,
    list_price: listPriceArs,
    discount_1: Math.min(100, toNonNegativePriceNumber(product.discount_1)),
    discount_2: Math.min(100, toNonNegativePriceNumber(product.discount_2)),
    discount_3: Math.min(100, toNonNegativePriceNumber(product.discount_3)),
    extra_cost: toNonNegativePriceNumber(product.extra_cost),
    profit_margin: toNonNegativePriceNumber(product.profit_margin),
    current_stock: Math.floor(toNonNegativePriceNumber(product.current_stock)),
  }
}
