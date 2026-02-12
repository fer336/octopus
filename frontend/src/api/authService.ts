/**
 * Servicio de Autenticación.
 * Maneja login, refresh de tokens y obtención de usuario actual.
 */
import axios from 'axios'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

// Cliente HTTP específico para endpoints de auth (sin prefijo /api/v1)
const authClient = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface User {
  id: string
  email: string
  name: string
  picture?: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export const authService = {
  /**
   * Inicia el flujo de autenticación con Google.
   * Redirige al usuario a la página de autorización de Google.
   */
  loginWithGoogle: () => {
    window.location.href = `${BACKEND_URL}/auth/google/login`
  },

  /**
   * Refresca el access token usando el refresh token.
   */
  refreshToken: async (refreshToken: string): Promise<{ access_token: string }> => {
    const response = await authClient.post('/auth/refresh', {
      refresh_token: refreshToken,
    })
    return response.data
  },

  /**
   * Obtiene la información del usuario autenticado.
   */
  getCurrentUser: async (accessToken: string): Promise<User> => {
    const response = await authClient.get('/auth/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    return response.data
  },

  /**
   * Cierra la sesión del usuario.
   */
  logout: async (accessToken: string): Promise<void> => {
    await authClient.post('/auth/logout', {}, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  },
}

export default authService
