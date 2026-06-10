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

/**
 * Cliente HTTP específico para Admin.
 * Evita colisiones con la baseURL de tenant.
 */
export const adminHttpClient = axios.create({
  baseURL: getAdminApiUrl(),
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

// Evita redirigir múltiples veces si varios requests fallan por suscripción
let redirectingToBlocked = false

function isSubscriptionBlockedError(detail: string): boolean {
  const lower = detail.toLowerCase()
  return (
    lower.includes('vencido') ||
    lower.includes('bloqueado por falta de pago') ||
    lower.includes('no tenés acceso activo a ningún negocio') ||
    lower.includes('no tenés acceso a ningún negocio')
  )
}

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

// Interceptor para Admin (comparte lógica de token)
adminHttpClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState()
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Interceptor de respuesta para Admin (maneja refresh token)
adminHttpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return adminHttpClient(originalRequest)
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
          processQueue(null, access_token)

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access_token}`
          }
          return adminHttpClient(originalRequest)
        } catch (refreshError) {
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

// Interceptor de response: manejar errores y refresh token
httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    // Suscripción vencida o bloqueada — redirigir a pantalla de bloqueo
    if (error.response?.status === 403 && !redirectingToBlocked) {
      const detail: string =
        (error.response.data as { detail?: string })?.detail ?? ''
      if (isSubscriptionBlockedError(detail)) {
        redirectingToBlocked = true
        sessionStorage.setItem('subscription_blocked_reason', detail)
        window.location.hash = '/blocked'
        return Promise.reject(error)
      }
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
