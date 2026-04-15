import type { User } from '../stores/authStore'

export const MODULE_ROUTE_MAP: Record<string, string> = {
  '/': 'dashboard',
  '/sales': 'sales',
  '/comprobantes': 'vouchers',
  '/payment-methods': 'payment_methods',
  '/caja': 'cash',
  '/products': 'products',
  '/price-update': 'price_update',
  '/inventory': 'inventory',
  '/clients': 'clients',
  '/suppliers': 'suppliers',
  '/categories': 'categories',
  '/reports': 'reports',
  '/feedback': 'feedback',
  '/current-account': 'current_account',
}

function getModuleForPath(pathname: string): string | null {
  const sortedPaths = Object.keys(MODULE_ROUTE_MAP).sort((a, b) => b.length - a.length)

  for (const path of sortedPaths) {
    if (path === '/') {
      if (pathname === '/') return MODULE_ROUTE_MAP[path]
      continue
    }

    if (pathname === path || pathname.startsWith(`${path}/`)) {
      return MODULE_ROUTE_MAP[path]
    }
  }

  return null
}

export function hasModuleAccess(user: User | null, moduleKey: string): boolean {
  if (!user) return false
  if (user.platform_role === 'superadmin') return true

  const permissions = user.module_permissions
  if (!permissions || Object.keys(permissions).length === 0) {
    return true
  }

  return Boolean(permissions[moduleKey])
}

export function hasPathAccess(user: User | null, pathname: string): boolean {
  const moduleKey = getModuleForPath(pathname)
  if (!moduleKey) {
    return true
  }
  return hasModuleAccess(user, moduleKey)
}
