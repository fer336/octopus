/**
 * Side drawer for the mobile shell — full module parity with the desktop
 * Sidebar. Groups the same `navigationItems`/`navigationSections` used on
 * desktop, filtered by feature flags + `hasPathAccess`, exactly mirroring
 * `MobileNav`'s former filter logic.
 */
import { useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../../stores/authStore'
import { hasPathAccess } from '../../utils/acl'
import { navigationItems, navigationSections, type NavigationItem } from './navigationItems'

export type MobileNavTarget =
  | { screen: 'inicio' | 'productos' | 'ventas' | 'caja' | 'cuenta' }
  | { screen: 'stub'; stubTitle: string }

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  onNavigate: (target: MobileNavTarget) => void
  currentAccountMode?: 'disabled' | 'automatic' | 'manual'
  priceUpdateEnabled?: boolean
  reportsEnabled?: boolean
  inventoryEnabled?: boolean
  stockpileEnabled?: boolean
  whatsappEnabled?: boolean
  profitabilityEnabled?: boolean
}

function targetForItem(item: NavigationItem): MobileNavTarget {
  if (item.path === '/') return { screen: 'inicio' }
  if (item.path === '/products') return { screen: 'productos' }
  if (item.path === '/sales') return { screen: 'ventas' }
  if (item.path === '/caja') return { screen: 'caja' }
  return { screen: 'stub', stubTitle: item.label }
}

export default function MobileDrawer({
  open,
  onClose,
  onNavigate,
  currentAccountMode = 'disabled',
  priceUpdateEnabled = true,
  reportsEnabled = true,
  inventoryEnabled = true,
  stockpileEnabled = true,
  whatsappEnabled = true,
  profitabilityEnabled = true,
}: MobileDrawerProps) {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)

  if (!open) return null

  const currentAccountEnabled = currentAccountMode !== 'disabled'

  const visibleItems = navigationItems.filter((item) => {
    if (item.path === '/current-account' && !currentAccountEnabled) return false
    if (item.path === '/price-update' && !priceUpdateEnabled) return false
    if (item.path === '/reports' && !reportsEnabled) return false
    if (item.path === '/inventory' && !inventoryEnabled) return false
    if (item.path === '/stockpiles' && !stockpileEnabled) return false
    if (item.path === '/messaging' && !whatsappEnabled) return false
    if (item.path === '/rentabilidad' && !profitabilityEnabled) return false
    return hasPathAccess(user, item.path)
  })

  const groupedItems = navigationSections.map((section) => ({
    section,
    items: visibleItems.filter((item) => item.section === section.key),
  }))

  const isItemActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  const handleItemClick = (item: NavigationItem) => {
    onNavigate(targetForItem(item))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] flex" role="dialog" aria-modal="true">
      <div
        data-testid="mobile-drawer-backdrop"
        className="absolute inset-0"
        style={{ background: 'rgba(7,7,15,.5)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative flex h-full w-[298px] max-w-[84%] flex-col"
        style={{
          background: 'linear-gradient(168deg, #2f1d4d, #150e29)',
          boxShadow: '14px 0 40px rgba(0,0,0,.4)',
        }}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-[18px] pb-4 pt-14">
          <img src="/images/logos/logo-header@2x.png" alt="" className="h-[34px] w-[34px] object-contain" />
          <div className="flex-1">
            <p className="font-display text-lg font-extrabold text-white">OctopusTrack</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white/10"
          >
            <X size={16} color="#fff" strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {groupedItems.map(({ section, items }) => {
            if (items.length === 0) return null
            return (
              <div key={section.key} className="mb-1">
                <p className="px-2.5 pb-1.5 pt-3.5 text-[10.5px] font-bold uppercase tracking-widest text-white/40">
                  {section.label}
                </p>
                {items.map((item) => {
                  const active = isItemActive(item.path)
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => handleItemClick(item)}
                      aria-current={active ? 'page' : undefined}
                      className={clsx(
                        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left',
                        !active && 'hover:bg-white/5'
                      )}
                      style={{
                        background: active ? 'rgba(255,255,255,.14)' : undefined,
                        color: active ? '#ffffff' : '#c4b5f4',
                      }}
                    >
                      <item.icon size={18} className="flex-shrink-0" />
                      <span className="flex-1 text-sm font-semibold">{item.label}</span>
                      {active && (
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#9d84bf' }} />
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
