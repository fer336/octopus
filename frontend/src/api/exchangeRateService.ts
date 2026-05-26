import httpClient from './httpClient'

export interface DollarRate {
  compra: number
  venta: number
  promedio: number
}

export interface ExchangeRates {
  blue: DollarRate
  oficial: DollarRate
}

const exchangeRateService = {
  getRates: (): Promise<ExchangeRates> =>
    httpClient.get('/exchange-rate').then((r) => r.data),
}

export default exchangeRateService
