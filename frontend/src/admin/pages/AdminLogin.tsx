import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, ShieldCheck, UsersRound } from 'lucide-react'
import Button from '../../components/ui/Button'
import { useAuthStore } from '../../stores/authStore'
import authService from '../../api/authService'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    if (isAuthenticated && user?.platform_role === 'superadmin') {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate, user?.platform_role])

  const handleGoogleLogin = () => {
    authService.loginWithGoogle('admin')
  }

  const hasDeniedAccess = searchParams.get('error') === 'forbidden'
  const hasAuthError = searchParams.get('error') === 'auth_failed'
  const hasMissingCode = searchParams.get('error') === 'no_code'

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] px-4 py-4 overflow-y-auto">
      <div className="max-w-xs w-full mx-auto">
        <div className="text-center mb-3">
          <div className="flex justify-center">
            <img
              src="/logo-tenculo-final.png"
              alt="OctopusTrack"
              className="h-[83px] w-auto object-contain"
            />
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            OctopusTrack
          </h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary-600 dark:text-primary-300">
            Panel administrador
          </p>
        </div>

        <div className="bg-[var(--color-bg-secondary)] rounded-xl shadow-md p-4 border border-primary-200 dark:border-primary-800">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-2 text-center dark:border-primary-800 dark:bg-primary-900/20">
              <ShieldCheck className="mx-auto h-5 w-5 text-primary-600 dark:text-primary-300" />
              <p className="mt-1 text-[10px] font-medium text-[var(--color-text-secondary)]">Tenants</p>
            </div>
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-2 text-center dark:border-primary-800 dark:bg-primary-900/20">
              <UsersRound className="mx-auto h-5 w-5 text-primary-600 dark:text-primary-300" />
              <p className="mt-1 text-[10px] font-medium text-[var(--color-text-secondary)]">Usuarios</p>
            </div>
            <div className="rounded-xl border border-primary-200 bg-primary-50/70 p-2 text-center dark:border-primary-800 dark:bg-primary-900/20">
              <KeyRound className="mx-auto h-5 w-5 text-primary-600 dark:text-primary-300" />
              <p className="mt-1 text-[10px] font-medium text-[var(--color-text-secondary)]">Acceso</p>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1 text-center">
            Iniciar sesión
          </h2>
          <p className="mb-3 text-center text-xs text-gray-500 dark:text-gray-400">
            Ingreso exclusivo para superadministradores
          </p>

          {hasDeniedAccess && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              Acceso denegado: tu cuenta no tiene permisos de superadministrador.
            </div>
          )}

          {hasAuthError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              No se pudo completar la autenticación. Intentá nuevamente.
            </div>
          )}

          {hasMissingCode && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              La autenticación fue cancelada o incompleta.
            </div>
          )}

          <Button onClick={handleGoogleLogin} variant="outline" size="md" className="w-full">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continuar con Google
          </Button>

          <p className="mt-3 text-center text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            Usá una cuenta habilitada como superadministrador.
          </p>
        </div>

        <p className="mt-3 text-center text-[11px] text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} OctopusTrack. Todos los derechos reservados.
        </p>
      </div>
    </div>
  )
}
