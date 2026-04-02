/**
 * Header de la aplicación.
 * Contiene toggle de tema, información del usuario, logout
 * y el botón para abrir/cerrar el Asistente IA.
 */
import type { ReactNode } from 'react'
import { Sun, Moon, LogOut, Menu, ChevronLeft, Sparkles } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAuthStore } from '../../stores/authStore'
import { useAIStore } from '../../stores/aiStore'
import Button from '../ui/Button'

interface HeaderProps {
  onMenuClick?: () => void
  isSidebarCollapsed?: boolean
  currentRouteLabel: string
  contextualAction?: ReactNode
}

export default function Header({
  onMenuClick,
  isSidebarCollapsed,
  currentRouteLabel,
  contextualAction,
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuthStore()
  const isAIOpen = useAIStore((s) => s.isOpen)
  const toggleAI = useAIStore((s) => s.toggle)

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <header className="h-[59px] bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 flex-shrink-0">
        {/* Left side */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={isSidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {isSidebarCollapsed ? <Menu size={22} /> : <ChevronLeft size={22} />}
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight truncate">
              {currentRouteLabel}
            </h1>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          {contextualAction}

          {/* ── Botón Agente IA ─────────────────────────────────── */}
          <button
            type="button"
            onClick={toggleAI}
            className="
              relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
              bg-gradient-to-r from-cyan-500 to-blue-500
              hover:from-cyan-400 hover:to-blue-400
              text-white text-xs font-semibold
              shadow-md shadow-cyan-500/30
              hover:shadow-lg hover:shadow-cyan-500/40
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
            <span className="absolute inset-0 rounded-xl bg-cyan-400 opacity-0 group-hover:opacity-10 transition-opacity" />
            <Sparkles
              size={15}
              className="relative z-10 group-hover:rotate-12 transition-transform duration-200"
            />
            <span className="relative z-10 hidden sm:inline">IA</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
              <span className="text-[13px] text-gray-700 dark:text-gray-200 hidden sm:block max-w-[150px] truncate">
                {user.name}
              </span>
            </div>
          )}

          {/* Logout */}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="px-2.5 py-1.5">
            <LogOut size={16} />
            <span className="hidden sm:inline ml-2">Salir</span>
          </Button>
        </div>
      </header>
  )
}
