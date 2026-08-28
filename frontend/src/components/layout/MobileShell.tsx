import { useState } from 'react'
import { ShoppingCart, Wallet, FileText, Package, ClipboardList } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import MobileProducts from '../../pages/mobile/MobileProducts'
import MobileSales, { mergeCartLine } from '../../pages/mobile/MobileSales'
import MobileCaja from '../../pages/mobile/MobileCaja'
import MobileCuenta from '../../pages/mobile/MobileCuenta'
import MobileComprobantes from '../../pages/mobile/MobileComprobantes'
import ScannerOverlay from './ScannerOverlay'
import type { Product } from '../../types'

export interface CartLine {
  code: string
  desc: string
  qty: number
  price: number
  product_id: string
  discount: number
}

type MobileTab = 'ventas' | 'caja' | 'comprobantes' | 'productos' | 'cuenta'

interface MobileShellProps {
  currentAccountMode?: 'disabled' | 'automatic' | 'manual'
  whatsappEnabled?: boolean
  initialCart?: CartLine[]
}

const TAB_ITEMS: Array<{
  key: MobileTab
  label: string
  icon: typeof ShoppingCart
}> = [
  { key: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { key: 'caja', label: 'Caja', icon: Wallet },
  { key: 'comprobantes', label: 'Comprobantes', icon: FileText },
  { key: 'productos', label: 'Productos', icon: Package },
  { key: 'cuenta', label: 'Cta Cte', icon: ClipboardList },
]

const TAB_TITLES: Record<MobileTab, string> = {
  ventas: 'Ventas',
  caja: 'Caja',
  comprobantes: 'Comprobantes',
  productos: 'Productos',
  cuenta: 'Cuenta Corriente',
}

export default function MobileShell({
  whatsappEnabled = true,
  initialCart = [],
}: MobileShellProps) {
  const [tab, setTab] = useState<MobileTab>('ventas')
  const [scanOpen, setScanOpen] = useState(false)
  const [scannedCode, setScannedCode] = useState<{ code: string } | null>(null)
  const [cart, setCart] = useState<CartLine[]>(initialCart)
  const user = useAuthStore((state) => state.user)

  const handleAddToCart = (line: CartLine) => {
    setCart((prev) => mergeCartLine(prev, line))
  }

  const handleScanSuccess = (product: Product) => {
    setScannedCode({ code: product.code })
    setScanOpen(false)
  }

  const avatarInitial = (user?.name || '?').charAt(0).toUpperCase()

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: '#f0f0f2' }}>
      <header
        className="flex flex-none items-center gap-3 px-[18px] pb-3 pt-[26px]"
        style={{ background: 'linear-gradient(140deg, #2f1d4d, #5c3a8c)' }}
      >
        <p className="font-display flex-1 truncate text-[18px] font-extrabold leading-tight text-white">
          {TAB_TITLES[tab]}
        </p>
        <div
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#3b82f6,#22c55e)', border: '2px solid rgba(255,255,255,.25)' }}
        >
          {avatarInitial}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
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
        {tab === 'comprobantes' && <MobileComprobantes whatsappEnabled={whatsappEnabled} />}
      </main>

      <nav
        className="flex flex-none items-end px-1.5 pb-6 pt-2"
        style={{ background: 'rgba(255,255,255,.92)', borderTop: '1px solid #e7e0f2' }}
        aria-label="Navegación principal"
      >
        {TAB_ITEMS.map(({ key, label, icon: Icon }) => {
          const active = tab === key
          const showBadge = key === 'ventas' && cart.length > 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-label={label}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-1"
            >
              <div className="relative">
                <Icon size={23} color={active ? '#7c5ca8' : '#a59fb5'} />
                {showBadge && (
                  <span
                    data-testid="cart-badge"
                    className="absolute -right-2 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-extrabold text-white"
                    style={{ background: '#dc2626' }}
                  >
                    {cart.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold" style={{ color: active ? '#7c5ca8' : '#a59fb5' }}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      <ScannerOverlay open={scanOpen} onClose={() => setScanOpen(false)} onAddProduct={handleScanSuccess} />
    </div>
  )
}
