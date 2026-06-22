/**
 * Componente principal de la aplicación tenant (ERP para usuarios de negocio).
 * Configura providers, rutas y layout.
 */
import { lazy, Suspense, Component, type ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'

import { ThemeProvider, useTheme } from '../context/ThemeContext'
import { useAuthStore } from '../stores/authStore'
import MainLayout from '../components/layout/MainLayout'

// Páginas públicas (carga inmediata — necesarias antes de auth)
import Login from '../pages/Login'
import AuthCallback from '../pages/AuthCallback'
import SubscriptionExpiredPage from '../pages/SubscriptionExpiredPage'

// Páginas protegidas con lazy load — cada una genera su propio chunk
// El browser solo descarga el código cuando el usuario navega a esa ruta
const Dashboard  = lazy(() => import('../pages/Dashboard'))
const Sales      = lazy(() => import('../pages/Sales'))
const Products   = lazy(() => import('../pages/Products'))
const PriceUpdate = lazy(() => import('../pages/PriceUpdate'))
const Clients    = lazy(() => import('../pages/Clients'))
const Suppliers  = lazy(() => import('../pages/Suppliers'))
const Categories = lazy(() => import('../pages/Categories'))
const Vouchers   = lazy(() => import('../pages/Vouchers'))
const PaymentMethods = lazy(() => import('../pages/PaymentMethods'))
const Reports    = lazy(() => import('../pages/Reports'))
const Cash       = lazy(() => import('../pages/Cash'))
const Inventory  = lazy(() => import('../pages/Inventory'))
const Feedback   = lazy(() => import('../pages/Feedback'))
const CurrentAccount = lazy(() => import('../pages/CurrentAccount'))
const Stockpiles  = lazy(() => import('../pages/Stockpiles'))
const Messaging   = lazy(() => import('../pages/Messaging'))
const Settings    = lazy(() => import('../pages/Settings'))
const Brands        = lazy(() => import('../pages/Brands'))
const PriceLists    = lazy(() => import('../pages/PriceLists'))
const WholesalePriceLists = lazy(() => import('../pages/WholesalePriceLists'))
const MercadoLibre  = lazy(() => import('../pages/MercadoLibre'))

// Error boundary para capturar crashes de páginas individuales
class PageErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[PageError]', error.message, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center">
          <p className="text-red-600 font-semibold mb-2">Error al cargar la página</p>
          <pre className="text-xs text-left bg-red-50 dark:bg-red-900/20 p-4 rounded max-h-64 overflow-auto text-red-800 dark:text-red-200">
            {this.state.error.message}
          </pre>
          <button
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded text-sm"
            onClick={() => this.setState({ error: null })}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Skeleton de carga entre navegaciones
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  )
}

// Cliente de React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos
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
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Componente de Toaster con tema
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <HashRouter>
          <Routes>
            {/* Rutas públicas */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/blocked" element={<SubscriptionExpiredPage />} />

            {/* Rutas protegidas — cada página carga solo cuando se navega */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={
                <PageErrorBoundary><Suspense fallback={<PageLoader />}><Dashboard /></Suspense></PageErrorBoundary>
              } />
              <Route path="sales" element={
                <PageErrorBoundary><Suspense fallback={<PageLoader />}><Sales /></Suspense></PageErrorBoundary>
              } />
              <Route path="products" element={
                <Suspense fallback={<PageLoader />}><Products /></Suspense>
              } />
              <Route path="price-update" element={
                <Suspense fallback={<PageLoader />}><PriceUpdate /></Suspense>
              } />
              <Route path="clients" element={
                <Suspense fallback={<PageLoader />}><Clients /></Suspense>
              } />
              <Route path="suppliers" element={
                <Suspense fallback={<PageLoader />}><Suppliers /></Suspense>
              } />
              <Route path="categories" element={
                <Suspense fallback={<PageLoader />}><Categories /></Suspense>
              } />
              <Route path="comprobantes" element={
                <Suspense fallback={<PageLoader />}><Vouchers /></Suspense>
              } />
              <Route path="payment-methods" element={
                <Suspense fallback={<PageLoader />}><PaymentMethods /></Suspense>
              } />
              <Route path="caja" element={
                <Suspense fallback={<PageLoader />}><Cash /></Suspense>
              } />
              <Route path="inventory" element={
                <Suspense fallback={<PageLoader />}><Inventory /></Suspense>
              }/>
              <Route path="current-account" element={
                <Suspense fallback={<PageLoader />}><CurrentAccount /></Suspense>
              }/>
              <Route path="stockpiles" element={
                <Suspense fallback={<PageLoader />}><Stockpiles /></Suspense>
              }/>
              <Route path="feedback" element={
                <Suspense fallback={<PageLoader />}><Feedback /></Suspense>
              } />
              <Route path="reports" element={
                <Suspense fallback={<PageLoader />}><Reports /></Suspense>
              } />
              <Route path="messaging" element={
                <Suspense fallback={<PageLoader />}><Messaging /></Suspense>
              } />
              <Route path="settings" element={
                <Suspense fallback={<PageLoader />}><Settings /></Suspense>
              } />
              <Route path="brands" element={
                <Suspense fallback={<PageLoader />}><Brands /></Suspense>
              } />
              <Route path="price-lists" element={
                <Suspense fallback={<PageLoader />}><PriceLists /></Suspense>
              } />
              <Route path="wholesale-lists" element={
                <PageErrorBoundary><Suspense fallback={<PageLoader />}><WholesalePriceLists /></Suspense></PageErrorBoundary>
              } />
              <Route path="mercadolibre" element={
                <Suspense fallback={<PageLoader />}><MercadoLibre /></Suspense>
              } />
            </Route>

            {/* Ruta por defecto */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <ThemedToaster />
        </HashRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
