import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, BarChart3, Menu } from 'lucide-react'
import { clsx } from 'clsx'
import { useCurrentCash } from '../../hooks/useCash'
import { useAuthStore } from '../../stores/authStore'
import { hasPathAccess } from '../../utils/acl'
import { navigationItems, navigationSections } from './navigationItems'

function useCajaBadge(): boolean {
  const { data: cash } = useCurrentCash()
  if (!cash) return false
  return cash.status === 'OPEN' || cash.is_expired
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  manager: 'Gerente',
  seller: 'Vendedor',
}

const TAB_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Inicio', needsReports: false },
  { path: '/sales', icon: ShoppingCart, label: 'Ventas', needsReports: false },
  { path: '/products', icon: Package, label: 'Catálogo', needsReports: false },
  { path: '/reports', icon: BarChart3, label: 'Análisis', needsReports: true },
]

interface MobileNavProps {
  currentAccountMode?: 'disabled' | 'automatic' | 'manual'
  priceUpdateEnabled?: boolean
  reportsEnabled?: boolean
  inventoryEnabled?: boolean
  stockpileEnabled?: boolean
}

export default function MobileNav({
  currentAccountMode = 'disabled',
  priceUpdateEnabled = true,
  reportsEnabled = true,
  inventoryEnabled = true,
  stockpileEnabled = true,
}: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const hasBadge = useCajaBadge()
  const touchStartY = useRef<number | null>(null)

  useEffect(() => {
    setSheetOpen(false)
  }, [location.pathname])

  const currentAccountEnabled = currentAccountMode !== 'disabled'

  const visibleItems = navigationItems.filter((item) => {
    if (item.path === '/current-account' && !currentAccountEnabled) return false
    if (item.path === '/price-update' && !priceUpdateEnabled) return false
    if (item.path === '/reports' && !reportsEnabled) return false
    if (item.path === '/inventory' && !inventoryEnabled) return false
    if (item.path === '/stockpiles' && !stockpileEnabled) return false
    return hasPathAccess(user, item.path)
  })

  const groupedItems = navigationSections.map((section) => ({
    section,
    items: visibleItems.filter((item) => item.section === section.key),
  }))

  const isTabActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const delta = e.changedTouches[0].clientY - touchStartY.current
    if (delta > 60) setSheetOpen(false)
    touchStartY.current = null
  }

  return (
    <>
      {/* Overlay */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[150]"
          style={{ background: 'rgba(10,6,28,0.72)' }}
          onClick={() => setSheetOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom Sheet */}
      <div
        className={clsx(
          'fixed left-0 right-0 z-[200] overflow-y-auto transition-transform duration-300 ease-out',
          sheetOpen ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{
          bottom: '54px',
          maxHeight: 'calc(100vh - 120px)',
          background: '#1e1540',
          borderRadius: '18px 18px 0 0',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-hidden={!sheetOpen}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* User header */}
        {user && (
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="h-9 w-9 flex-shrink-0 rounded-full" />
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              {user.membership_role && (
                <p className="text-xs" style={{ color: '#a78bfa' }}>
                  {ROLE_LABELS[user.membership_role] ?? user.membership_role}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Nav sections in 2-col grid */}
        <div className="px-3 pb-4 pt-3">
          {groupedItems.map(({ section, items }) => {
            if (items.length === 0) return null
            return (
              <div key={section.key} className="mb-4">
                <p
                  className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: '#5a4e8a' }}
                >
                  {section.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map((item) => {
                    const active = isTabActive(item.path)
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/'}
                        className={clsx(
                          'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors',
                          !active && 'hover:bg-white/5'
                        )}
                        style={{
                          color: active ? '#ffffff' : '#c4b5f4',
                          background: active ? 'rgba(124,58,237,0.35)' : undefined,
                        }}
                      >
                        <item.icon size={16} className="flex-shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tab Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[250] flex items-stretch"
        style={{ height: '54px', background: '#1a1035' }}
        aria-label="Navegación principal"
      >
        {TAB_ITEMS.map(({ path, icon: Icon, label, needsReports }) => {
          if (needsReports && !reportsEnabled) return null
          const active = isTabActive(path)
          return (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className="relative flex flex-1 flex-col items-center justify-center"
            >
              {active && (
                <span
                  className="absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full"
                  style={{ background: '#a78bfa' }}
                />
              )}
              <Icon size={22} style={{ color: active ? '#a78bfa' : '#5a4e8a' }} />
              <span
                className="mt-0.5 text-[10px] font-medium"
                style={{ color: active ? '#a78bfa' : '#5a4e8a' }}
              >
                {label}
              </span>
            </NavLink>
          )
        })}

        {/* More tab */}
        <button
          type="button"
          onClick={() => setSheetOpen((prev) => !prev)}
          className="relative flex flex-1 flex-col items-center justify-center"
          aria-expanded={sheetOpen}
          aria-label="Abrir menú completo"
        >
          {sheetOpen && (
            <span
              className="absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full"
              style={{ background: '#a78bfa' }}
            />
          )}
          <span className="relative">
            <Menu size={22} style={{ color: sheetOpen ? '#a78bfa' : '#5a4e8a' }} />
            {hasBadge && !sheetOpen && (
              <span
                className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full"
                style={{ background: '#f59e0b' }}
              />
            )}
          </span>
          <span
            className="mt-0.5 text-[10px] font-medium"
            style={{ color: sheetOpen ? '#a78bfa' : '#5a4e8a' }}
          >
            Más
          </span>
        </button>
      </nav>
    </>
  )
}
