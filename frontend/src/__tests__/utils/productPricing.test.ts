import { describe, expect, it } from 'vitest'
import {
  buildProductPriceUpdatePayload,
  formatSourceListPrice,
  getSourceListPrice,
  isUsdPricedProduct,
} from '../../utils/productPricing'

describe('product pricing helpers', () => {
  it('formats and selects USD source list price', () => {
    const product = {
      price_currency: 'USD',
      list_price: 125000,
      list_price_usd: 100,
    }

    expect(isUsdPricedProduct(product)).toBe(true)
    expect(getSourceListPrice(product)).toBe(100)
    expect(formatSourceListPrice(product)).toBe('U$S 100,00')
  })

  it('formats and selects ARS source list price', () => {
    const product = {
      price_currency: 'ARS',
      list_price: 125000,
      list_price_usd: null,
    }

    expect(isUsdPricedProduct(product)).toBe(false)
    expect(getSourceListPrice(product)).toBe(125000)
    expect(formatSourceListPrice(product)).toBe('$125.000,00')
  })

  it('builds USD bulk update payload preserving USD source and converting ARS list price', () => {
    const product = {
      price_currency: 'USD',
      list_price: 100,
      list_price_usd: 100,
      discount_1: 10,
      discount_2: 5,
      discount_3: 0,
      extra_cost: 2,
      profit_margin: 30,
      current_stock: 12,
    }

    expect(buildProductPriceUpdatePayload(product, 1250)).toEqual({
      price_currency: 'USD',
      list_price_usd: 100,
      list_price: 125000,
      discount_1: 10,
      discount_2: 5,
      discount_3: 0,
      extra_cost: 2,
      profit_margin: 30,
      current_stock: 12,
    })
  })
})
