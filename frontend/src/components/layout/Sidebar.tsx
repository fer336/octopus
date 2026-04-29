/**
 * Sidebar de navegación principal.
 * Muestra el menú de navegación con iconos.
 */
import { NavLink, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useCurrentCash } from '../../hooks/useCash'
import { useAuthStore } from '../../stores/authStore'
import { hasPathAccess } from '../../utils/acl'
import {
  getActiveNavigationItem,
  navigationItems,
  navigationSections,
  type NavigationItem,
} from './navigationItems'

function CajaBadge() {
  const { data: cash } = useCurrentCash()

  if (!cash) return null

  const isExpired = cash.is_expired
  const isOpen = cash.status === 'OPEN' && !isExpired

  if (isOpen) {
    return (
      <span className="ml-auto h-2 w-2 rounded-full bg-green-400 flex-shrink-0" title="Caja abierta" />
    )
  }
  if (isExpired) {
    return (
      <span className="ml-auto h-2 w-2 rounded-full bg-yellow-400 flex-shrink-0" title="Caja vencida" />
    )
  }
  return null
}

interface SidebarProps {
  isCollapsed?: boolean
  onToggle?: () => void
  isMobileOpen?: boolean
  onCloseMobile?: () => void
  currentAccountMode?: 'disabled' | 'automatic' | 'manual'
  priceUpdateEnabled?: boolean
  reportsEnabled?: boolean
}

export default function Sidebar({
  isCollapsed = false,
  isMobileOpen = false,
  onCloseMobile,
  currentAccountMode = 'disabled',
  priceUpdateEnabled = true,
  reportsEnabled = true,
}: SidebarProps) {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const currentAccountEnabled = currentAccountMode !== 'disabled'

  const visibleItems = useMemo(
    () =>
      navigationItems.filter((item) => {
        if (item.path === '/current-account' && !currentAccountEnabled) {
          return false
        }
        if (item.path === '/price-update' && !priceUpdateEnabled) {
          return false
        }
        if (item.path === '/reports' && !reportsEnabled) {
          return false
        }
        return hasPathAccess(user, item.path)
      }),
    [currentAccountEnabled, priceUpdateEnabled, reportsEnabled, user],
  )

  const getActiveSection = (pathname: string) =>
    getActiveNavigationItem(pathname)?.section

  const groupedItems = useMemo(() => {
    return navigationSections.map((section) => ({
      section,
      items: visibleItems.filter((item) => item.section === section.key),
    }))
  }, [visibleItems])

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const activeSection = getActiveSection(location.pathname)

    return navigationSections.reduce<Record<string, boolean>>((acc, section) => {
      acc[section.key] = section.key === activeSection
      return acc
    }, {})
  })

  useEffect(() => {
    const activeSection = getActiveSection(location.pathname)

    if (!activeSection) {
      return
    }

    setOpenSections((prev) => {
      if (prev[activeSection]) {
        return prev
      }

      return { ...prev, [activeSection]: true }
    })
  }, [location.pathname])

  const renderNavItem = (item: NavigationItem) => (
    // Selectores estables para Product Tour por módulo
    <NavLink
      key={item.path}
      to={item.path}
      onClick={() => {
        onCloseMobile?.()
      }}
      end={item.path === '/'}
      data-tour-nav={item.path}
      data-tour-nav-sales={item.path === '/sales' ? 'true' : undefined}
      data-tour-nav-products={item.path === '/products' ? 'true' : undefined}
      data-tour-nav-price-update={item.path === '/price-update' ? 'true' : undefined}
      data-tour-nav-inventory={item.path === '/inventory' ? 'true' : undefined}
      data-tour-nav-clients={item.path === '/clients' ? 'true' : undefined}
      data-tour-nav-current-account={item.path === '/current-account' ? 'true' : undefined}
      className={({ isActive }) =>
        clsx(
          'flex items-center rounded-md px-2.5 py-1.5 text-[13px] text-primary-300 hover:bg-[#2b2340] hover:text-white transition-colors',
          isActive && 'bg-[#3b2b55] text-white border-r-4 border-primary-400'
        )
      }
    >
      <item.icon size={17} className="flex-shrink-0" />
      {!isCollapsed && <span className="ml-2 truncate flex-1">{item.label}</span>}
      {item.badge && <CajaBadge />}
    </NavLink>
  )

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={clsx(
          'bg-[var(--color-brand-black)] text-white flex flex-col border-r border-[#2b2340]',
          'fixed inset-y-0 left-0 z-40 h-screen w-64 transform transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0 lg:h-screen lg:flex-shrink-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          !isMobileOpen && isCollapsed && 'lg:w-16',
          !isCollapsed ? 'lg:w-60' : ''
        )}
      >
      {/* Logo */}
      <div className="h-14 flex items-center justify-center border-b border-[#2b2340]">
        <img
          src="/images/logos/logo-header@2x.png"
          alt="Octopus Logo"
          className="h-[24px] w-[24px] object-contain"
        />
        {!isCollapsed && (
          <img
            src="/texto-solo-octopus.png"
            alt="Octopus"
            className="ml-3 h-[20px] w-auto object-contain"
            style={{ filter: 'brightness(0) saturate(100%) invert(67%) sepia(12%) saturate(1228%) hue-rotate(225deg) brightness(95%) contrast(88%)' }}
          />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2.5 overflow-y-auto px-2">
        {isCollapsed
          ? visibleItems.map((item) => renderNavItem(item))
            : groupedItems.map(({ section, items }) => (
              <div key={section.key} className="mb-3 last:mb-0">
                <button
                  type="button"
                  onClick={() => setOpenSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                  className={clsx(
                    'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-medium tracking-[0.08em] text-primary-300 transition-all',
                    'hover:bg-[#2b2340]/80 hover:text-primary-100',
                    openSections[section.key] && 'bg-[#2b2340]/60 text-primary-100'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <section.icon size={14} className="flex-shrink-0" />
                    <span className="truncate normal-case">{section.label}</span>
                  </span>
                  <ChevronDown
                    size={16}
                    strokeWidth={2.25}
                    className={clsx(
                      'flex-shrink-0 text-primary-400 transition-transform duration-200',
                      openSections[section.key] && 'rotate-180 text-primary-200'
                    )}
                  />
                </button>
                {openSections[section.key] && (
                  <div className="mt-1 space-y-0.5 border-l border-[#2b2340]/80 pl-1.5">
                    {items.map((item) => renderNavItem(item))}
                  </div>
                )}
              </div>
            ))}
      </nav>

      {/* Footer */}
      <div className="p-2.5 border-t border-[#2b2340]">
        {!isCollapsed && (
          <p className="text-[10px] text-[#9d84bf] text-center">
            OctopusTrack v1.0
          </p>
        )}
      </div>
      </aside>
    </>
  )
}
