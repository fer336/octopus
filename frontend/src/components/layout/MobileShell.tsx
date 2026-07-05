/**
 * Native mobile shell: header (menu, title, AI sparkles, avatar), scrollable
 * content switched by an internal tab, tab bar (5 slots) and overlay hosts
 * (drawer / AI sheet / scanner). Replaces `MobileNav` as the mobile mount
 * point.
 *
 * PR2 wired the Inicio tab to the real `MobileDashboard`. PR3 wired the
 * Productos tab to `MobileProducts` and hosts `ScannerOverlay` here (only
 * reachable from Productos' scan button) — the shell owns `cart` and the
 * scanned-code handoff so both can be wired centrally, same pattern as
 * `handleNavigate`. PR4 wires the Vender tab to `MobileSales` (same lifted
 * `cart`) and the sparkles-triggered AI sheet host to the real
 * `AIAssistantSheet` (replacing the PR1 stub). PR5 wires the Caja tab to the
 * real `MobileCaja` (self-fetching, no lifted state needed). PR6 wires the
 * Cuenta tab to the real `MobileCuenta` (also self-fetching, read-only). PR7
 * wires the drawer-only Comprobantes screen to the real `MobileComprobantes`
 * (also self-fetching, read-only) — it is not one of the 5 bottom tab-bar
 * slots, only reachable from `MobileDrawer`, same as Caja/Cuenta were before
 * PR5/PR6 promoted them to tabs. With this, every screen from the design
 * handoff is wired — no screen still falls through to `MobileStub`.
 */
import { useState } from 'react'
import { Menu, Sparkles, LayoutDashboard, Package, ShoppingCart, Wallet, Users } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import MobileDrawer, { type MobileNavTarget } from './MobileDrawer'
import ScannerOverlay from './ScannerOverlay'
import AIAssistantSheet from './AIAssistantSheet'
import MobileStub from '../../pages/mobile/MobileStub'
import MobileDashboard from '../../pages/mobile/MobileDashboard'
import MobileProducts from '../../pages/mobile/MobileProducts'
import MobileSales, { mergeCartLine } from '../../pages/mobile/MobileSales'
import MobileCaja from '../../pages/mobile/MobileCaja'
import MobileCuenta from '../../pages/mobile/MobileCuenta'
import MobileComprobantes from '../../pages/mobile/MobileComprobantes'
import type { Product } from '../../types'

export interface CartLine {
  code: string
  desc: string
  qty: number
  price: number
  product_id: string
  /** Per-line discount percentage (0-100), mirrors desktop Sales.tsx's per-item `discount` field. */
  discount: number
}

type MobileTab = 'inicio' | 'productos' | 'ventas' | 'caja' | 'cuenta' | 'comprobantes' | 'stub'

interface MobileShellProps {
  currentAccountMode?: 'disabled' | 'automatic' | 'manual'
  priceUpdateEnabled?: boolean
  reportsEnabled?: boolean
  inventoryEnabled?: boolean
  stockpileEnabled?: boolean
  whatsappEnabled?: boolean
  profitabilityEnabled?: boolean
  /** Test-only seam: seeds the lifted cart state. Real screens (PR2-4) add to it via onAddToCart. */
  initialCart?: CartLine[]
}

const TAB_TITLES: Record<Exclude<MobileTab, 'stub'>, string> = {
  inicio: 'Inicio',
  productos: 'Productos',
  ventas: 'Vender',
  caja: 'Caja diaria',
  cuenta: 'Cuenta corriente',
  comprobantes: 'Comprobantes',
}

export default function MobileShell({
  currentAccountMode = 'disabled',
  priceUpdateEnabled = true,
  reportsEnabled = true,
  inventoryEnabled = true,
  stockpileEnabled = true,
  whatsappEnabled = true,
  profitabilityEnabled = true,
  initialCart = [],
}: MobileShellProps) {
  const [tab, setTab] = useState<MobileTab>('inicio')
  const [stubTitle, setStubTitle] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scannedCode, setScannedCode] = useState<{ code: string } | null>(null)
  const [cart, setCart] = useState<CartLine[]>(initialCart)
  const user = useAuthStore((state) => state.user)

  const openStub = (title: string) => {
    setStubTitle(title)
    setTab('stub')
  }

  const handleNavigate = (target: MobileNavTarget) => {
    if (target.screen === 'stub') {
      openStub(target.stubTitle)
    } else {
      setTab(target.screen)
    }
  }

  /** Adds a new line at qty 1, or increments qty by 1 for an existing line with the same code. Reuses `mergeCartLine`, the same reducer `MobileSales` re-tests directly as a pure function (PR4). */
  const handleAddToCart = (line: CartLine) => {
    setCart((prev) => mergeCartLine(prev, line))
  }

  /** Populates Productos' search query with the scanned code and closes the overlay — does NOT auto-add to cart. */
  const handleScanSuccess = (product: Product) => {
    setScannedCode({ code: product.code })
    setScanOpen(false)
  }

  const headerTitle = tab === 'stub' ? stubTitle : TAB_TITLES[tab]
  const avatarInitial = (user?.name || '?').charAt(0).toUpperCase()

  const tabBarItems: Array<{
    key: string
    label: string
    icon: typeof LayoutDashboard
    onClick: () => void
    active: boolean
  }> = [
    {
      key: 'inicio',
      label: 'Inicio',
      icon: LayoutDashboard,
      onClick: () => setTab('inicio'),
      active: tab === 'inicio',
    },
    {
      key: 'productos',
      label: 'Productos',
      icon: Package,
      onClick: () => setTab('productos'),
      active: tab === 'productos',
    },
    {
      key: 'caja',
      label: 'Caja',
      icon: Wallet,
      onClick: () => setTab('caja'),
      active: tab === 'caja',
    },
    {
      key: 'cuenta',
      label: 'Cuenta',
      icon: Users,
      onClick: () => setTab('cuenta'),
      active: tab === 'cuenta',
    },
  ]

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: '#f0f0f2' }}>
      {/* Header */}
      <header
        className="flex flex-none items-center gap-3 px-[18px] pb-3 pt-[26px]"
        style={{ background: 'linear-gradient(140deg, #2f1d4d, #5c3a8c)' }}
      >
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px]"
          style={{ background: 'rgba(255,255,255,.14)' }}
        >
          <Menu size={20} color="#fff" />
        </button>
        <p className="font-display flex-1 truncate text-[18px] font-extrabold leading-tight text-white">
          {headerTitle}
        </p>
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          aria-label="Abrir asistente IA"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px]"
          style={{ background: 'rgba(255,255,255,.14)' }}
        >
          <Sparkles size={20} color="#fff" strokeWidth={1.8} />
        </button>
        <div
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#22c55e)', border: '2px solid rgba(255,255,255,.25)' }}
        >
          {avatarInitial}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {tab === 'inicio' && <MobileDashboard onNavigate={handleNavigate} />}
        {tab === 'productos' && (
          <MobileProducts
            cart={cart}
            onAddToCart={handleAddToCart}
            onOpenScanner={() => setScanOpen(true)}
            scannedCode={scannedCode}
          />
        )}
        {tab === 'ventas' && (
          <MobileSales cart={cart} setCart={setCart} onNavigateToProductos={() => setTab('productos')} />
        )}
        {tab === 'caja' && <MobileCaja />}
        {tab === 'cuenta' && <MobileCuenta />}
        {tab === 'comprobantes' && <MobileComprobantes />}
        {tab === 'stub' && <MobileStub stubTitle={stubTitle} />}
      </main>

      {/* Tab bar */}
      <nav
        className="flex flex-none items-end px-1.5 pb-6 pt-2"
        style={{ background: 'rgba(255,255,255,.92)', borderTop: '1px solid #e7e0f2' }}
        aria-label="Navegación principal"
      >
        {tabBarItems.slice(0, 2).map(({ key, label, icon: Icon, onClick, active }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            aria-label={label}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-1"
          >
            <Icon size={23} color={active ? '#7c5ca8' : '#a59fb5'} />
            <span className="text-[10px] font-semibold" style={{ color: active ? '#7c5ca8' : '#a59fb5' }}>
              {label}
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setTab('ventas')}
          aria-label="Vender"
          className="relative flex flex-1 flex-col items-center justify-center gap-1 pb-1"
        >
          <div
            className="relative -mt-[22px] flex h-[54px] w-[54px] items-center justify-center rounded-2xl border-[3px] border-white"
            style={{
              background: 'linear-gradient(140deg,#5c3a8c,#7c5ca8)',
              boxShadow: '0 8px 18px rgba(92,58,140,.35)',
            }}
          >
            <ShoppingCart size={25} color="#fff" strokeWidth={2.2} />
            {cart.length > 0 && (
              <span
                data-testid="cart-badge"
                className="absolute -right-1.5 -top-1.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-white px-1 text-[11px] font-extrabold text-white"
                style={{ background: '#dc2626' }}
              >
                {cart.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold" style={{ color: tab === 'ventas' ? '#7c5ca8' : '#a59fb5' }}>
            Vender
          </span>
        </button>

        {tabBarItems.slice(2).map(({ key, label, icon: Icon, onClick, active }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            aria-label={label}
            className="flex flex-1 flex-col items-center justify-center gap-1 py-1"
          >
            <Icon size={23} color={active ? '#7c5ca8' : '#a59fb5'} />
            <span className="text-[10px] font-semibold" style={{ color: active ? '#7c5ca8' : '#a59fb5' }}>
              {label}
            </span>
          </button>
        ))}
      </nav>

      {/* Overlay hosts */}
      <MobileDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={handleNavigate}
        currentAccountMode={currentAccountMode}
        priceUpdateEnabled={priceUpdateEnabled}
        reportsEnabled={reportsEnabled}
        inventoryEnabled={inventoryEnabled}
        stockpileEnabled={stockpileEnabled}
        whatsappEnabled={whatsappEnabled}
        profitabilityEnabled={profitabilityEnabled}
      />

      <ScannerOverlay open={scanOpen} onClose={() => setScanOpen(false)} onAddProduct={handleScanSuccess} />

      <AIAssistantSheet open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  )
}
