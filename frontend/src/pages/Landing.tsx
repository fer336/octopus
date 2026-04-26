import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Menu, X, Zap, Shield, Users } from 'lucide-react'
import Button from '../components/ui/Button'

const WHATSAPP_URL = 'https://wa.me/5492254596618'
const CHECKOUT_URL = import.meta.env.VITE_LANDING_CHECKOUT_URL || '#checkout-no-configured'
const MP_CHECKOUT_WEBHOOK_URL =
  import.meta.env.VITE_LANDING_MP_CHECKOUT_WEBHOOK_URL || 'https://n8nw.qeva.xyz/webhook/octopus-mp'
const ASSET_WEBHOOK_URL = import.meta.env.VITE_LANDING_ASSET_WEBHOOK_URL || '#webhook-no-configured'

interface LandingProps {
  loginUrl?: string
}

interface CheckoutRequest {
  price: number
  product: string
  email: string
  source: string
  planCode?: string
  onboardingType?: 'excel' | 'plan'
}

function normalizeWhatsappLink(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return WHATSAPP_URL
  if (trimmed.startsWith('http')) return trimmed

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return WHATSAPP_URL
  return `https://wa.me/${digits}`
}

function openWhatsAppWithMessage(message: string) {
  const target = normalizeWhatsappLink(WHATSAPP_URL)
  const separator = target.includes('?') ? '&' : '?'
  const finalUrl = `${target}${separator}text=${encodeURIComponent(message)}`
  window.open(finalUrl, '_blank', 'noopener,noreferrer')
}

function scrollToId(id: string, event?: { preventDefault?: () => void }, desktopOffset = 90, mobileOffset = 82) {
  event?.preventDefault?.()
  const element = document.getElementById(id)
  if (!element) return

  const offset = window.innerWidth >= 768 ? desktopOffset : mobileOffset
  const top = element.getBoundingClientRect().top + window.scrollY - offset
  window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
}

function shouldShowThankYou() {
  const params = new URLSearchParams(window.location.search)
  const purchase = params.get('purchase')
  const status = params.get('status')
  const payment = params.get('payment')
  const mpStatus = params.get('mp_status')
  return purchase === 'success' || status === 'success' || payment === 'success' || mpStatus === 'approved'
}

function buildAssetWebhookUrl(format: 'excel' | 'sheets') {
  if (!ASSET_WEBHOOK_URL || ASSET_WEBHOOK_URL.startsWith('#')) return ASSET_WEBHOOK_URL
  const separator = ASSET_WEBHOOK_URL.includes('?') ? '&' : '?'
  return `${ASSET_WEBHOOK_URL}${separator}format=${format}`
}

function buildFallbackCheckoutUrl() {
  if (MP_CHECKOUT_WEBHOOK_URL && !MP_CHECKOUT_WEBHOOK_URL.startsWith('#')) return MP_CHECKOUT_WEBHOOK_URL
  return CHECKOUT_URL
}

async function startMercadoPagoCheckout(payload: CheckoutRequest) {
  const endpoint = buildFallbackCheckoutUrl()

  if (!endpoint || endpoint.startsWith('#')) {
    openWhatsAppWithMessage(`Hola! Quiero contratar ${payload.product}. Mi email es ${payload.email}.`)
    return
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      precio: payload.price,
      product: payload.product,
      source: payload.source,
      email: payload.email,
      plan_code: payload.planCode,
      onboarding_type: payload.onboardingType,
    }),
  })

  if (!response.ok) throw new Error(`checkout-error-${response.status}`)

  const data = await response.json()
  const initPoint = data?.init_point || data?.sandbox_init_point
  if (initPoint) {
    window.location.href = initPoint
    return
  }

  throw new Error('checkout-without-init-point')
}

// ========================================
// Header — Premium dark with subtle animation
// ========================================
function Header({ loginUrl }: { loginUrl: string }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const menuItems = [
    { label: 'Características', id: 'caracteristicas' },
    { label: 'Precios', id: 'precios' },
    { label: 'Empieza con un excel', id: 'excel-start' },
    { label: 'Para profesionales', id: 'independientes' },
    { label: 'Contacto', id: 'contacto' },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0d0d1a]/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <a href="#inicio" className="flex items-center transition-transform duration-300 hover:scale-[1.02]">
          <img src="/logo-tentaculo1.png" alt="OctopusTrack" className="h-11 w-auto" />
        </a>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="hidden text-white/70 hover:text-white sm:block"
            onClick={() => (window.location.href = loginUrl)}
          >
            Iniciar sesión
          </Button>
          <button
            type="button"
            aria-label="Abrir menú"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`overflow-hidden border-t border-white/5 bg-[#0d0d1a]/95 transition-all duration-300 ease-out ${
          menuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <nav className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6 sm:py-4">
          {menuItems.map((item) => (
            <a
              key={item.label}
              href={`#${item.id}`}
              onClick={(event) => {
                setMenuOpen(false)
                scrollToId(item.id, event, 94, 86)
              }}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-white/70 transition-all duration-200 hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </a>
          ))}
          <a
            href={loginUrl}
            className="mt-2 rounded-lg bg-primary-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-all duration-200 hover:bg-primary-500"
          >
            Iniciar sesión
          </a>
        </nav>
      </div>
    </header>
  )
}

// ========================================
// Hero — Staggered entrance with enhanced glow
// ========================================
function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden bg-[#0a0a14] px-4 pb-24 pt-32 text-center sm:px-6 sm:pt-40 sm:pb-28">
      {/* Ambient glow effects */}
      <div className="absolute left-1/2 top-[-200px] h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-radial from-primary-600/20 via-primary-700/10 to-transparent blur-3xl" />
      <div className="absolute left-[10%] top-[20%] h-[300px] w-[300px] rounded-full bg-primary-800/10 blur-[100px]" />
      <div className="absolute right-[10%] top-[40%] h-[200px] w-[200px] rounded-full bg-violet-600/10 blur-[80px]" />

      {/* Animated content */}
      <div className="relative z-10 mx-auto max-w-4xl animate-fade-in-up">
        <h1 className="text-[36px] font-bold leading-[1.08] tracking-tight text-white sm:text-5xl sm:leading-tight lg:text-6xl">
          Agilizá tu negocio{' '}
          <span className="bg-gradient-to-r from-primary-400 to-violet-400 bg-clip-text text-transparent">
            desde hoy
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60 sm:text-xl">
          Soluciones en Excel listas para usar: cotizá, controlá el stock y gestioná tu negocio sin complicaciones.
        </p>

        <p className="mx-auto mt-3 max-w-xl text-base text-white/40 sm:text-lg">
          Cuando llegué el momento escalá a un sistema completo sin empezar de cero. Crecemos con vos.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href="#excel-start" onClick={(event) => scrollToId('excel-start', event, 100, 92)}>
            <Button size="lg" className="min-w-[240px] gap-2 px-8 shadow-lg shadow-primary-500/25">
              Cotizá con Excel
              <ArrowRight className="h-4 w-4" />
            </Button>
          </a>
          <a href="#caracteristicas" onClick={(event) => scrollToId('caracteristicas', event, 100, 92)}>
            <Button
              size="lg"
              variant="outline"
              className="min-w-[200px] border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
             Ver sistema completo
            </Button>
          </a>
        </div>

        {/* Social proof badges */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-6 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary-400" />
            <span>Configuración en 2 minutos</span>
          </div>
          <div className="h-1 w-1 rounded-full bg-white/20" />
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary-400" />
            <span>Garantía de por vida</span>
          </div>
          <div className="h-1 w-1 rounded-full bg-white/20" />
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-400" />
            <span>+500 negocios</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ========================================
// ExcelOffer — Visual premium card
// ========================================(
function ExcelOffer({
  email,
  setEmail,
  isEmailValid,
  onBuyExcel,
  isCheckoutLoading,
}: {
  email: string
  setEmail: (value: string) => void
  isEmailValid: boolean
  onBuyExcel: () => void
  isCheckoutLoading: boolean
}) {
  const includeItems = [
    'Excel descargable + Google Sheets',
    'Cotizador preparador en segundos',
    'Instrucciones paso a paso',
    '4 planillas listas para usar',
    'Configurá tu empresa una vez',
    'Base de datos de productos',
  ]

  const targetItems = [
    'Personas sin conocimientos técnicos',
    'Negocios que cotizan todos los días',
  ]

  return (
    <section id="excel-start" className="relative overflow-hidden bg-[#0d0d1a] px-4 py-20 sm:px-6 sm:py-24">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a14] via-transparent to-[#0d0d1a] opacity-50" />

      <div className="relative mx-auto grid w-full max-w-6xl items-start gap-10 lg:grid-cols-2">
        {/* Image side */}
        <article className="group relative rounded-3xl border border-white/10 bg-white/5 p-2 shadow-2xl shadow-black/50">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary-500/10 to-violet-500/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <img
            src="/assets/excel.png"
            alt="Vista del cotizador en Excel"
            className="relative h-auto w-full rounded-2xl border border-white/5"
          />
        </article>

        {/* Content side */}
        <article className="flex flex-col justify-center">
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-3 py-1 text-xs font-medium text-primary-300">
            <Zap className="h-3 w-3" />
            Más vendido
          </div>

          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Tu cotizador profesional en Excel
          </h2>

          <p className="mt-4 text-base text-white/60">
            Dejá de perder tiempo cotizando a mano. Con este cotizador vas a poder generar presupuestos
            profesionales en segundos, con tu logo, datos y precios actualizados.
          </p>

          <div className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">Incluye</h3>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {includeItems.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-white/70">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div id="independientes" className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">Para quién está dirigido</h3>
            <ul className="mt-3 space-y-2">
              {targetItems.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-white/60">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Price card */}
          <div className="mt-10 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[2%] p-6">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium uppercase tracking-wider text-white/40">Precio</span>
              <span className="text-4xl font-bold text-white">USD 20.99</span>
            </div>

            <label htmlFor="buyer-email" className="mb-2 mt-5 block text-sm font-medium text-white/60">
              Tu correo electrónico
            </label>
            <input
              id="buyer-email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-primary-500 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {!isEmailValid && email.trim().length > 0 && (
              <p className="mt-2 text-xs text-red-400">Ingresá un correo válido para comprar.</p>
            )}

            <Button
              className="mt-5 w-full gap-2 py-3"
              onClick={onBuyExcel}
              isLoading={isCheckoutLoading}
              disabled={!isEmailValid}
            >
              Comprar ahora
              <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="mt-3 text-center text-xs text-white/30">
              Pago seguro • Entrega inmediata • Garantía de 30 días
            </p>
          </div>
        </article>
      </div>
    </section>
  )
}

// ========================================
// FeaturesZigZag — Animated with proper spacing
// ========================================
function FeaturesZigZag() {
  const features = [
    {
      title: '',
      image: '/assets/ventas-cajas.png',
      description: 'Centralizá todo tu proceso de ventas en una única pantalla, diseñadas para operar rápido, sin errores y sin cambiar de entorno.',
      lines: [
        'Gestión unificada: Cotizaciones, remitos, facturación y retiros de cuentas corrientes en un solo lugar.',
        'Carga ágil: Ingresá productos con atajos de teclado optimizados, reduciendo tiempos operativos.',
        'Comprobantes profesionales con datos del cliente y detalle completo.',
        'Trazabilidad: Seguimiento claro entre comprobantes.',
        'Gestión de borradores para continuarlos después.',
      ],
    },
    {
      title: '',
      image: '/assets/catalogo-inventario.png',
      description: 'Control total de tus productos, precios y stock en un solo lugar.',
      lines: [
        'Carga flexible: Productos manuales o importalos desde Excel.',
        'Backups completos: Exportá e importá tu base.',
        'Actualización masiva: Modificá precios y stock por categorías.',
        'Inventario inteligente: Reportes para controlar stock físico.',
        'Optimización de compras con costos reales.',
      ],
    },
    {
      title: '',
      image: '/assets/Contacto-categorias.png',
      description: 'Gestión centralizada de todos tus contactos y su relación en el negocio.',
      lines: [
        'Clientes con autorizaciones: Un cliente puede habilitar a terceros.',
        'Ejemplo: Un arquitecto habilita a electricistas, plomeros.',
        'Categorías: Organizá tu catálogo clasificando productos.',
        'Proveedores: Administrá tu red de proveedores.',
      ],
    },
    {
      title: '',
      image: '/assets/reportes.png',
      description: 'Tomá decisiones con información clara, en tiempo real.',
      lines: [
        'Ventas por período: Resúmenes claros y comparativas.',
        'Productos más vendidos: Identificá qué genera más ingresos.',
        'Estado de stock: Consultá y detectá productos con bajo stock.',
        'Cuentas corrientes: Visualizá saldos y antigüedad.',
        'Exportación simple: Reports listos para compartir.',
      ],
    },
  ]

  return (
    <section id="caracteristicas" className="relative overflow-hidden bg-[#0a0a14] px-4 py-20 sm:px-6 sm:py-24">
      <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-900/10 blur-[120px]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Sistema completo para{' '}
            <span className="bg-gradient-to-r from-primary-400 to-violet-400 bg-clip-text text-transparent">
              hacer crecer tu negocio
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/50 sm:text-lg">
            Una solución diseñada para negocios reales del rubro sanitario, ferretería y corralón.
          </p>
        </div>

        <div className="mt-16 space-y-24">
          {features.map((feature, index) => (
            <article
              key={feature.image}
              className={`mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 ${
                index % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
              }`}
            >
              {/* Image */}
              <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-1 shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-violet-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <img
                  src={feature.image}
                  alt="OctopusTrack"
                  className="relative h-auto w-full rounded-2xl"
                />
              </div>

              {/* Content - sin título */}
              <div className="flex flex-col justify-center">
                <p className="text-xl font-medium text-white/80">{feature.description}</p>

                {feature.lines.length > 0 && (
                  <ul className="mt-6 space-y-3">
                    {feature.lines.map((line) => (
                      <li key={line} className="flex items-start gap-3 text-lg text-white/70">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-400" />
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========================================
// Plans — Premium cards with distinction
// ========================================
function Plans({
  email,
  setEmail,
  isEmailValid,
  onBuyPlan,
  isCheckoutLoading,
}: {
  email: string
  setEmail: (value: string) => void
  isEmailValid: boolean
  onBuyPlan: (plan: { code: string; name: string; price: number }) => void
  isCheckoutLoading: boolean
}) {
  const plans = [
    {
      name: 'Básico',
      code: 'basico',
      price: 33,
      description: 'Para negocios que inician',
      features: ['Hasta 20.000 productos', 'Cotizaciones ilimitadas', 'Actualización de precios', 'Clientes y proveedores', 'Control de stock'],
      featured: false,
    },
    {
      name: 'Negocio',
      code: 'negocio',
      price: 49,
      description: 'El más elegido',
      features: ['Todo lo del Básico', 'Seguimiento de entregas', 'Cuenta corriente', 'Reportes y análisis', 'Soporte prioritario'],
      featured: true,
    },
    {
      name: 'Completo',
      code: 'completo',
      price: 119,
      description: 'Para escalar',
      features: ['Todo lo de Negocio', 'Facturación electrónica ARCA', 'Mantenimiento continuo', 'Soporte personalizado', 'Onboarding incluido'],
      featured: false,
    },
  ]

  return (
    <section id="precios" className="relative overflow-hidden bg-[#0d0d1a] px-4 py-20 sm:px-6 sm:py-24">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a14] via-transparent to-[#0a0a14]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Planes diseñados para{' '}
            <span className="bg-gradient-to-r from-primary-400 to-violet-400 bg-clip-text text-transparent">
              crecer con vos
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/50 sm:text-lg">
            Elegí el plan que mejor se adapte a las necesidades de tu negocio. Todos incluyen soporte y actualizaciones.
          </p>
        </div>

        {/* Email input */}
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-white/10 bg-white/5 p-4">
          <label htmlFor="plan-onboarding-email" className="mb-2 block text-sm font-medium text-white/60">
            Email para onboarding
          </label>
          <input
            id="plan-onboarding-email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-primary-500 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {!isEmailValid && email.trim().length > 0 && (
            <p className="mt-2 text-xs text-red-400">Ingresá un correo válido para comprar planes.</p>
          )}
        </div>

        {/* Plans grid */}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col rounded-3xl border p-6 transition-all duration-300 ${
                plan.featured
                  ? 'border-primary-500/50 bg-gradient-to-b from-primary-900/30 to-[#0d0d1a] shadow-xl shadow-primary-500/10 scale-105'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary-600 to-violet-600 px-4 py-1 text-xs font-semibold text-white">
                  Más elegido
                </span>
              )}

              <p className="text-xs font-semibold uppercase tracking-widest text-primary-400">{plan.name}</p>
              <p className="mt-1 text-sm text-white/50">{plan.description}</p>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold text-white">${plan.price}</span>
                <span className="text-sm text-white/50">USD/mes</span>
              </div>

              <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              <ul className="flex-1 space-y-3 text-sm text-white/70">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-400" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.featured ? 'primary' : 'outline'}
                className="mt-6 w-full"
                onClick={() => onBuyPlan({ code: plan.code, name: plan.name, price: plan.price })}
                isLoading={isCheckoutLoading}
                disabled={!isEmailValid}
              >
                Elegir {plan.name}
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========================================
// Footer — Enriched with guarantees
// ========================================
function Footer() {
  const guarantees = [
    { icon: Shield, text: ' Datos seguros' },
    { icon: Zap, text: ' Configuración rápida' },
    { icon: Users, text: ' Soporte dedicado' },
  ]

  return (
    <footer id="contacto" className="border-t border-white/5 bg-[#080810] px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 md:flex-row md:justify-between">
        {/* Guarantees */}
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8">
          {guarantees.map((item) => (
            <div key={item.text} className="flex items-center gap-2 text-sm text-white/40">
              <item.icon className="h-4 w-4 text-primary-400" />
              {item.text}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="flex flex-col items-center gap-3 md:items-end">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all hover:bg-white/10"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.297-.297.446-.521.795-.521.297 0 .694.1.998.605.149.198.447.595.546.698.099.149.298 1.195.298 1.447 0 .297-.149.595-.447.795l-.652.652c-.223.223-.447.446-.895.446-.297 0-.694-.149-1.095-.447-.396-.297-.654-1.195-.743-1.392-.099-.298.149-.595.447-.744l1.194-1.194c.297-.198.595-.447.744-.547l.397-.397c.149-.149.297-.297.446-.496.149-.199.198-.397.198-.595 0-.297-.149-.694-.447-1.195l-1.194-1.194c-.297-.297-.595-.447-.844-.595-.198-.099-.417-.149-.595-.149zM12 22.5c-1.757 0-3.47-.463-5.023-1.352-.494-.282-.975-.595-1.404-1.027L4 21.707l1.414-1.414c.432-.43.745-.91 1.027-1.404.889-1.553 1.352-3.266 1.352-5.023 0-5.522-4.478-10-10-10S2 5.478 2 11c0 1.757.464 3.47 1.352 5.023.282.494.595.975 1.027 1.404L5.964 20l1.414 1.414c.43.432.91.745 1.404 1.027 1.553.889 3.266 1.352 5.023 1.352 5.522 0 10 4.478 10 10s-4.478 10-10 10z" />
            </svg>
            Escribinos
          </a>
        </div>
      </div>
    </footer>
  )
}

// ========================================
// ThankYouPage — Premium after purchase
// ========================================
function ThankYouPage() {
  return (
    <div className="min-h-screen bg-[#080810]">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-500/20">
            <CheckCircle2 className="h-8 w-8 text-primary-400" />
          </div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">Pago confirmado</p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Tu cotizador ya está listo</h1>
          <p className="mx-auto mt-4 max-w-lg text-base text-white/60">
            Acá tenés acceso inmediato al archivo Excel y Google Sheets. Descargalo y empezá a usar tu nuevo cotizador.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <a href={buildAssetWebhookUrl('excel')} target="_blank" rel="noopener noreferrer">
              <Button className="w-full gap-2 py-3">
                Descargar Excel
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <a href={buildAssetWebhookUrl('sheets')} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full gap-2 py-3">
                Obtener Google Sheets
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>

          <div className="mt-10 rounded-xl bg-white/5 p-4">
            <p className="text-sm text-white/50">
              ¿Necesitás ayuda?{' '}
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-primary-400 underline hover:text-primary-300">
                Escribinos por WhatsApp
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

// ========================================
// Main Landing Component
// ========================================
function LandingContent({ loginUrl }: { loginUrl: string }) {
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [buyerEmail, setBuyerEmail] = useState('')

  const isEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(buyerEmail.trim()), [buyerEmail])

  const handleExcelCheckout = async () => {
    if (!isEmailValid) return
    setIsCheckoutLoading(true)
    try {
      await startMercadoPagoCheckout({
        price: 20.99,
        product: 'OctopusTrack - Cotizador Excel',
        source: 'landing-octopustrack',
        email: buyerEmail.trim(),
        onboardingType: 'excel',
      })
    } catch {
      const endpoint = buildFallbackCheckoutUrl()
      if (endpoint && !endpoint.startsWith('#')) {
        window.open(endpoint, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setIsCheckoutLoading(false)
    }
  }

  const handlePlanCheckout = async (plan: { code: string; name: string; price: number }) => {
    if (!isEmailValid) return

    setIsCheckoutLoading(true)
    try {
      await startMercadoPagoCheckout({
        price: plan.price,
        product: `OctopusTrack - Plan ${plan.name}`,
        source: 'landing-octopustrack-plan',
        email: buyerEmail.trim(),
        planCode: plan.code,
        onboardingType: 'plan',
      })
    } catch {
      openWhatsAppWithMessage(
        `Hola! Quiero contratar el Plan ${plan.name} de OctopusTrack (USD ${plan.price}/mes). Mi email es ${buyerEmail.trim()}.`,
      )
    } finally {
      setIsCheckoutLoading(false)
    }
  }

  return (
    <>
      <Header loginUrl={loginUrl} />
      <main>
        <Hero />
        <ExcelOffer
          email={buyerEmail}
          setEmail={setBuyerEmail}
          isEmailValid={isEmailValid}
          onBuyExcel={handleExcelCheckout}
          isCheckoutLoading={isCheckoutLoading}
        />
        <FeaturesZigZag />
        <Plans
          email={buyerEmail}
          setEmail={setBuyerEmail}
          isEmailValid={isEmailValid}
          onBuyPlan={handlePlanCheckout}
          isCheckoutLoading={isCheckoutLoading}
        />
      </main>
      <Footer />
    </>
  )
}

export default function Landing({ loginUrl = '/login' }: LandingProps) {
  const isThankYou = useMemo(() => shouldShowThankYou(), [])
  if (isThankYou) return <ThankYouPage />

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      <LandingContent loginUrl={loginUrl} />
    </div>
  )
}