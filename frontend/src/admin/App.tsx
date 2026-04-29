/**
 * Componente principal de la aplicación admin (superadmin del ERP).
 * Configura providers, rutas y layout para gestión de tenants.
 */
import { lazy, Suspense, type ReactNode, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { Menu, X } from 'lucide-react'

import { ThemeProvider, useTheme } from '../context/ThemeContext'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../stores/authStore'

// Páginas admin con lazy load
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const TenantList = lazy(() => import('./pages/TenantList'))
const TenantDetail = lazy(() => import('./pages/TenantDetail'))
const ArcaManagement = lazy(() => import('./pages/ArcaManagement'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const FeedbackInbox = lazy(() => import('./pages/FeedbackInbox'))
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const AdminAuthCallback = lazy(() => import('./pages/AdminAuthCallback'))

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
  const user = useAuthStore((state) => state.user)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.platform_role !== 'superadmin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full rounded-xl border border-red-200 bg-white p-8 text-center shadow-lg dark:border-red-900/40 dark:bg-gray-800">
          <h2 className="text-xl font-semibold text-red-700 dark:text-red-400">
            Acceso denegado
          </h2>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Tu cuenta no tiene permisos de superadministrador para ingresar al panel admin.
          </p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Iniciá sesión con una cuenta habilitada o contactá al equipo técnico.
          </p>
        </div>
      </div>
    )
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
function AdminSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/tenants', label: 'Tenants', icon: '🏢' },
    { path: '/users', label: 'Usuarios', icon: '👤' },
    { path: '/feedback', label: 'Feedback', icon: '🧩' },
  ]

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-label="Cerrar menú de administración"
          onClick={onClose}
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 min-h-screen bg-gray-900 dark:bg-gray-950 text-white flex flex-col transform transition-transform duration-300 lg:static lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Octopus Admin</h1>
        <p className="text-xs text-gray-400 mt-1">Superadministrador</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClose}
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
      </aside>
    </>
  )
}

// Layout principal del admin
function AdminLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-100 dark:bg-gray-900">
      <AdminSidebar isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="flex-1 min-w-0 overflow-auto">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 lg:hidden">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex items-center rounded-md p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              aria-label="Abrir menú"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Panel Admin</p>
            <div className="w-8" />
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}

export default function App() {
  useAuth()

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <HashRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <Suspense fallback={<PageLoader />}>
                  <AdminLogin />
                </Suspense>
              }
            />
            <Route
              path="/auth/callback"
              element={
                <Suspense fallback={<PageLoader />}>
                  <AdminAuthCallback />
                </Suspense>
              }
            />

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
            <Route
              path="/users"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <Suspense fallback={<PageLoader />}>
                      <UsersPage />
                    </Suspense>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/feedback"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <Suspense fallback={<PageLoader />}>
                      <FeedbackInbox />
                    </Suspense>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            {/* Ruta por defecto — redirige al login admin */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>

          <ThemedToaster />
        </HashRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
