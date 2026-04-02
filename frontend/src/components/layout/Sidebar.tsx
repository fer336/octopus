/**
 * Sidebar de navegación principal.
 * Muestra el menú de navegación con iconos.
 */
import { NavLink, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useCurrentCash } from '../../hooks/useCash'
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
}

export default function Sidebar({ isCollapsed = false }: SidebarProps) {
  const location = useLocation()

  const getActiveSection = (pathname: string) =>
    getActiveNavigationItem(pathname)?.section

  const groupedItems = useMemo(() => {
    return navigationSections.map((section) => ({
      section,
      items: navigationItems.filter((item) => item.section === section.key),
    }))
  }, [])

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
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        clsx(
          'flex items-center rounded-md px-2.5 py-1.5 text-[13px] text-gray-300 hover:bg-gray-800 hover:text-white transition-colors',
          isActive && 'bg-gray-800 text-white border-r-4 border-primary-500'
        )
      }
    >
      <item.icon size={17} className="flex-shrink-0" />
      {!isCollapsed && <span className="ml-2 truncate flex-1">{item.label}</span>}
      {item.badge && <CajaBadge />}
    </NavLink>
  )

  return (
    <aside
      className={clsx(
        'h-screen bg-gray-900 text-white flex flex-col transition-all duration-300 flex-shrink-0',
        isCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-3 border-b border-gray-800">
        <img
          src="/octopus-logo-blue.png"
          alt="Octopus"
          className="h-10 w-10 flex-shrink-0 object-contain"
        />
        {!isCollapsed && (
          <span className="ml-2 text-[15px] font-bold truncate">Octopus</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2.5 overflow-y-auto px-2">
        {isCollapsed
          ? navigationItems.map((item) => renderNavItem(item))
            : groupedItems.map(({ section, items }) => (
              <div key={section.key} className="mb-3 last:mb-0">
                <button
                  type="button"
                  onClick={() => setOpenSections((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
                  className={clsx(
                    'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-medium tracking-[0.08em] text-gray-400 transition-all',
                    'hover:bg-gray-800/60 hover:text-gray-200',
                    openSections[section.key] && 'bg-gray-800/40 text-gray-200'
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
                      'flex-shrink-0 text-gray-500 transition-transform duration-200',
                      openSections[section.key] && 'rotate-180 text-gray-300'
                    )}
                  />
                </button>
                {openSections[section.key] && (
                  <div className="mt-1 space-y-0.5 border-l border-gray-800/70 pl-1.5">
                    {items.map((item) => renderNavItem(item))}
                  </div>
                )}
              </div>
            ))}
      </nav>

      {/* Footer */}
      <div className="p-2.5 border-t border-gray-800">
        {!isCollapsed && (
          <p className="text-[10px] text-gray-500 text-center">
            OctopusTrack v1.0
          </p>
        )}
      </div>
    </aside>
  )
}
