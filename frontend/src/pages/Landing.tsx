import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Menu, X, Zap, Shield, Users, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import Button from '../components/ui/Button'
import AnimatedTentacleLogo from '../components/ui/AnimatedTentacleLogo'

const WHATSAPP_URL = 'https://wa.me/5492254596618'
const CHECKOUT_URL = import.meta.env.VITE_LANDING_CHECKOUT_URL || '#checkout-no-configured'
const MP_CHECKOUT_WEBHOOK_URL =
  import.meta.env.VITE_LANDING_MP_CHECKOUT_WEBHOOK_URL || 'https://n8nw.qeva.xyz/webhook/octopus-mp'
const ASSET_WEBHOOK_URL = import.meta.env.VITE_LANDING_ASSET_WEBHOOK_URL || '#webhook-no-configured'
const FORM_WEBHOOK_URL = 'https://n8nw.qeva.xyz/webhook/octopus-formulario'
const EXCEL_OFFER_BASE_PRICE = 20.99
const EXCEL_OFFER_PRICE = 5.99

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

function useScrollReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.reveal-on-scroll'))
    if (nodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])
}

function CountUp({ value, suffix = '', duration = 900 }: { value: number; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!started) return
    let raf = 0
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(value * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, started, value])

  return (
    <span
      ref={(el) => {
        if (!el || started) return
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setStarted(true)
                observer.disconnect()
              }
            })
          },
          { threshold: 0.4 },
        )
        observer.observe(el)
      }}
    >
      {display}
      {suffix}
    </span>
  )
}

function PriceTicker({ value, duration = 1400 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!started) return
    let raf = 0
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setDisplay(value * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration, started, value])

  const formatted = display.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return (
    <span
      ref={(el) => {
        if (!el || started) return
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setStarted(true)
                observer.disconnect()
              }
            })
          },
          { threshold: 0.45 },
        )
        observer.observe(el)
      }}
      className="tabular-nums"
    >
      {formatted}
    </span>
  )
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

async function submitLeadForm(payload: {
  email: string
  source: string
  action: 'excel' | 'plan'
  entryPoint: string
  planCode?: string
  planName?: string
  planPrice?: number
}) {
  const params = new URLSearchParams(window.location.search)
  const utmSource = params.get('utm_source') || undefined
  const utmMedium = params.get('utm_medium') || undefined
  const utmCampaign = params.get('utm_campaign') || undefined
  const utmTerm = params.get('utm_term') || undefined
  const utmContent = params.get('utm_content') || undefined

  try {
    await fetch(FORM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: payload.email,
        source: payload.source,
        action: payload.action,
        entry_point: payload.entryPoint,
        plan_code: payload.planCode,
        plan_name: payload.planName,
        plan_price: payload.planPrice,
        page_url: window.location.href,
        referrer: document.referrer || undefined,
        user_agent: navigator.userAgent,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_term: utmTerm,
        utm_content: utmContent,
        created_at: new Date().toISOString(),
      }),
    })
  } catch {
    // No bloquear checkout por error de tracking/formulario
  }
}

// ========================================
// Header — Premium dark with subtle animation
// ========================================
function Header({ loginUrl }: { loginUrl: string }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const menuItems = [
    { label: 'Características', id: 'caracteristicas' },
    { label: 'Precios', id: 'precios' },
    { label: 'Empezá con un excel', id: 'excel-start' },
    { label: 'Contacto', id: 'contacto' },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0d0d1a]/60 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <a href="#inicio" className="flex items-center transition-transform duration-300 hover:scale-[1.02]">
          <AnimatedTentacleLogo className="h-[52px] w-[52px]" alt="OctopusTrack" />
        </a>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="hidden gap-2 shadow-lg shadow-primary-500/25 transition-transform duration-200 hover:scale-[1.03] sm:block"
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
            className="mt-2 rounded-lg bg-primary-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-primary-500/25 transition-all duration-200 hover:bg-primary-500"
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
          Cuando llegue el momento escalá a un sistema completo sin empezar de cero. Crecemos con vos.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href="#excel-start" onClick={(event) => scrollToId('excel-start', event, 100, 92)}>
            <Button size="lg" className="min-w-[240px] gap-2 px-8 shadow-lg shadow-primary-500/25">
              Cotizá con Excel
              <ArrowRight className="h-4 w-4" />
            </Button>
          </a>
          <a href="#caracteristicas" onClick={(event) => scrollToId('caracteristicas', event, 72, 64)}>
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
        </div>
      </div>
    </section>
  )
}

// ========================================
// ExcelOffer — Visual premium card
// ========================================(
function ExcelOffer({
  excelBasePrice,
  excelPrice,
  onBuyExcel,
  isCheckoutLoading,
}: {
  excelBasePrice: number
  excelPrice: number
  onBuyExcel: () => void
  isCheckoutLoading: boolean
}) {
  const includeItems = [
    'Excel descargable + Google Sheets',
    'Cotizador que trabaja en segundos',
    'Instrucciones paso a paso',
    '4 planillas listas para usar',
    'Configurá tu empresa una vez',
    'Base de datos de productos',
  ]

  const targetItems = [
    'Personas sin conocimientos técnicos',
    'Negocios que cotizan todos los días',
  ]

  const excelImages = ['/assets/excel.png', '/assets/1.png', '/assets/2.png']
  const [currentImage, setCurrentImage] = useState(0)

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % excelImages.length)
  }
  const prevImage = () => {
    setCurrentImage((prev) => (prev - 1 + excelImages.length) % excelImages.length)
  }

  return (
    <section id="excel-start" className="relative overflow-hidden bg-[#0d0d1a] px-4 py-20 sm:px-6 sm:py-24">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a14] via-transparent to-[#0d0d1a] opacity-50" />

      <div className="relative mx-auto grid w-full max-w-6xl items-stretch gap-10 lg:grid-cols-2">
        {/* Image side with carousel */}
        <article className="group relative flex flex-col justify-center rounded-3xl border border-white/10 bg-white/5 p-2 shadow-2xl shadow-black/50">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary-500/10 to-violet-500/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <div className="pointer-events-none absolute left-1/2 top-8 z-10 hidden -translate-x-1/2 rounded-full border border-white/15 bg-black/35 px-4 py-1 text-center text-[20px] font-bold tracking-wide text-white/95 backdrop-blur-sm sm:block">
            OctopusTool
          </div>
          
          {/* Carousel */}
          <div className="relative flex-1 flex items-center justify-center">
            <img
              key={currentImage}
              src={excelImages[currentImage]}
              alt={`Vista del cotizador ${currentImage + 1}`}
              className="max-h-[600px] w-auto rounded-2xl border border-white/5 carousel-image"
            />
            
            {/* Navigation arrows */}
            {excelImages.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition-all hover:bg-primary-600 hover:scale-110 z-10"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white transition-all hover:bg-primary-600 hover:scale-110 z-10"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                
                {/* Dots indicator */}
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
                  {excelImages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImage(idx)}
                      className={`h-2 w-2 rounded-full transition-all duration-300 ${
                        idx === currentImage 
                          ? 'bg-primary-400 scale-125' 
                          : 'bg-white/40 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
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
            Dejá de perder tiempo cotizando a mano. Con este cotizador vas a poder generar presupuestos profesionales en segundos, con todos tus datos y precios actualizados.
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
          <div className="mt-10 rounded-2xl border border-white/10 bg-gradient-to-br from-[#17172a]/90 via-[#1b1b33]/80 to-[#141428]/90 p-6 shadow-[0_20px_60px_rgba(93,63,211,0.16)] backdrop-blur-sm">
            <div className="mx-auto mb-2 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Precio
            </div>

            <div className="mb-2 text-center">
              <span className="text-sm font-medium text-white/35 line-through">
                USD {excelBasePrice.toFixed(2)}
              </span>
            </div>

            <div className="flex items-end justify-center gap-2 text-center">
              <span className="text-xl font-semibold text-primary-300/85 sm:text-2xl">USD</span>
              <span className="bg-gradient-to-r from-primary-300 via-violet-300 to-primary-400 bg-clip-text text-5xl font-black leading-none text-transparent drop-shadow-[0_0_18px_rgba(157,132,191,0.3)] sm:text-6xl">
                <PriceTicker value={excelPrice} />
              </span>
            </div>

            <Button
              className="cta-shimmer mt-5 w-full gap-2 py-3"
              onClick={onBuyExcel}
              isLoading={isCheckoutLoading}
            >
              Comprar ahora
              <ArrowRight className="h-4 w-4" />
            </Button>

            <p className="mt-3 text-center text-xs text-white/30">
              Pago seguro • Entrega inmediata
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
<p className="mx-auto mb-6 max-w-2xl text-center text-xl font-medium text-primary-400">
          ¿Listo para dar el siguiente paso? Cuando tus necesidades crezcan, podés migrar a <span className="text-[24px] font-extrabold text-white">OctopusTrack</span> y llevar tu negocio al siguiente nivel.
        </p>

        <div className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Sistema completo para{' '}
            <span className="bg-gradient-to-r from-primary-400 to-violet-400 bg-clip-text text-transparent">
              hacer crecer tu negocio
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/50 sm:text-lg">
            Una solución diseñada para todo tipo de comercios que quieren escalar sus ventas y crecer sin límites.
          </p>
        </div>

        <div className="mt-16 space-y-24">
          {features.map((feature, index) => (
            <article
              key={feature.image}
              style={{ ['--reveal-delay' as string]: `${index * 90}ms` }}
              className={`reveal-on-scroll mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 ${
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
  onBuyPlan,
  isCheckoutLoading,
}: {
  onBuyPlan: (plan: { code: string; name: string; price: number }) => void
  isCheckoutLoading: boolean
}) {
  const plans = [
    {
      name: 'Básico',
      code: 'basico',
      price: 21,
      description: 'Ideal para empezar ordenado',
      features: [
        'Hasta 3.000 productos',
        'Cotizaciones',
        'Actualización de precios',
        'Clientes y proveedores',
        'Control de stock e inventario',
      ],
      featured: false,
    },
    {
      name: 'Negocio',
      code: 'negocio',
      price: 42,
      description: 'Para operar con más volumen',
      features: [
        'Hasta 9.000 productos',
        'Todo lo del plan Básico',
        'Cuentas corrientes',
        'Soporte personalizado mediante tickets',
      ],
      featured: false,
    },
    {
      name: 'Completo',
      code: 'completo',
      price: 72,
      description: 'El más elegido',
      features: [
        'Más de 12.000 productos',
        'Todo lo de los planes anteriores',
        'Facturación Electrónica ARCA (hasta 100 facturas mensuales)',
        'Soporte continuo',
        'Soporte personalizado mediante línea directa',
      ],
      featured: true,
    },
    {
      name: 'Premium',
      code: 'premium',
      price: 111,
      description: 'Escala total para equipos exigentes',
      features: [
        'Más de 200 facturas mensuales',
        'Productos ilimitados',
        'Todo lo de los planes anteriores',
        'Soporte continuo',
        'Adaptación de nuevas funcionalidades a medida',
      ],
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

        {/* Plans grid */}
        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, index) => (
            <article
                key={plan.name}
                style={{ ['--reveal-delay' as string]: `${(index + 1) * 100}ms` }}
                className={`reveal-on-scroll relative flex flex-col rounded-3xl border p-6 transition-all duration-300 hover:-translate-y-1 ${
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
                <span className="text-5xl font-bold text-white">$<CountUp value={plan.price} /></span>
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
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-8">
        {/* Guarantees - centered */}
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8">
          {guarantees.map((item) => (
            <div key={item.text} className="group flex items-center gap-2 text-sm text-white/40">
              <item.icon className="h-4 w-4 text-primary-400 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" />
              {item.text}
            </div>
          ))}
        </div>

        <nav aria-label="Enlaces legales" className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <a
            href="/politicas-privacidad.html"
            className="text-white/60 underline underline-offset-4 transition-colors hover:text-white"
          >
            Política de privacidad
          </a>
          <span className="text-white/20" aria-hidden="true">
            •
          </span>
          <a
            href="/politicas-seguridad.html"
            className="text-white/60 underline underline-offset-4 transition-colors hover:text-white"
          >
            Política de seguridad
          </a>
        </nav>
      </div>
    </footer>
  )
}

// ========================================
// Floating Contact Button
// ========================================
function FloatingContactButton() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Comunicate con nosotros por WhatsApp"
      className="fixed bottom-6 right-6 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary-500/50 bg-primary-600 text-white shadow-xl shadow-primary-500/30 transition-all hover:scale-105 hover:bg-primary-500"
    >
        <MessageCircle className="h-5 w-5" />
    </a>
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
  useScrollReveal()

  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)
  const [buyerEmail, setBuyerEmail] = useState('')
  const [leadIntent, setLeadIntent] = useState<
    | { type: 'excel' }
    | { type: 'plan'; plan: { code: string; name: string; price: number } }
    | null
  >(null)

  const isEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(buyerEmail.trim()), [buyerEmail])

  const handleExcelCheckout = async (email: string, entryPoint: string) => {
    setIsCheckoutLoading(true)
    try {
      await submitLeadForm({
        email,
        source: 'landing-octopustrack',
        action: 'excel',
        entryPoint,
      })

      await startMercadoPagoCheckout({
        price: EXCEL_OFFER_PRICE,
        product: 'OctopusTrack - Cotizador Excel',
        source: 'landing-octopustrack',
        email,
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

  const handlePlanCheckout = async (
    plan: { code: string; name: string; price: number },
    email: string,
    entryPoint: string,
  ) => {
    setIsCheckoutLoading(true)
    try {
      await submitLeadForm({
        email,
        source: 'landing-octopustrack-plan',
        action: 'plan',
        entryPoint,
        planCode: plan.code,
        planName: plan.name,
        planPrice: plan.price,
      })

      await startMercadoPagoCheckout({
        price: plan.price,
        product: `OctopusTrack - Plan ${plan.name}`,
        source: 'landing-octopustrack-plan',
        email,
        planCode: plan.code,
        onboardingType: 'plan',
      })
    } catch {
      openWhatsAppWithMessage(
        `Hola! Quiero contratar el Plan ${plan.name} de OctopusTrack (USD ${plan.price}/mes). Mi email es ${email}.`,
      )
    } finally {
      setIsCheckoutLoading(false)
    }
  }

  const openLeadModalForExcel = () => {
    setLeadIntent({ type: 'excel' })
    setIsLeadModalOpen(true)
  }

  const openLeadModalForPlan = (plan: { code: string; name: string; price: number }) => {
    setLeadIntent({ type: 'plan', plan })
    setIsLeadModalOpen(true)
  }

  const handleLeadSubmit = async () => {
    if (!isEmailValid || !leadIntent) return
    const email = buyerEmail.trim()
    setIsLeadModalOpen(false)

    if (leadIntent.type === 'excel') {
      await handleExcelCheckout(email, 'excel-card-buy-now')
      return
    }

    await handlePlanCheckout(
      leadIntent.plan,
      email,
      `plan-card-${leadIntent.plan.code}-choose`,
    )
  }

  return (
    <>
      <Header loginUrl={loginUrl} />
      <FloatingContactButton />
      <main>
        <Hero />
        <ExcelOffer
          excelBasePrice={EXCEL_OFFER_BASE_PRICE}
          excelPrice={EXCEL_OFFER_PRICE}
          onBuyExcel={openLeadModalForExcel}
          isCheckoutLoading={isCheckoutLoading}
        />
        <FeaturesZigZag />
        <Plans
          onBuyPlan={openLeadModalForPlan}
          isCheckoutLoading={isCheckoutLoading}
        />
      </main>
      {isLeadModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#111226] p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Antes de continuar</h3>
            <p className="mt-2 text-sm text-white/60">Dejanos tu email para enviarte el acceso y soporte.</p>

            <label htmlFor="lead-email-modal" className="mb-2 mt-4 block text-sm font-medium text-white/70">
              Correo electrónico
            </label>
            <input
              id="lead-email-modal"
              type="email"
              placeholder="tu@email.com"
              value={buyerEmail}
              onChange={(event) => setBuyerEmail(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-primary-400 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            {!isEmailValid && buyerEmail.trim().length > 0 && (
              <p className="mt-2 text-xs text-red-400">Ingresá un correo válido.</p>
            )}

            <div className="mt-5 flex gap-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setIsLeadModalOpen(false)}
                disabled={isCheckoutLoading}
              >
                Cancelar
              </Button>
              <Button
                className="w-full"
                onClick={handleLeadSubmit}
                isLoading={isCheckoutLoading}
                disabled={!isEmailValid}
              >
                Continuar
              </Button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </>
  )
}

export default function Landing({ loginUrl = '/acceder' }: LandingProps) {
  const isThankYou = useMemo(() => shouldShowThankYou(), [])
  if (isThankYou) return <ThankYouPage />

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      <LandingContent loginUrl={loginUrl} />
    </div>
  )
}
