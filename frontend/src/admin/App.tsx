/**
 * Componente principal de la aplicación admin (superadmin del ERP).
 * Configura providers, rutas y layout para gestión de tenants.
 */
import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'

import { ThemeProvider, useTheme } from '../context/ThemeContext'
import { useAuthStore } from '../stores/authStore'

// Páginas admin con lazy load
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const TenantList = lazy(() => import('./pages/TenantList'))
const TenantDetail = lazy(() => import('./pages/TenantDetail'))
const ArcaManagement = lazy(() => import('./pages/ArcaManagement'))

// Cliente de React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Componente para rutas protegidas
function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="../tenant.html#/login" replace />;
  }

  return <>{children}</>
}

// Skeleton de carga
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  )
}

// Toaster con tema
function ThemedToaster() {
  const { theme } = useTheme()

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: theme === 'dark' ? '#1f2937' : '#ffffff',
          color: theme === 'dark' ? '#f9fafb' : '#111827',
          border: `1px solid ${theme === 'dark' ? '#374151' : '#e5e7eb'}`,
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: theme === 'dark' ? '#1f2937' : '#ffffff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: theme === 'dark' ? '#1f2937' : '#ffffff',
          },
        },
      }}
    />
  )
}

// Sidebar de navegación admin
function AdminSidebar() {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/tenants', label: 'Tenants', icon: '🏢' },
  ]

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <aside className="w-64 min-h-screen bg-gray-900 dark:bg-gray-950 text-white flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Octopus Admin</h1>
        <p className="text-xs text-gray-400 mt-1">Superadministrador</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive(item.path)
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-700">
        <Link
          to="/tenant.html"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <span>🔄</span>
          <span>Ir a Tenant</span>
        </Link>
      </div>
    </aside>
  )
}

// Layout principal del admin
function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <HashRouter>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <Suspense fallback={<PageLoader />}>
                      <AdminDashboard />
                    </Suspense>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/tenants"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <Suspense fallback={<PageLoader />}>
                      <TenantList />
                    </Suspense>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/tenants/:id"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <Suspense fallback={<PageLoader />}>
                      <TenantDetail />
                    </Suspense>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/tenants/:id/arca"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <Suspense fallback={<PageLoader />}>
                      <ArcaManagement />
                    </Suspense>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            {/* Ruta por defecto — redirige al dashboard admin */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <ThemedToaster />
        </HashRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
