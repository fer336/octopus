/**
 * Página de Callback de Autenticación.
 * Maneja el callback de Google OAuth y guarda los tokens.
 */
import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const hasProcessed = useRef(false)

  useEffect(() => {
    // Evitar procesar múltiples veces
    if (hasProcessed.current) return
    hasProcessed.current = true

    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')

    if (accessToken && refreshToken) {
      // Guardar tokens en el store
      const { setAuth, setLoading } = useAuthStore.getState()
      
      setAuth({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
      })

      setLoading(false)
      toast.success('¡Bienvenido!')

      // Redirigir al dashboard
      navigate('/', { replace: true })
    } else {
      // Error en la autenticación
      toast.error('Error al autenticar. Intenta nuevamente.')
      navigate('/login', { replace: true })
    }
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">
          Completando autenticación...
        </p>
      </div>
    </div>
  )
}
