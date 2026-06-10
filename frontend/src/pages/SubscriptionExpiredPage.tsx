import { ShieldOff, LogOut } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export default function SubscriptionExpiredPage() {
  const logout = useAuthStore((state) => state.logout)

  const reason = sessionStorage.getItem('subscription_blocked_reason') ?? ''
  const isExpired =
    reason.toLowerCase().includes('vencido') ||
    reason.toLowerCase().includes('expirado')

  const handleLogout = () => {
    sessionStorage.removeItem('subscription_blocked_reason')
    logout()
    window.location.hash = '/login'
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <ShieldOff className="w-10 h-10 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-3">
          {isExpired ? 'Tu suscripción venció' : 'Acceso suspendido'}
        </h1>

        <p className="text-[var(--color-text-secondary)] leading-relaxed mb-4">
          {isExpired
            ? 'El período de acceso de tu negocio expiró.'
            : 'El acceso a tu negocio fue suspendido temporalmente.'}
          {' '}Para reactivarlo, contactá al administrador del sistema.
        </p>

        {reason && (
          <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 mb-6 text-left">
            {reason}
          </div>
        )}

        <button
          onClick={handleLogout}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-[var(--color-text-primary)] rounded-lg font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
