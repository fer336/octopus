/**
 * Store de autenticación con Zustand.
 * Maneja el estado del usuario y los tokens JWT.
 * Persiste tokens en localStorage con key aislada por shell.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type AuthShell = 'tenant' | 'admin'

const LEGACY_AUTH_STORAGE_KEY = 'auth-storage'
const AUTH_STORAGE_PREFIX = 'auth-storage'

function detectAuthShell(pathname?: string): AuthShell {
  const currentPathname = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')
  const normalizedPathname = currentPathname.toLowerCase()

  if (
    normalizedPathname.includes('/admin.html') ||
    normalizedPathname.endsWith('/admin') ||
    normalizedPathname.includes('/admin/')
  ) {
    return 'admin'
  }

  return 'tenant'
}

export function getAuthStorageKey(shell: AuthShell = detectAuthShell()): string {
  return `${AUTH_STORAGE_PREFIX}:${shell}`
}

const authStorageKey = getAuthStorageKey()

export interface User {
  id: string
  email: string
  name: string
  picture?: string
  platform_role?: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type?: string
  user?: User
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean

  // Acciones
  setAuth: (tokens: AuthTokens) => void
  updateAccessToken: (token: string) => void
  setUser: (user: User) => void
  logout: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (tokens: AuthTokens) => {
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user: tokens.user || null,
          isAuthenticated: true,
          isLoading: false,
        })
      },

      updateAccessToken: (token: string) => {
        set({
          accessToken: token,
          isAuthenticated: true,
        })
      },

      setUser: (user: User) => {
        set({
          user,
          isAuthenticated: true,
        })
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        })

        if (typeof window !== 'undefined') {
          localStorage.removeItem(authStorageKey)
          localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
        }
      },

      setLoading: (loading: boolean) => {
        set({
          isLoading: loading,
        })
      },
    }),
    {
      name: authStorageKey,
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // Cuando se restaura del localStorage, ajustar isLoading según isAuthenticated
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Si hay tokens válidos al restaurar, establecer isLoading en false
          state.isLoading = false
        }
      },
    }
  )
)
