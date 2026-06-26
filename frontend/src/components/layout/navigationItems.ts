import {
  Archive,
  BarChart3,
  ClipboardList,
  CreditCard,
  FileText,
  FolderTree,
  LayoutDashboard,
  List,
  Package,
  ShoppingCart,
  Store,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  MessageSquare,
  MessagesSquare,
  Tags,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavigationItem {
  path: string
  icon: LucideIcon
  label: string
  section: 'inicio' | 'ventas' | 'catalogo' | 'contactos' | 'comunicaciones' | 'analisis'
  badge?: boolean
}

export interface NavigationSection {
  key: NavigationItem['section']
  label: string
  icon: LucideIcon
}

export const navigationSections: NavigationSection[] = [
  { key: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { key: 'ventas', label: 'Ventas y Caja', icon: ShoppingCart },
  { key: 'catalogo', label: 'Catalogo e Inventario', icon: Package },
  { key: 'contactos', label: 'Contactos y Categorias', icon: Users },
  { key: 'comunicaciones', label: 'Comunicaciones', icon: MessagesSquare },
  { key: 'analisis', label: 'Analisis', icon: BarChart3 },
]

export const navigationItems: NavigationItem[] = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'inicio' },
  { path: '/sales', icon: ShoppingCart, label: 'Ventas', section: 'ventas' },
  { path: '/comprobantes', icon: FileText, label: 'Comprobantes', section: 'ventas' },
  { path: '/payment-methods', icon: CreditCard, label: 'Métodos de Pago', section: 'ventas' },
  { path: '/caja', icon: Wallet, label: 'Caja', section: 'ventas', badge: true },
  { path: '/current-account', icon: ClipboardList, label: 'Cuenta Corriente', section: 'ventas' },
  { path: '/stockpiles', icon: Archive, label: 'Acopios', section: 'ventas' },
  { path: '/products', icon: Package, label: 'Productos', section: 'catalogo' },
  { path: '/price-update', icon: TrendingUp, label: 'Actualizar Precios', section: 'catalogo' },
  { path: '/price-lists', icon: List, label: 'L.Precios Cta. Cte.', section: 'catalogo' },
  { path: '/wholesale-lists', icon: List, label: 'L.Precios Mayoristas', section: 'catalogo' },
  { path: '/inventory', icon: ClipboardList, label: 'Inventario', section: 'catalogo' },
  { path: '/mercadolibre', icon: Store, label: 'Mercado Libre', section: 'catalogo' },
  { path: '/clients', icon: Users, label: 'Clientes', section: 'contactos' },
  { path: '/suppliers', icon: Truck, label: 'Proveedores', section: 'contactos' },
  { path: '/categories', icon: FolderTree, label: 'Categorias', section: 'contactos' },
  { path: '/brands', icon: Tags, label: 'Marcas', section: 'contactos' },
  { path: '/messaging', icon: MessagesSquare, label: 'WhatsApp CRM', section: 'comunicaciones' },
  { path: '/reports', icon: BarChart3, label: 'Reportes', section: 'analisis' },
  { path: '/rentabilidad', icon: TrendingUp, label: 'Rentabilidad', section: 'analisis' },
  { path: '/feedback', icon: MessageSquare, label: 'Feedback', section: 'analisis' },
]

export function getActiveNavigationItem(pathname: string): NavigationItem | undefined {
  return navigationItems.find((item) => {
    if (item.path === '/') {
      return pathname === '/'
    }

    return pathname.startsWith(item.path)
  })
}
