/**
 * Header de la aplicación.
 * Contiene toggle de tema, información del usuario y logout.
 */
import { Sun, Moon, LogOut, Menu, ChevronLeft } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAuthStore } from '../../stores/authStore'
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
      <div className="flex items-center gap-2 sm:gap-4">
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
