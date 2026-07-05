/**
 * Native mobile Productos screen: search + category filter (server-side,
 * via the same `productsService.getAll`/`categoriesService.getAll` desktop
 * already uses), product list with a "Stock bajo" badge, and add-to-cart.
 *
 * `onAddToCart` always emits a qty:1 delta line — the cart owner
 * (`MobileShell`) is responsible for merging it into an existing line for
 * the same product code or pushing a new one. This screen never inspects
 * its own `cart` prop to decide the emitted qty; it only uses it as
 * read-only context should the UI need it later (e.g. a checkmark on
 * already-added rows).
 *
 * The scan button doesn't own the scanner overlay itself — it's hosted at
 * the shell level (`MobileShell`, only reachable from this screen). Tapping
 * it calls `onOpenScanner`. When a scan succeeds, the shell forwards the
 * scanned code back down via the `scannedCode` prop, which this screen uses
 * to populate its search box (reusing the existing search-filter behavior,
 * no new matching logic) — it intentionally does NOT auto-add to cart.
 */
import { useEffect, useState } from 'react'
import { Search, ScanLine, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import productsService from '../../api/productsService'
import categoriesService from '../../api/categoriesService'
import type { CartLine } from '../../components/layout/MobileShell'

interface MobileProductsProps {
  cart: CartLine[]
  onAddToCart: (line: CartLine) => void
  onOpenScanner: () => void
  /** Set by MobileShell after a successful scan; new object identity on every scan so repeat scans of the same code still apply. */
  scannedCode?: { code: string } | null
}

const STOCK_LOW_THRESHOLD = 12

export default function MobileProducts({ cart: _cart, onAddToCart, onOpenScanner, scannedCode }: MobileProductsProps) {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (scannedCode) setSearch(scannedCode.code)
  }, [scannedCode])

  const { data: categories } = useQuery({
    queryKey: ['mobile-products-categories'],
    queryFn: () => categoriesService.getAll(),
    retry: false,
  })

  const { data } = useQuery({
    queryKey: ['mobile-products', search, categoryId],
    queryFn: () =>
      productsService.getAll({
        search: search || undefined,
        category_id: categoryId,
        per_page: 50,
      }),
    retry: false,
  })

  const products = data?.items ?? []

  return (
    <div className="px-4 pb-[110px] pt-4">
      <div className="flex gap-[9px]">
        <div className="flex h-[46px] flex-1 items-center gap-2 rounded-[13px] border border-[#ece6f6] bg-white px-3">
          <Search size={18} color="#9089a0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código o descripción"
            className="flex-1 border-none bg-transparent text-sm text-[#121325] outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onOpenScanner}
          aria-label="Abrir escáner"
          className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px]"
          style={{ background: 'linear-gradient(140deg,#5c3a8c,#7c5ca8)', boxShadow: '0 6px 14px rgba(92,58,140,.35)' }}
        >
          <ScanLine size={22} color="#fff" />
        </button>
      </div>

      <div className="mt-3.5 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategoryId(undefined)}
          className="flex-none rounded-full px-[13px] py-[7px] text-[10.5px] font-semibold"
          style={{
            background: categoryId === undefined ? '#7c5ca8' : '#fff',
            color: categoryId === undefined ? '#fff' : '#5b5570',
            border: '1px solid #ece6f6',
          }}
        >
          Todas
        </button>
        {(categories ?? []).map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryId(category.id)}
            className="flex-none rounded-full px-[13px] py-[7px] text-[10.5px] font-semibold"
            style={{
              background: categoryId === category.id ? '#7c5ca8' : '#fff',
              color: categoryId === category.id ? '#fff' : '#5b5570',
              border: '1px solid #ece6f6',
            }}
          >
            {category.name}
          </button>
        ))}
      </div>

      <p className="my-3 text-xs text-[#9089a0]">{products.length} productos</p>

      <div className="flex flex-col gap-[9px]">
        {products.map((product) => {
          const stockLow = product.current_stock < STOCK_LOW_THRESHOLD
          const brand = product.brand_name || product.brand || '—'
          return (
            <div
              key={product.id}
              data-testid="product-card"
              className="flex items-center gap-3 rounded-[15px] border border-[#ece6f6] bg-white p-[13px]"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-[3px] flex items-center gap-[7px]">
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
                    style={{ color: '#7c5ca8', background: '#ece6f6' }}
                  >
                    {product.code}
                  </span>
                  {stockLow && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ color: '#f97316', background: '#fff3e8' }}
                    >
                      Stock bajo
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] font-semibold leading-tight text-[#121325]">{product.description}</p>
                <p className="mt-[3px] text-[11.5px] text-[#9089a0]">
                  {brand} · Stock {product.current_stock} · Lista ${product.list_price.toLocaleString('es-AR')}
                </p>
              </div>
              <div className="flex flex-none flex-col items-end gap-[7px]">
                <p className="font-display text-base font-extrabold text-[#121325]">
                  ${product.sale_price.toLocaleString('es-AR')}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    onAddToCart({
                      code: product.code,
                      desc: product.description,
                      // NET price, not the gross `sale_price` shown above on
                      // this card. `sale_price` already includes IVA
                      // (sale_price = net_price * 1.21, see desktop
                      // Sales.tsx's own comment ~line 2993) — the cart's
                      // `price` must be net so MobileSales' `calculateTotals`
                      // (subtotal → +21% IVA → total) and the `unit_price`
                      // sent to `vouchersService.create()` aren't
                      // double-taxed. Matches desktop's `effectiveNetPrice`
                      // (Sales.tsx:1687-1690, "Enviamos el precio SIN IVA
                      // para que el backend calcule el IVA correctamente").
                      qty: 1,
                      price: product.net_price,
                      product_id: product.id,
                      discount: 0,
                    })
                  }
                  aria-label={`Agregar ${product.description} al carrito`}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px]"
                  style={{ background: '#7c5ca8', boxShadow: '0 4px 10px rgba(92,58,140,.35)' }}
                >
                  <Plus size={18} color="#fff" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
