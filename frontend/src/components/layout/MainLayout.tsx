/**
 * Layout principal de la aplicación.
 * Combina Sidebar, Header y área de contenido.
 */
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import Sidebar from './Sidebar'
import Header from './Header'
import AIAssistantPanel from '../ai/AIAssistantPanel'
import Button from '../ui/Button'
import { getActiveNavigationItem } from './navigationItems'

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Hook para cargar usuario en refresh
  useAuth()

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev)
  }

  const activeNavigationItem = getActiveNavigationItem(location.pathname)
  const currentRouteLabel = activeNavigationItem?.label ?? 'Octopus'
  const isVouchersRoute = activeNavigationItem?.path === '/comprobantes'

  const contextualAction = isVouchersRoute ? (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigate('/sales')
      }}
      className="h-8 w-8 p-0"
      aria-label="Nueva venta"
      title="Nueva venta"
    >
      <ShoppingCart size={16} />
    </Button>
  ) : undefined

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <Sidebar isCollapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          onMenuClick={toggleSidebar}
          isSidebarCollapsed={sidebarCollapsed}
          currentRouteLabel={currentRouteLabel}
          contextualAction={contextualAction}
        />

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      <AIAssistantPanel />
    </div>
  )
}
