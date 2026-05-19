import axios, { type AxiosInstance } from 'axios'
import { getTenantApiUrl } from '../httpClient'
import { useAuthStore } from '../../stores/authStore'

let _client: AxiosInstance | null = null

export function getWhatsAppClient(): AxiosInstance {
  if (!_client) {
    _client = axios.create({
      baseURL: `${getTenantApiUrl()}/whatsapp`,
      headers: { 'Content-Type': 'application/json' },
    })
    _client.interceptors.request.use((config) => {
      const token = useAuthStore.getState().accessToken
      if (token) config.headers.Authorization = `Bearer ${token}`
      return config
    })
  }
  return _client
}

export function invalidateWhatsAppClient(): void {
  _client = null
}
