import { ShoppingCart, Wallet, FileText, Package, ClipboardList, X, type LucideIcon } from 'lucide-react'

export type MobileTab = 'ventas' | 'caja' | 'comprobantes' | 'productos' | 'cuenta'

const DRAWER_ITEMS: Array<{
  tab: MobileTab
  label: string
  icon: LucideIcon
}> = [
  { tab: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { tab: 'caja', label: 'Caja', icon: Wallet },
  { tab: 'comprobantes', label: 'Comprobantes', icon: FileText },
  { tab: 'productos', label: 'Productos', icon: Package },
  { tab: 'cuenta', label: 'Cuenta Corriente', icon: ClipboardList },
]

interface MobileDrawerProps {
  open: boolean
  activeTab: MobileTab
  onClose: () => void
  onNavigate: (tab: MobileTab) => void
}

export default function MobileDrawer({ open, activeTab, onClose, onNavigate }: MobileDrawerProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[300] flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(7,7,15,.5)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative flex h-full w-[270px] max-w-[80%] flex-col"
        style={{
          background: 'linear-gradient(168deg, #2f1d4d, #150e29)',
          boxShadow: '14px 0 40px rgba(0,0,0,.4)',
        }}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-[18px] pb-3 pt-7">
          <div className="h-7 w-7 rounded-lg bg-white/20" />
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

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-2.5 pb-2 text-[10.5px] font-bold uppercase tracking-widest text-white/40">
            Módulos
          </p>
          {DRAWER_ITEMS.map(({ tab, label, icon: Icon }) => {
            const active = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  onNavigate(tab)
                  onClose()
                }}
                aria-current={active ? 'page' : undefined}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left"
                style={{
                  background: active ? 'rgba(255,255,255,.14)' : 'transparent',
                  color: active ? '#ffffff' : '#c4b5f4',
                }}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1 text-sm font-semibold">{label}</span>
                {active && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#9d84bf' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
