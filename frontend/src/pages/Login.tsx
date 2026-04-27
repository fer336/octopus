/**
 * Página de Login.
 * Permite iniciar sesión con Google OAuth o con credenciales.
 */
import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import authService from '../api/authService'
import { useAuthStore } from '../stores/authStore'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const demoEmail = import.meta.env.VITE_DEMO_LOGIN_EMAIL || ''
  const demoPassword = import.meta.env.VITE_DEMO_LOGIN_PASSWORD || ''
  const autoDevLogin = import.meta.env.VITE_DEV_AUTO_LOGIN === 'true'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleLogin = () => {
    authService.loginWithGoogle()
  }

  const handleCredentialsLogin = async (
    userEmail: string = email,
    userPassword: string = password,
  ) => {
    if (!userEmail || !userPassword) {
      toast.error('Completá usuario y contraseña')
      return
    }

    setIsLoading(true)

    try {
      const response = await authService.loginWithCredentials(userEmail, userPassword)
      setAuth(response)
      toast.success('Ingreso exitoso')
      navigate('/', { replace: true })
    } catch (error) {
      console.error('Credentials login error:', error)
      toast.error('No se pudo iniciar sesión. Revisá usuario y contraseña.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (import.meta.env.DEV && autoDevLogin && demoEmail && demoPassword) {
      void handleCredentialsLogin(demoEmail, demoPassword)
    }
  }, [])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleCredentialsLogin()
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] px-4 py-4 overflow-y-auto">
      <div className="max-w-xs w-full mx-auto">
        {/* Logo */}
        <div className="text-center mb-3">
          <div className="flex justify-center">
            <img
              src="/logo-tenculo-final.png"
              alt="Octopus Track"
              className="h-[83px] w-auto object-contain"
            />
          </div>
        </div>

        {/* Card de login */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl shadow-md p-4 border border-primary-200 dark:border-primary-800">
          <div className="flex items-center justify-center gap-2 mb-3">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] text-center">
            Iniciar sesión
            </h2>
          </div>

          <Button
            onClick={handleGoogleLogin}
            variant="outline"
            size="md"
            className="w-full"
          >
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

          <div className="my-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              o
            </span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-primary-200 dark:border-primary-800 p-3 space-y-2.5"
          >
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              Ingresar con usuario y contraseña
            </p>

            <Input
              label="Usuario"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="tu@email.com"
            />

            <Input
              label="Contraseña"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />

            <Button type="submit" variant="primary" size="md" className="w-full" isLoading={isLoading}>
              Ingresar
            </Button>
          </form>

          <p className="mt-3 text-center text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            Al iniciar sesión, aceptas nuestros términos de servicio y política
            de privacidad.
          </p>
        </div>

        {/* Footer */}
        <p className="mt-3 text-center text-[11px] text-gray-500 dark:text-gray-400">
          © {new Date().getFullYear()} OctopusTrack. Todos los derechos reservados.
        </p>
      </div>
    </div>
  )
}
