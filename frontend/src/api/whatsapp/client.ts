import axios, { type AxiosInstance } from 'axios'
import { getProviderConfig } from './provider'

let _client: AxiosInstance | null = null
let _configSnapshot = ''

export function getWhatsAppClient(): AxiosInstance {
  const config = getProviderConfig()
  const snapshot = JSON.stringify({
    base: config.baseUrl,
    key: config.apiKey,
    header: config.authHeader,
    prefix: config.authPrefix,
  })

  if (!_client || snapshot !== _configSnapshot) {
    _configSnapshot = snapshot
    _client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        [config.authHeader]: `${config.authPrefix}${config.apiKey}`,
      },
    })
  }

  return _client
}

export function invalidateWhatsAppClient(): void {
  _client = null
  _configSnapshot = ''
}
