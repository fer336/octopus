import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../stores/authStore'
import authService from '../../api/authService'

export default function AdminAuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const hasProcessed = useRef(false)

  useEffect(() => {
    if (hasProcessed.current) return
    hasProcessed.current = true

    const processAuth = async () => {
      const accessToken = searchParams.get('access_token')
      const refreshToken = searchParams.get('refresh_token')

      if (!accessToken || !refreshToken) {
        toast.error('Error al autenticar. Intentá nuevamente.')
        navigate('/login?error=auth_failed', { replace: true })
        return
      }

      const { setAuth, setUser, logout, setLoading } = useAuthStore.getState()

      setAuth({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
      })

      try {
        const currentUser = await authService.getCurrentUser(accessToken)

        if (currentUser.platform_role !== 'superadmin') {
          logout()
          toast.error('Acceso denegado: se requiere rol de superadministrador.')
          navigate('/login?error=forbidden', { replace: true })
          return
        }

        setUser(currentUser)
        setLoading(false)
        toast.success('¡Bienvenido al panel admin!')
        navigate('/', { replace: true })
      } catch (error) {
        console.error('Admin auth callback error:', error)
        logout()
        toast.error('No se pudo validar la sesión.')
        navigate('/login?error=auth_failed', { replace: true })
      }
    }

    void processAuth()
  }, [navigate, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">Completando autenticación...</p>
      </div>
    </div>
  )
}
