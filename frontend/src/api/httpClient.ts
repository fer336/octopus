/**
 * Cliente HTTP con Axios.
 * Incluye interceptores para autenticación y refresh de tokens.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/authStore'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

export function getBackendUrl(): string {
  return BACKEND_URL
}

export function getTenantApiUrl(): string {
  const configuredApiUrl = import.meta.env.VITE_API_URL

  if (!configuredApiUrl) {
    return `${BACKEND_URL}/api/tenant`
  }

  // Compatibilidad retroactiva: despliegues viejos pueden seguir con /api/v1
  // en VITE_API_URL y eso rompe los endpoints tenant luego de la migracion.
  return configuredApiUrl.replace(/\/api\/v1\/?$/, '/api/tenant')
}

export function getAdminApiUrl(): string {
  const configuredApiUrl = import.meta.env.VITE_API_URL

  if (!configuredApiUrl) {
    return `${BACKEND_URL}/api/admin`
  }

  return configuredApiUrl
    .replace(/\/api\/v1\/?$/, '/api/admin')
    .replace(/\/api\/tenant\/?$/, '/api/admin')
}

const API_URL = getTenantApiUrl()

function getLoginRedirectUrl(): string {
  const currentPath = window.location.pathname

  if (currentPath.includes('/admin.html')) {
    return '/admin.html#/login'
  }

  if (currentPath.includes('/tenant.html')) {
    return '/tenant.html#/login'
  }

  return '/login'
}

export const httpClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
})

// Variable para controlar el refresh token en curso
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })

  failedQueue = []
}

// Interceptor de request: agregar token
httpClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState()
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Interceptor de response: manejar errores y refresh token
httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    // Si es 401 y no es un retry, intentar refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Si ya hay un refresh en curso, encolar esta petición
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return httpClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const { refreshToken, updateAccessToken, logout } = useAuthStore.getState()

      if (refreshToken) {
        try {
          const response = await axios.post(`${BACKEND_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          })

          const { access_token } = response.data
          updateAccessToken(access_token)

          // Procesar cola de peticiones pendientes
          processQueue(null, access_token)

          // Reintentar request original con nuevo token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access_token}`
          }
          return httpClient(originalRequest)
        } catch (refreshError) {
          // Refresh falló, cerrar sesión
          processQueue(refreshError as Error, null)
          logout()
          window.location.href = getLoginRedirectUrl()
          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
        }
      } else {
        isRefreshing = false
        logout()
        window.location.href = getLoginRedirectUrl()
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export default httpClient
