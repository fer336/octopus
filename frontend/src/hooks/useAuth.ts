/**
 * Hook personalizado para autenticación.
 * Carga el usuario actual al iniciar la app si hay tokens válidos.
 */
import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import authService from '../api/authService'

export function useAuth() {
  const store = useAuthStore()
  const hasLoaded = useRef(false)

  useEffect(() => {
    // Solo cargar una vez al montar el componente
    if (hasLoaded.current) return
    hasLoaded.current = true

    const loadUser = async () => {
      const { accessToken, user, setUser, setLoading, logout } = useAuthStore.getState()

      if (accessToken && !user) {
        try {
          const currentUser = await authService.getCurrentUser(accessToken)
          setUser(currentUser)
        } catch (error) {
          console.error('Error loading user:', error)
          logout()
        } finally {
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    }

    loadUser()
  }, []) // Sin dependencias - solo ejecutar una vez al montar

  return store
}
