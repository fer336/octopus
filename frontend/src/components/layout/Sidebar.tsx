/**
 * Sidebar de navegación principal.
 * Muestra el menú de navegación con iconos.
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  FolderTree,
  FileText,
  BarChart3,
  Settings,
  TrendingUp,
} from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/sales', icon: ShoppingCart, label: 'Ventas' },
  { path: '/comprobantes', icon: FileText, label: 'Comprobantes' },
  { path: '/products', icon: Package, label: 'Productos' },
  { path: '/price-update', icon: TrendingUp, label: 'Actualizar Precios' },
  { path: '/clients', icon: Users, label: 'Clientes' },
  { path: '/suppliers', icon: Truck, label: 'Proveedores' },
  { path: '/categories', icon: FolderTree, label: 'Categorías' },
  { path: '/reports', icon: BarChart3, label: 'Reportes' },
  { path: '/settings', icon: Settings, label: 'Configuración' },
]

interface SidebarProps {
  isCollapsed?: boolean
  onToggle?: () => void
}

export default function Sidebar({ isCollapsed = false }: SidebarProps) {
  return (
    <aside
      className={clsx(
        'h-screen bg-gray-900 text-white flex flex-col transition-all duration-300 flex-shrink-0',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-gray-800">
        <img
          src="/octopus-logo.png"
          alt="Octopus"
          className="h-14 w-14 flex-shrink-0 object-contain"
          style={{ filter: 'brightness(0) saturate(100%) invert(47%) sepia(96%) saturate(2679%) hue-rotate(198deg) brightness(98%) contrast(101%)' }}
        />
        {!isCollapsed && (
          <span className="ml-3 text-xl font-bold truncate">Octopus</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors',
                isActive &&
                  'bg-gray-800 text-white border-r-4 border-primary-500'
              )
            }
          >
            <item.icon size={20} className="flex-shrink-0" />
            {!isCollapsed && <span className="ml-3 truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        {!isCollapsed && (
          <p className="text-xs text-gray-500 text-center">
            OctopusTrack v1.0
          </p>
        )}
      </div>
    </aside>
  )
}
