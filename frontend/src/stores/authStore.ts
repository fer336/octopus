/**
 * Store de autenticación con Zustand.
 * Maneja el estado del usuario y los tokens JWT.
 * Persiste tokens en localStorage.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: string
  email: string
  name: string
  picture?: string
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
        localStorage.removeItem('auth-storage')
      },

      setLoading: (loading: boolean) => {
        set({
          isLoading: loading,
        })
      },
    }),
    {
      name: 'auth-storage',
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
