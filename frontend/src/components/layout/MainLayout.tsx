/**
 * Layout principal de la aplicación.
 * Combina Sidebar, Header y área de contenido.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ScanLine, ShoppingCart } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useAIStore } from '../../stores/aiStore'
import { useAuthStore } from '../../stores/authStore'
import businessService from '../../api/businessService'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileShell from './MobileShell'
import AIAssistantPanel from '../ai/AIAssistantPanel'
import Button from '../ui/Button'
import { getActiveNavigationItem, navigationItems } from './navigationItems'
import { hasPathAccess } from '../../utils/acl'
import { useProductTour } from '../../hooks/useProductTour'

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)

  // Hook para cargar usuario en refresh
  useAuth()

  const closeAI = useAIStore((s) => s.close)
  const { hasTourForCurrentPage, launchCurrentTour } = useProductTour()

  const { data: business } = useQuery({
    queryKey: ['business-me-layout'],
    queryFn: () => businessService.getMyBusiness(),
    staleTime: 60_000,
  })

  const aiEnabled = business?.ai_agent_enabled ?? false
  const currentAccountEnabled = (business?.current_account_mode ?? 'disabled') !== 'disabled'
  const priceUpdateEnabled = business?.price_update_enabled ?? true
  const wholesaleListsEnabled = business?.wholesale_lists_enabled ?? false
  const reportsEnabled = business?.reports_enabled ?? true
  const inventoryEnabled = business?.inventory_enabled ?? true
  const stockpileEnabled = business?.stockpile_enabled ?? true
  const whatsappEnabled = business?.whatsapp_enabled ?? true
  const profitabilityEnabled = business?.profitability_enabled ?? true
  const qrScannerEnabled = business?.qr_scanner_enabled ?? true
  // Módulo opt-in nuevo: a diferencia de los flags legacy (ej. inventory_enabled),
  // el default es false — la activación es 100% responsabilidad del panel admin/CMS.
  const purchasesEnabled = business?.purchases_enabled ?? false

  useEffect(() => {
    if (!aiEnabled) {
      closeAI()
    }
  }, [aiEnabled, closeAI])

  useEffect(() => {
    if (location.pathname === '/current-account' && !currentAccountEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/price-update') && !priceUpdateEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/price-lists') && !priceUpdateEnabled && !currentAccountEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/wholesale-lists') && !wholesaleListsEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/reports') && !reportsEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/inventory') && !inventoryEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/stockpiles') && !stockpileEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/messaging') && business !== undefined && !whatsappEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/rentabilidad') && !profitabilityEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (location.pathname.startsWith('/purchase-invoices') && business !== undefined && !purchasesEnabled) {
      navigate('/', { replace: true })
      return
    }

    if (user && !hasPathAccess(user, location.pathname)) {
      const fallbackPath = navigationItems.find((item) => hasPathAccess(user, item.path))?.path ?? '/'
      navigate(fallbackPath, { replace: true })
    }
  }, [currentAccountEnabled, priceUpdateEnabled, wholesaleListsEnabled, reportsEnabled, inventoryEnabled, stockpileEnabled, whatsappEnabled, profitabilityEnabled, purchasesEnabled, business, location.pathname, navigate, user])

  const toggleSidebar = () => {
    if (window.innerWidth < 768) return // mobile: MobileShell handles navigation
    if (window.innerWidth < 1024) {
      setMobileSidebarOpen((prev) => !prev)
      return
    }

    setSidebarCollapsed((prev) => !prev)
  }

  const closeMobileSidebar = () => setMobileSidebarOpen(false)

  useEffect(() => {
    closeMobileSidebar()
  }, [location.pathname])

  const activeNavigationItem = getActiveNavigationItem(location.pathname)
  const currentRouteLabel = activeNavigationItem?.label ?? 'Octopus'
  const isVouchersRoute = activeNavigationItem?.path === '/comprobantes'
  const isSalesRoute = location.pathname.startsWith('/sales')

  const contextualAction = (isSalesRoute && qrScannerEnabled) ? (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigate('/sales?scan=1')
      }}
      className="h-8 px-2 md:hidden"
      aria-label="Escanear producto"
      title="Escanear producto"
    >
      <ScanLine size={16} />
      <span className="ml-1.5 hidden sm:inline">Escanear producto</span>
    </Button>
  ) : isVouchersRoute ? (
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
    <div className="flex h-dvh overflow-hidden bg-[var(--color-bg-primary)]">
      {/* Sidebar */}
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          isMobileOpen={mobileSidebarOpen}
          onCloseMobile={closeMobileSidebar}
          currentAccountMode={business?.current_account_mode}
          priceUpdateEnabled={priceUpdateEnabled}
          wholesaleListsEnabled={wholesaleListsEnabled}
          reportsEnabled={reportsEnabled}
          inventoryEnabled={inventoryEnabled}
          stockpileEnabled={stockpileEnabled}
          whatsappEnabled={whatsappEnabled}
          profitabilityEnabled={profitabilityEnabled}
          purchasesEnabled={purchasesEnabled}
        />

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Header
          onMenuClick={toggleSidebar}
          isSidebarCollapsed={sidebarCollapsed}
          isMobileSidebarOpen={mobileSidebarOpen}
          currentRouteLabel={currentRouteLabel}
          contextualAction={contextualAction}
          aiEnabled={aiEnabled}
          onTourClick={launchCurrentTour}
          hasTourForCurrentPage={hasTourForCurrentPage}
        />

        <main
          className={`flex-1 overflow-auto ${
            location.pathname.startsWith('/sales') ? 'p-2 sm:p-4 lg:p-6' : 'p-2 sm:p-3'
          }`}
        >
          <Outlet />
          {/* Spacer so the mobile tab bar never covers the bottom of any page */}
          <div className="h-[54px] md:hidden" aria-hidden="true" />
        </main>
      </div>

      {aiEnabled && <AIAssistantPanel />}

      {/* Mobile shell — only rendered/visible on < 768px */}
      <div className="md:hidden">
        <MobileShell
          currentAccountMode={business?.current_account_mode}
          whatsappEnabled={whatsappEnabled}
        />
      </div>
    </div>
  )
}
