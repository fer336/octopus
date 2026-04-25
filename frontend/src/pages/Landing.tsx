import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock,
  HandCoins,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import Button from '../components/ui/Button'

const WHATSAPP_URL = 'https://wa.me/5492254596618'
const CHECKOUT_URL = import.meta.env.VITE_LANDING_CHECKOUT_URL || '#checkout-no-configured'
const MP_CHECKOUT_WEBHOOK_URL =
  import.meta.env.VITE_LANDING_MP_CHECKOUT_WEBHOOK_URL ||
  'https://n8nw.qeva.xyz/webhook/octopus-mp'
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

function openSystemDemoWhatsApp(event?: { preventDefault?: () => void }) {
  event?.preventDefault?.()
  openWhatsAppWithMessage('Hola, me gustaria probar OctopusTrack')
}

function scrollToBuyerEmail(event?: { preventDefault?: () => void }) {
  event?.preventDefault?.()
  const emailInput = document.getElementById('buyer-email') as HTMLInputElement | null
  const purchaseCard = document.getElementById('purchase-card')
  if (!emailInput) return

  if (purchaseCard) {
    const headerOffset = window.innerWidth >= 640 ? 88 : 84
    const top = purchaseCard.getBoundingClientRect().top + window.scrollY - headerOffset
    window.scrollTo({ top, behavior: 'smooth' })
  }

  window.setTimeout(() => {
    emailInput.focus()
    emailInput.select()
  }, 250)
}

function scrollToPlansSection(event?: { preventDefault?: () => void }) {
  event?.preventDefault?.()
  const section = document.getElementById('planes')
  if (!section) return

  const headerOffset = window.innerWidth >= 640 ? 8 : 4
  const top = section.getBoundingClientRect().top + window.scrollY - headerOffset

  window.scrollTo({ top, behavior: 'smooth' })
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
  if (MP_CHECKOUT_WEBHOOK_URL && !MP_CHECKOUT_WEBHOOK_URL.startsWith('#')) {
    return MP_CHECKOUT_WEBHOOK_URL
  }
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

  if (!response.ok) {
    throw new Error(`checkout-error-${response.status}`)
  }

  const data = await response.json()
  const initPoint = data?.init_point || data?.sandbox_init_point

  if (initPoint) {
    window.location.href = initPoint
    return
  }

  throw new Error('checkout-without-init-point')
}

function Header({ loginUrl }: { loginUrl: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
      <div className="relative mx-auto flex h-16 w-full max-w-7xl items-center justify-center px-4 sm:justify-between sm:px-6 lg:px-8">
        <a href="#inicio" className="flex items-center gap-3 sm:absolute sm:left-6 lg:static">
          <img src="/logo-tentaculo1.png" alt="OctopusTrack" className="h-10 w-auto object-contain" />
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          <a href="#buyer-email" onClick={scrollToBuyerEmail} className="text-sm text-gray-600 transition-colors hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-300">Comprar cotizador</a>
          <a href="#camino-sistema" className="text-sm text-gray-600 transition-colors hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-300">Sistema</a>
          <a href="#planes" onClick={scrollToPlansSection} className="text-sm text-gray-600 transition-colors hover:text-primary-600 dark:text-gray-300 dark:hover:text-primary-300">Planes</a>
          <Button size="sm" variant="outline" onClick={() => (window.location.href = loginUrl)}>
            Iniciar sesion
          </Button>
        </nav>
      </div>
    </header>
  )
}

function HeroSection() {
  return (
    <section id="inicio" className="relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-[#07070d] dark:via-[#090812] dark:to-primary-950">
      <div className="absolute inset-0 opacity-40 dark:opacity-100">
        <div className="absolute -left-16 top-14 h-72 w-72 rounded-full bg-primary-300 blur-3xl dark:bg-primary-800/30" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-primary-400 blur-3xl dark:bg-primary-700/30" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 py-14 text-center sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        <div className="mx-auto flex max-w-4xl flex-col items-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-300 bg-primary-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-700 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
            <Sparkles className="h-4 w-4" />
            Para ferreterias, sanitarios y pymes
          </div>

          <h1 className="text-3xl font-extrabold leading-tight text-gray-900 sm:text-5xl dark:text-white">
            Cotiza en segundos.
            <br />
            Vende mas sin errores.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600 dark:text-gray-300">
            Empeza con un cotizador profesional por USD 11.99 o activa el sistema completo desde USD 33/mes.
            Vos elegis el ritmo, sin vueltas y sin friccion.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a href="#buyer-email" onClick={scrollToBuyerEmail} className="w-full sm:w-auto">
              <Button size="lg" className="w-full px-8 sm:w-auto">
                Comprar Cotizador - USD 11.99
                <ArrowRight className="h-5 w-5" />
              </Button>
            </a>
            <a href="#camino-sistema" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full">
                Ver demo del sistema completo
              </Button>
            </a>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {['Pago unico', 'Entrega automatica', 'Excel + Google Sheets'].map((item) => (
              <span key={item} className="rounded-full border border-primary-300 bg-white/70 px-4 py-1.5 text-sm text-primary-700 dark:border-primary-700 dark:bg-primary-900/35 dark:text-primary-200">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function MobileQuickActions() {
  return (
    <section className="bg-white/80 px-4 py-3 backdrop-blur dark:bg-gray-950/80 md:hidden">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-2">
        <a href="#buyer-email" onClick={scrollToBuyerEmail}>
          <Button className="w-full text-xs">
            Comprar
            <ArrowRight className="h-4 w-4" />
          </Button>
        </a>
        <a href="#planes" onClick={scrollToPlansSection}>
          <Button variant="outline" className="w-full text-xs">
            Ver planes
          </Button>
        </a>
      </div>
    </section>
  )
}

function ProductPurchaseSection({
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
  const benefits = [
    'Pago unico',
    'Entrega automatica',
    'Incluye Excel + Google Sheets',
    'Listo para usar',
    'Sin conocimientos tecnicos',
    'Ideal para negocios que cotizan todos los dias',
  ]

  return (
    <section id="compra-cotizador" className="scroll-mt-24 bg-white py-14 dark:bg-gray-900 sm:py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article id="purchase-card" className="rounded-3xl border border-primary-200 bg-primary-50/70 p-5 dark:border-primary-800 dark:bg-primary-900/20 sm:p-7">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">Producto digital</p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">Cotizador profesional</h2>
            <p className="mt-3 text-gray-600 dark:text-gray-300">
              Compras una vez y recibis las dos versiones: Excel y Google Sheets.
              Usalo en tu compu, compartilo con tu equipo o adaptalo a tu forma de trabajar.
            </p>

            <div className="mt-6 rounded-2xl border border-primary-200 bg-white p-5 dark:border-primary-700 dark:bg-gray-950/40">
              <p className="text-sm text-gray-500 dark:text-primary-200">Precio</p>
              <p className="text-4xl font-extrabold text-gray-900 dark:text-white">USD 11.99</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-primary-200/80">Pago unico</p>

              <div className="mt-4">
                <label htmlFor="buyer-email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Email para enviarte el Excel (obligatorio)
                </label>
                <input
                  id="buyer-email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="scroll-mt-24 w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none dark:border-primary-700 dark:bg-gray-950 dark:text-white"
                />
                {!isEmailValid && email.trim().length > 0 && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">Ingresa un email valido para habilitar la compra.</p>
                )}
              </div>

              <div className="mt-5">
                <Button className="w-full" onClick={onBuyExcel} isLoading={isCheckoutLoading} disabled={!isEmailValid}>
                  Comprar Cotizador - USD 11.99
                </Button>
              </div>

              <a href="/cotizadorProfesional.png" target="_blank" rel="noopener noreferrer" className="mt-3 block">
                <Button variant="outline" className="w-full">Ver imagen del Excel</Button>
              </a>
            </div>
          </article>

          <article className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950/30 sm:p-7">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Incluye</h3>
            <ul className="mt-4 space-y-2 text-gray-600 dark:text-gray-300">
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 text-primary-600" />Archivo Excel descargable (.xlsx)</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 text-primary-600" />Version Google Sheets duplicable por enlace</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 text-primary-600" />Instrucciones rapidas de uso</li>
            </ul>

            <h4 className="mt-6 text-base font-semibold text-gray-900 dark:text-white">Beneficios</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {benefits.map((benefit) => (
                <div key={benefit} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  {benefit}
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button className="w-full" onClick={onBuyExcel} isLoading={isCheckoutLoading} disabled={!isEmailValid}>
                Obtener Excel
              </Button>
              <Button variant="outline" className="w-full" onClick={onBuyExcel} isLoading={isCheckoutLoading} disabled={!isEmailValid}>
                Obtener Google Sheets
              </Button>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function ProblemSection() {
  const pains = [
    'Perdes tiempo armando cotizaciones una por una.',
    'Te equivocaste en un precio y regalaste margen.',
    'El cliente se enfria mientras seguis calculando.',
    'No tenes claro quien te debe y cuanto stock queda.',
  ]

  return (
    <section className="bg-gray-50 py-16 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Si esto te pasa todos los dias, te esta frenando ventas</h2>
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {pains.map((pain) => (
            <li key={pain} className="flex items-start gap-3 rounded-xl border border-red-200 bg-white p-4 text-gray-700 dark:border-red-900/50 dark:bg-gray-900 dark:text-gray-200">
              <CircleAlert className="mt-0.5 h-5 w-5 flex-none text-red-500" />
              <span>{pain}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SolutionSection() {
  const solutions = [
    { icon: Clock, title: 'Mas rapido', copy: 'Cotizas en minutos y respondes antes que la competencia.' },
    { icon: ShieldCheck, title: 'Mas ordenado', copy: 'Todo queda claro para vos y para tu equipo.' },
    { icon: ReceiptText, title: 'Mas profesional', copy: 'Tus cotizaciones salen prolijas y listas para cerrar venta.' },
    { icon: HandCoins, title: 'Mas rentable', copy: 'Menos errores, mejor margen y mas control del negocio.' },
  ]

  return (
    <section className="bg-white py-16 dark:bg-gray-900">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">OctopusTrack te da control y velocidad desde el primer dia</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {solutions.map((item) => (
            <article key={item.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-950/40">
              <item.icon className="h-6 w-6 text-primary-600 dark:text-primary-300" />
              <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">{item.title}</h3>
              <p className="mt-1 text-gray-600 dark:text-gray-300">{item.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ChooseStartSection() {
  return (
    <section id="elegi-como-empezar" className="bg-gray-50 py-16 dark:bg-gray-950">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Elegi como empezar</h2>
        <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-300">Dos caminos claros para vender mejor hoy mismo.</p>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <article id="camino-excel" className="scroll-mt-24 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-800/60 dark:bg-emerald-950/20">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">OPCION 1</p>
            <h3 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Excel Profesional de Cotizaciones</h3>
            <p className="mt-2 text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">USD 11.99</p>
            <ul className="mt-5 space-y-2 text-gray-700 dark:text-gray-200">
              {['Listo para usar en minutos', 'No necesitas conocimientos tecnicos', 'Cotizaciones rapidas y prolijas'].map((point) => (
                <li key={point} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />{point}</li>
              ))}
            </ul>
            <a href="#buyer-email" onClick={scrollToBuyerEmail} className="mt-6 block">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700">Comprar Cotizador</Button>
            </a>
          </article>

          <article id="camino-sistema" className="scroll-mt-24 rounded-2xl border border-primary-300 bg-primary-50 p-6 dark:border-primary-800 dark:bg-primary-900/20">
            <p className="text-sm font-semibold text-primary-700 dark:text-primary-300">OPCION 2</p>
            <h3 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Sistema OctopusTrack</h3>
            <p className="mt-2 text-3xl font-extrabold text-primary-700 dark:text-primary-300">Desde USD 33/mes</p>
            <ul className="mt-5 space-y-2 text-gray-700 dark:text-gray-200">
              {['Cotizaciones y control diario desde un solo lugar', 'Clientes, proveedores e inventario ordenados', 'Escalas por plan segun tu etapa de negocio'].map((point) => (
                <li key={point} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 text-primary-600" />{point}</li>
              ))}
            </ul>
            <a href={WHATSAPP_URL} onClick={openSystemDemoWhatsApp} target="_blank" rel="noopener noreferrer" className="mt-6 block">
              <Button className="w-full">Probar sistema</Button>
            </a>
          </article>
        </div>
      </div>
    </section>
  )
}

function PlansSection({
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
      name: 'Basico',
      code: 'basico',
      price: 33,
      line: 'Para digitalizar tu operacion diaria con foco en venta y control.',
      features: [
        'Hasta 20.000 productos',
        'Cotizaciones',
        'Actualizacion masiva de precios',
        'Clientes y proveedores',
        'Inventario con control de stock',
      ],
    },
    {
      name: 'Negocio',
      code: 'negocio',
      price: 49,
      line: 'Para seguimiento comercial y operacion con entregas.',
      features: ['Todo lo del plan Basico', 'Cuenta corriente', 'Remitos'],
    },
    {
      name: 'Completo',
      code: 'completo',
      price: 119,
      line: 'Para operar sin fricciones fiscales y escalar con acompanamiento.',
      features: [
        'Todo lo del plan Negocio',
        'Facturacion electronica con ARCA',
        'Mantenimiento continuo',
        'Soporte personalizado',
      ],
    },
  ]

  return (
    <section id="planes" className="bg-gray-50 py-14 dark:bg-gray-950 sm:py-16">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold text-gray-900 dark:text-white md:text-left">Planes simples</h2>
        <div className="mt-4 rounded-2xl border border-primary-200 bg-white p-4 text-center dark:border-primary-800 dark:bg-gray-900/60 sm:p-5 md:text-left">
          <label htmlFor="plan-onboarding-email" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Email para onboarding y activacion del sistema
          </label>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              id="plan-onboarding-email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none dark:border-primary-700 dark:bg-gray-950 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 md:max-w-xs">
              Este mail se usa para enviarte el acceso y arrancar el onboarding despues del pago.
            </p>
          </div>
          {!isEmailValid && email.trim().length > 0 && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">Ingresa un email valido para habilitar la compra de planes.</p>
          )}
        </div>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-2xl border bg-white p-5 text-center dark:bg-gray-900 sm:p-6 md:text-left ${
                plan.name === 'Negocio'
                  ? 'border-primary-400 ring-2 ring-primary-200 dark:border-primary-600 dark:ring-primary-900/50'
                  : 'border-gray-200 dark:border-gray-800'
              }`}
            >
              {plan.name === 'Negocio' && (
                <span className="inline-flex rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  Recomendado
                </span>
              )}
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
              <p className="mt-2 text-3xl font-extrabold text-primary-700 dark:text-primary-300">
                USD {plan.price}
                <span className="text-sm font-medium text-gray-500 dark:text-primary-200">/mes</span>
              </p>
              <p className="mt-3 text-gray-600 dark:text-gray-300">{plan.line}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start justify-center gap-2 text-left md:justify-start">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onBuyPlan({ code: plan.code, name: plan.name, price: plan.price })}
                  isLoading={isCheckoutLoading}
                  disabled={!isEmailValid}
                >
                  Elegir {plan.name}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ScaleSection() {
  return (
    <section className="bg-gradient-to-r from-primary-600 to-primary-700 py-14">
      <div className="mx-auto w-full max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <p className="text-3xl font-extrabold text-white">
          Empeza con Excel. Cuando crezcas, pasas al sistema. Sin perder datos.
        </p>
      </div>
    </section>
  )
}

function ComparisonSection() {
  return (
    <section className="bg-white py-16 dark:bg-gray-900">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Excel vs Sistema</h2>
        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">Excel</th>
                <th className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">Sistema</th>
              </tr>
            </thead>
            <tbody className="bg-white text-gray-700 dark:bg-gray-950/40 dark:text-gray-200">
              <tr><td className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">Pago unico</td><td className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">Mensual</td></tr>
              <tr><td className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">Simple</td><td className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">Completo</td></tr>
              <tr><td className="px-4 py-3">Ideal para empezar</td><td className="px-4 py-3">Ideal para escalar</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function StickyMobileCTA() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 md:hidden">
      <div className="mx-auto flex max-w-7xl gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <a href="#buyer-email" onClick={scrollToBuyerEmail} className="w-1/2">
          <Button className="w-full text-xs">Comprar Cotizador</Button>
        </a>
        <a href="#camino-sistema" className="w-1/2">
          <Button variant="outline" className="w-full text-xs">Ver demo</Button>
        </a>
      </div>
    </div>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="bg-gray-900 pb-24 pt-8 text-center text-xs text-gray-400 md:pb-8 dark:bg-black">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex justify-center">
          <img src="/logo-tentaculo1.png" alt="OctopusTrack" className="h-10 w-auto object-contain" />
        </div>
        <p>OctopusTrack - Gestion comercial para negocios reales.</p>
        <p className="mt-1">{year} OctopusTrack. Todos los derechos reservados.</p>
      </div>
    </footer>
  )
}

function ThankYouPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-950 dark:via-gray-900 dark:to-primary-950">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-3xl border border-primary-200 bg-white p-8 text-center shadow-xl dark:border-primary-800 dark:bg-gray-900">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">Pago confirmado</p>
          <h1 className="mt-2 text-4xl font-extrabold text-gray-900 dark:text-white">Tu cotizador ya esta listo</h1>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600 dark:text-gray-300">
            Aca tenes acceso inmediato al archivo Excel, la version Google Sheets y una guia rapida para arrancar hoy.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <a href={buildAssetWebhookUrl('excel')} target="_blank" rel="noopener noreferrer">
              <Button className="w-full">Obtener Excel</Button>
            </a>
            <a href={buildAssetWebhookUrl('sheets')} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full">Obtener Google Sheets</Button>
            </a>
          </div>

          <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-left text-sm text-gray-700 dark:border-primary-800 dark:bg-primary-900/20 dark:text-gray-200">
            <p className="font-semibold text-gray-900 dark:text-white">Instrucciones rapidas</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Descarga el archivo Excel o duplica la version de Google Sheets.</li>
              <li>Carga tus productos y precios en la pestaña inicial.</li>
              <li>Empeza a cotizar y envia por WhatsApp en minutos.</li>
            </ol>
          </div>

          <p className="mt-6 text-primary-700 dark:text-primary-300">
            Cuando quieras escalar, podes migrar a OctopusTrack sin empezar de cero.
          </p>

          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block">
            <Button variant="secondary" className="border-0 shadow-sm">
              <MessageCircle className="h-5 w-5" />
              Necesito ayuda para configurarlo
            </Button>
          </a>
        </section>
      </div>
    </div>
  )
}

function LandingContent({ loginUrl }: { loginUrl: string }) {
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [buyerEmail, setBuyerEmail] = useState('')

  const isEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(buyerEmail.trim()), [buyerEmail])

  const handleExcelCheckout = async () => {
    if (!isEmailValid) return

    setIsCheckoutLoading(true)

    try {
      await startMercadoPagoCheckout({
        price: 11.99,
        product: 'OctopusTrack - Cotizador Profesional',
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
        `Hola! Quiero contratar el Plan ${plan.name} de OctopusTrack (USD ${plan.price}/mes). Mi email para onboarding es ${buyerEmail.trim()}.`,
      )
    } finally {
      setIsCheckoutLoading(false)
    }
  }

  return (
    <>
      <Header loginUrl={loginUrl} />
      <MobileQuickActions />
      <main>
        <HeroSection />
        <ProductPurchaseSection
          email={buyerEmail}
          setEmail={setBuyerEmail}
          isEmailValid={isEmailValid}
          onBuyExcel={handleExcelCheckout}
          isCheckoutLoading={isCheckoutLoading}
        />
        <ProblemSection />
        <SolutionSection />
        <ChooseStartSection />
        <PlansSection
          email={buyerEmail}
          setEmail={setBuyerEmail}
          isEmailValid={isEmailValid}
          onBuyPlan={handlePlanCheckout}
          isCheckoutLoading={isCheckoutLoading}
        />
        <ScaleSection />
        <ComparisonSection />
      </main>
      <Footer />
      <StickyMobileCTA />
    </>
  )
}

export default function Landing({ loginUrl = '/login' }: LandingProps) {
  const isThankYou = useMemo(() => shouldShowThankYou(), [])

  if (isThankYou) {
    return <ThankYouPage />
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <LandingContent loginUrl={loginUrl} />
    </div>
  )
}
