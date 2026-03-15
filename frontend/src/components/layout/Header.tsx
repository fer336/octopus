/**
 * Header de la aplicación.
 * Contiene toggle de tema, información del usuario, logout
 * y el botón para abrir/cerrar el Asistente IA.
 */
import { Sun, Moon, LogOut, Menu, ChevronLeft, Sparkles } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAuthStore } from '../../stores/authStore'
import { useAIStore } from '../../stores/aiStore'
import Button from '../ui/Button'

interface HeaderProps {
  onMenuClick?: () => void
  isSidebarCollapsed?: boolean
}

export default function Header({
  onMenuClick,
  isSidebarCollapsed,
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuthStore()
  const toggleAI = useAIStore((s) => s.toggle)

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 flex-shrink-0">
        {/* Left side */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={isSidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {isSidebarCollapsed ? <Menu size={24} /> : <ChevronLeft size={24} />}
          </button>
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Mi Negocio
            </h1>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* ── Botón Agente IA ─────────────────────────────────── */}
          <button
            onClick={toggleAI}
            className="
              relative flex items-center gap-2 px-3 py-2 rounded-xl
              bg-gradient-to-r from-cyan-500 to-blue-500
              hover:from-cyan-400 hover:to-blue-400
              text-white text-sm font-semibold
              shadow-md shadow-cyan-500/30
              hover:shadow-lg hover:shadow-cyan-500/40
              transition-all duration-200
              group
            "
            aria-label="Abrir agente de presupuestos IA"
          >
            {/* Glow pulsante sutil */}
            <span className="absolute inset-0 rounded-xl bg-cyan-400 opacity-0 group-hover:opacity-10 transition-opacity" />
            <Sparkles
              size={16}
              className="relative z-10 group-hover:rotate-12 transition-transform duration-200"
            />
            <span className="relative z-10 hidden sm:inline">IA</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          {/* User info */}
          {user && (
            <div className="flex items-center gap-3">
              {user.picture && (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm text-gray-700 dark:text-gray-200 hidden sm:block max-w-[150px] truncate">
                {user.name}
              </span>
            </div>
          )}

          {/* Logout */}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut size={18} />
            <span className="hidden sm:inline ml-2">Salir</span>
          </Button>
        </div>
      </header>
  )
}
