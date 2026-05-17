/**
 * Header de la aplicación.
 * Contiene toggle de tema, información del usuario, logout
 * y el botón para abrir/cerrar el Asistente IA.
 */
import type { ReactNode } from 'react'
import { Sun, Moon, LogOut, Menu, ChevronLeft, Sparkles, LifeBuoy, ShieldAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext'
import { useAuthStore } from '../../stores/authStore'
import { useAIStore } from '../../stores/aiStore'
import vouchersService from '../../api/vouchersService'
import Button from '../ui/Button'

interface HeaderProps {
  onMenuClick?: () => void
  isSidebarCollapsed?: boolean
  isMobileSidebarOpen?: boolean
  currentRouteLabel: string
  contextualAction?: ReactNode
  aiEnabled?: boolean
  onTourClick?: () => void
  hasTourForCurrentPage?: boolean
}

export default function Header({
  onMenuClick,
  isSidebarCollapsed,
  isMobileSidebarOpen = false,
  currentRouteLabel,
  contextualAction,
  aiEnabled = false,
  onTourClick,
  hasTourForCurrentPage = false,
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuthStore()
  const isAIOpen = useAIStore((s) => s.isOpen)
  const toggleAI = useAIStore((s) => s.toggle)
  const navigate = useNavigate()

  // Query para autorizaciones pendientes (solo si el usuario tiene rol de manager/owner)
  const { data: authData } = useQuery({
    queryKey: ['pending-authorizations'],
    queryFn: () => vouchersService.getPendingAuthorizations(),
    refetchInterval: 30000, // Refrescar cada 30 segundos
    retry: false,
    enabled: !!user, // Solo si hay usuario logueado
  })

  const pendingCount = authData?.total ?? 0

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <header className="h-[59px] bg-[var(--color-bg-secondary)] border-b border-primary-200 dark:border-primary-800 flex items-center justify-between px-2 sm:px-4 flex-shrink-0 transition-colors">
        {/* Left side */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="hidden md:flex p-1.5 text-primary-700 hover:text-primary-900 dark:text-primary-300 dark:hover:text-primary-100 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
            aria-label={isMobileSidebarOpen || isSidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            <span className="md:block lg:hidden">
              <Menu size={20} />
            </span>
            <span className="hidden lg:inline">
              {isSidebarCollapsed ? <Menu size={22} /> : <ChevronLeft size={22} />}
            </span>
          </button>
          <div className="min-w-0 max-w-[140px] sm:max-w-xs">
            <h1 className="text-sm font-semibold text-[var(--color-text-primary)] tracking-tight truncate">
              {currentRouteLabel}
            </h1>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          {contextualAction}

          {hasTourForCurrentPage && (
            <button
              type="button"
              onClick={onTourClick}
              className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-primary-200 dark:border-primary-700 px-2.5 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-200 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
              title="Ver tutorial de esta pantalla"
              data-tour-header-launch
            >
              <LifeBuoy size={15} />
              <span className="hidden sm:inline">Tutorial</span>
            </button>
          )}

          {/* ── Botón Agente IA ─────────────────────────────────── */}
          {aiEnabled && (
            <button
              type="button"
              onClick={toggleAI}
              className="
                relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
                bg-gradient-to-r from-primary-600 to-primary-700
                hover:from-primary-500 hover:to-primary-600
                text-white text-xs font-semibold
                shadow-md shadow-primary-700/30
                hover:shadow-lg hover:shadow-primary-700/40
                transition-all duration-200
                group
              "
              aria-label="Abrir agente de presupuestos IA"
              aria-expanded={isAIOpen}
              aria-controls="luci-assistant-panel"
              data-state={isAIOpen ? 'open' : 'closed'}
              data-testid="luci-toggle-button"
            >
              {/* Glow pulsante sutil */}
              <span className="absolute inset-0 rounded-xl bg-primary-300 opacity-0 group-hover:opacity-10 transition-opacity" />
              <Sparkles
                size={15}
                className="relative z-10 group-hover:rotate-12 transition-transform duration-200"
              />
              <span className="relative z-10 hidden sm:inline">IA</span>
            </button>
          )}

          {/* ── Badge Autorizaciones Pendientes ──────────────────────── */}
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => navigate('/authorizations')}
              className="
                relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
                bg-amber-100 dark:bg-amber-900/40
                hover:bg-amber-200 dark:hover:bg-amber-800/40
                text-amber-700 dark:text-amber-300 text-xs font-semibold
                border border-amber-300 dark:border-amber-700
                transition-colors cursor-pointer
              "
              aria-label={`${pendingCount} autorizaciones pendientes`}
            >
              <ShieldAlert size={15} />
              <span className="relative z-10">{pendingCount}</span>
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 text-primary-700 hover:text-primary-900 dark:text-primary-300 dark:hover:text-primary-100 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
            aria-label={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {/* User info */}
          {user && (
            <div className="flex items-center gap-3">
              {user.picture && (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-7 h-7 rounded-full"
                />
              )}
              <span className="text-[13px] text-primary-800 dark:text-primary-200 hidden sm:block max-w-[150px] truncate">
                {user.name}
              </span>
            </div>
          )}

          {/* Logout */}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="px-2 py-1.5 sm:px-2.5">
            <LogOut size={16} />
            <span className="hidden sm:inline ml-2">Salir</span>
          </Button>
        </div>
      </header>
  )
}
