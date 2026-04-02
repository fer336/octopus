import {
  BarChart3,
  ClipboardList,
  FileText,
  FolderTree,
  LayoutDashboard,
  Package,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavigationItem {
  path: string
  icon: LucideIcon
  label: string
  section: 'inicio' | 'ventas' | 'catalogo' | 'contactos' | 'analisis'
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
  { key: 'analisis', label: 'Analisis', icon: BarChart3 },
]

export const navigationItems: NavigationItem[] = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', section: 'inicio' },
  { path: '/sales', icon: ShoppingCart, label: 'Ventas', section: 'ventas' },
  { path: '/comprobantes', icon: FileText, label: 'Comprobantes', section: 'ventas' },
  { path: '/caja', icon: Wallet, label: 'Caja', section: 'ventas', badge: true },
  { path: '/products', icon: Package, label: 'Productos', section: 'catalogo' },
  { path: '/price-update', icon: TrendingUp, label: 'Actualizar Precios', section: 'catalogo' },
  { path: '/inventory', icon: ClipboardList, label: 'Inventario', section: 'catalogo' },
  { path: '/clients', icon: Users, label: 'Clientes', section: 'contactos' },
  { path: '/suppliers', icon: Truck, label: 'Proveedores', section: 'contactos' },
  { path: '/categories', icon: FolderTree, label: 'Categorias', section: 'contactos' },
  { path: '/reports', icon: BarChart3, label: 'Reportes', section: 'analisis' },
]
