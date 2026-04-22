/**
 * Landing page con estrategia híbrida: productos Excel + sistema SaaS escalable.
 * Página pública orientada a conversión B2B para sanitarios, ferreterías y corralones.
 * 
 * Modelo comercial:
 * - Entrada: venta de plantillas Excel (one-time)
 * - Escalamiento: sistema SaaS en planes mensuales (USD)
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calculator,
  Clock,
  CheckCircle2,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Star,
  Download,
  Zap,
  BarChart3,
  Building2,
  MessageCircle,
  FileSpreadsheet,
  Rocket,
} from 'lucide-react'
import Button from '../components/ui/Button'

// ============================================================
// Constantes
// ============================================================

const WHATSAPP_URL = import.meta.env.VITE_LANDING_WHATSAPP_URL || 'https://wa.me/5490000000000'

// ============================================================
// Tipos
// ============================================================

interface FAQItem {
  question: string
  answer: string
}

interface ExcelProduct {
  name: string
  description: string
  price: number
  currency: 'ARS' | 'USD'
  features: string[]
  highlighted?: boolean
}

interface SaaSPlan {
  id: string
  name: string
  tagline: string
  price: number
  currency: 'USD'
  period: string
  description: string
  features: string[]
  featured?: boolean
  badge?: string
  cta: string
  ctaVariant: 'primary' | 'secondary' | 'outline'
}

// ============================================================
// Componentes internos
// ============================================================

/**
 * Header simple para landing pública con logo real.
 */
function Header() {
  const navigate = useNavigate()

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo con imagen real */}
          <div className="flex items-center gap-3">
            <img
              src="/logo-tentaculo1.png"
              alt="OctopusTrack - Logo"
              className="h-10 w-auto object-contain"
            />
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#excel"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Excel
            </a>
            <a
              href="#sistema"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Sistema
            </a>
            <a
              href="#planes-sistema"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Planes
            </a>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
            </a>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/login')}
            >
              Iniciar sesión
            </Button>
          </nav>
        </div>
      </div>
    </header>
  )
}

/**
 * Sección Hero con propuesta dual: entrada Excel + escalamiento SaaS.
 */
function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-primary-950 dark:via-primary-900 dark:to-primary-800">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary-300 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-lighten" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-primary-400 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-lighten" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Contenido izquierdo */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-100 dark:bg-primary-800/50 text-primary-700 dark:text-primary-200 text-sm font-medium mb-6">
              <Star className="w-4 h-4" />
              <span>Herramientas profesionales para sanitarios, ferreterías y corralones</span>
            </div>

            {/* Headline principal */}
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight leading-tight">
              Empezá con Excel,
              <br />
              <span className="text-primary-600 dark:text-primary-400">escalá al sistema</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-xl mx-auto lg:mx-0 mb-8">
              Arrancá con plantillas Excel profesionales para cotizar en minutos.
              Cuando tu negocio crezca, migrá a nuestro sistema SaaS completo con
              facturación electrónica, gestión de clientes y agentes IA.
            </p>

            {/* Microcopy de escalamiento */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-100/50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-8">
              <Rocket className="w-4 h-4" />
              <span>Arrancá simple, escalá cuando crezcas</span>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <a href="#excel">
                <Button size="lg" className="px-8">
                  Ver productos Excel
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </a>
              <a href="#planes-sistema">
                <Button size="lg" variant="outline">
                  Conocer el sistema
                </Button>
              </a>
            </div>
          </div>

          {/* Contenido derecho: logo grande */}
          <div className="hidden lg:flex justify-center">
            <img
              src="/logo-tentaculo1.png"
              alt="OctopusTrack - Logo"
              className="w-full max-w-md h-auto object-contain drop-shadow-2xl"
            />
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-16 pt-8 border-t border-primary-200 dark:border-primary-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">
            Soluciones usadas por negocios como el tuyo
          </p>
          <div className="flex flex-wrap justify-center gap-8 opacity-60">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sanitarios</span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Ferreterías</span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Corralones</span>
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Materiales de construcción</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Sección de productos digitales Excel.
 */
function ExcelProductsSection() {
  const products: ExcelProduct[] = [
    {
      name: 'Combo 3 Excel (Oferta)',
      description: 'Llevate los 3 Excels en pack: Cotizador + Cuenta Corriente + Precios. Mejor relación precio/beneficio.',
      price: 20,
      currency: 'USD',
      features: [
        '3 plantillas incluidas',
        'Ahorro vs compra por separado',
        'Migración al sistema sin recargar datos',
        'Guía rápida de uso',
        'Actualización de onboarding incluida',
      ],
      highlighted: true,
    },
    {
      name: 'Cotizador Profesional',
      description: 'Cotizá rápido con formato profesional, IVA automático y envío por WhatsApp.',
      price: 9.99,
      currency: 'USD',
      features: [
        'Base de artículos',
        'Cálculo automático',
        'Formato prolijo para cliente',
        'Exportable y compartible',
      ],
    },
    {
      name: 'Gestor de Cuentas',
      description: 'Seguí saldos, movimientos y estado de tus clientes en una sola plantilla.',
      price: 9.99,
      currency: 'USD',
      features: [
        'Movimientos por cliente',
        'Saldos actualizados',
        'Historial de deuda',
        'Reporte imprimible',
      ],
    },
    {
      name: 'Calculadora de Precios',
      description: 'Definí precios con margen objetivo y costos actualizados sin errores manuales.',
      price: 9.99,
      currency: 'USD',
      features: [
        'Costo + margen automático',
        'Simulación por escenarios',
        'Control de rentabilidad',
        'Fácil de mantener',
      ],
    },
  ]

  // Formateador de precio consistente
  const formatPrice = (price: number, currency: 'ARS' | 'USD') => {
    if (currency === 'USD') {
      return `USD ${price.toFixed(2)}`
    }
    return `$${price.toLocaleString('es-AR')} ARS`
  }

  return (
    <section className="py-20 bg-white dark:bg-gray-900" id="excel">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-100 dark:bg-primary-800/50 text-primary-700 dark:text-primary-200 text-sm font-medium mb-4">
            <Download className="w-4 h-4" />
            <span>Productos digitales</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Plantillas Excel profesionales
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Pagás una vez, usás para siempre. Descargá, personalizá y empezá a cotizar
            en minutos. Sin suscripciones, sin depender de internet.
          </p>
          <p className="mt-4 text-sm font-medium text-primary-700 dark:text-primary-300">
            ✅ Importante: todos los Excel se pueden migrar al sistema completo cuando quieras.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {products.map((product, index) => (
            <div
              key={index}
              className={`relative p-8 rounded-2xl transition-all ${
                product.highlighted
                  ? 'bg-primary-600 dark:bg-primary-700 ring-4 ring-primary-300 dark:ring-primary-500 shadow-xl'
                  : 'bg-gray-50 dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 hover:shadow-lg'
              }`}
            >
              {product.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-500 text-white text-xs font-bold rounded-full">
                  Mejor oferta
                </div>
              )}

              <h3 className={`text-xl font-bold mb-2 ${
                product.highlighted ? 'text-white' : 'text-gray-900 dark:text-white'
              }`}>
                {product.name}
              </h3>

              <p className={`text-sm mb-4 ${
                product.highlighted ? 'text-primary-100' : 'text-gray-600 dark:text-gray-400'
              }`}>
                {product.description}
              </p>

              <div className={`text-3xl font-bold mb-1 ${
                product.highlighted ? 'text-white' : 'text-gray-900 dark:text-white'
              }`}>
                {formatPrice(product.price, product.currency)}
              </div>
              <div className={`text-sm mb-6 ${
                product.highlighted ? 'text-primary-200' : 'text-gray-500'
              }`}>
                pago único
              </div>

              <ul className="space-y-3 mb-8">
                {product.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${
                      product.highlighted ? 'text-primary-200' : 'text-primary-600'
                    }`} />
                    <span className={`text-sm ${
                      product.highlighted ? 'text-primary-50' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <div className={product.highlighted ? 'text-white' : ''}>
                <Button
                  className="w-full"
                  variant={product.highlighted ? 'secondary' : 'primary'}
                >
                  Comprar ahora
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 max-w-4xl mx-auto p-5 rounded-2xl border border-primary-200 dark:border-primary-700 bg-primary-50/70 dark:bg-primary-900/30">
          <p className="text-sm sm:text-base text-primary-800 dark:text-primary-200 text-center">
            Si hoy comprás Excel, mañana podés migrar al sistema sin arrancar de cero:
            mantenés estructura, datos y flujo de trabajo.
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * Sección de beneficios del sistema SaaS.
 */
function SystemBenefitsSection() {
  const benefits = [
    {
      icon: Clock,
      title: 'Ahorrá hasta 40 minutos por día',
      description: 'El tiempo que gastás armando presupuestos a mano ahora usalo para atender clientes.',
    },
    {
      icon: CheckCircle2,
      title: 'Eliminá errores de cálculo',
      description: 'Fórmulas automatizadas que hacen los números por vos. Olvidate de errores de cuenta.',
    },
    {
      icon: TrendingUp,
      title: 'Imagen profesional',
      description: 'Cotizaciones con formato perfecto, listas para enviar por WhatsApp o guardar como PDF.',
    },
    {
      icon: Calculator,
      title: 'Control de márgenes',
      description: 'Calculá precios con margen exacto. No perdás más plata por precios mal calculados.',
    },
  ]

  return (
    <section className="py-20 bg-gray-50 dark:bg-gray-950" id="sistema">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-100 dark:bg-primary-800/50 text-primary-700 dark:text-primary-200 text-sm font-medium mb-4">
            <Zap className="w-4 h-4" />
            <span>Sistema SaaS escalable</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Potenciá tu negocio con el sistema
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Cuando estés listo para escalar, accedé al sistema completo.
            Facturación electrónica, gestión de clientes, agentes IA y más.
            Sin límite de productos, sin límite de usuarios.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-white dark:bg-gray-800 hover:shadow-lg transition-shadow"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-600 dark:bg-primary-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <benefit.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {benefit.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        {/* Comparativa simple */}
        <div className="mt-16 max-w-3xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center">
              Excel vs Sistema
            </h3>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Columna Excel */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileSpreadsheet className="w-5 h-5 text-primary-600" />
                  <span className="font-semibold text-gray-900 dark:text-white">Excel</span>
                </div>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Pago único</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Sin internet</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Hasta 20.000 productos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Actualización manual</span>
                  </li>
                </ul>
              </div>
              {/* Columna Sistema */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-primary-600" />
                  <span className="font-semibold text-gray-900 dark:text-white">Sistema SaaS</span>
                </div>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Suscripción mensual</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Acceso desde cualquier dispositivo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Productos ilimitados</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Facturación electrónica + IA</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Sección de planes del sistema SaaS.
 */
function SaaSPlansSection() {
  const plans: SaaSPlan[] = [
    {
      id: 'basico',
      name: 'Básico',
      tagline: 'Para empezar',
      price: 129,
      currency: 'USD',
      period: 'mes',
      description: 'Ideal para arrancar digitalizando cotizaciones y productos.',
      features: [
        'Cotizaciones ilimitadas',
        'Actualización de precios en lote',
        'Carga de productos (hasta 20.000)',
        'Plantillas Excel compatibles',
      ],
      badge: undefined,
      cta: 'Elegir Básico',
      ctaVariant: 'outline',
    },
    {
      id: 'standard',
      name: 'Standard',
      tagline: 'El más popular',
      price: 249,
      currency: 'USD',
      period: 'mes',
      description: 'Gestión completa de clientes y cuenta corriente.',
      features: [
        'Todo lo de Básico',
        'Remitos digitales',
        'Cuenta corriente de clientes',
        'Reportes de ventas',
      ],
      featured: false,
      badge: 'Popular',
      cta: 'Elegir Standard',
      ctaVariant: 'primary',
    },
    {
      id: 'premium',
      name: 'Premium',
      tagline: 'Escalamiento profesional',
      price: 399,
      currency: 'USD',
      period: 'mes',
      description: 'Incluye facturación electrónica ARCA/AFIP para profesionalizar tu operación.',
      features: [
        'Todo lo de Standard',
        'Facturación electrónica (CAE)',
        'Facturas A, B y C',
        'Notas de crédito y débito',
        'Integración ARCA completa',
      ],
      featured: false,
      badge: 'Para escalar',
      cta: 'Elegir Premium',
      ctaVariant: 'outline',
    },
    {
      id: 'enterprise',
      name: 'Platinum IA',
      tagline: 'Plan más completo',
      price: 600,
      currency: 'USD',
      period: 'mes',
      description: 'Agente IA + mejoras a medida. Tope de valor para operación avanzada.',
      features: [
        'Todo lo de Premium',
        'Agente IA para consultas',
        'Automatizaciones personalizadas',
        'Mejoras a medida',
        'Soporte prioritario 24/7',
        'API personalizada',
      ],
      featured: true,
      badge: 'IA incluida',
      cta: 'Contactar ventas',
      ctaVariant: 'secondary',
    },
  ]

  return (
    <section className="py-20 bg-white dark:bg-gray-900" id="planes-sistema">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-100 dark:bg-primary-800/50 text-primary-700 dark:text-primary-200 text-sm font-medium mb-4">
            <BarChart3 className="w-4 h-4" />
            <span>Planes del sistema</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Elegí el plan que mejor se adapte a tu negocio
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Sin contratos. Cancelá cuando quieras.
            <strong> Arrancá simple, escalá cuando crezcas.</strong>
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col p-6 rounded-2xl transition-all ${
                plan.featured
                  ? 'bg-primary-600 dark:bg-primary-700 ring-4 ring-primary-300 dark:ring-primary-500 shadow-xl'
                  : 'bg-gray-50 dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-500 text-white text-xs font-bold rounded-full">
                  {plan.badge}
                </div>
              )}

              <div className="mb-4">
                <h3 className={`text-lg font-bold ${
                  plan.featured ? 'text-white' : 'text-gray-900 dark:text-white'
                }`}>
                  {plan.name}
                </h3>
                <p className={`text-sm ${
                  plan.featured ? 'text-primary-200' : 'text-gray-500'
                }`}>
                  {plan.tagline}
                </p>
              </div>

              <div className="mb-1">
                {plan.id === 'enterprise' ? (
                  <div className={`text-3xl font-bold ${
                    plan.featured ? 'text-white' : 'text-gray-900 dark:text-white'
                  }`}>
                    Desde USD {plan.price}
                  </div>
                ) : (
                  <>
                    <span className={`text-3xl font-bold ${
                      plan.featured ? 'text-white' : 'text-gray-900 dark:text-white'
                    }`}>
                      USD {plan.price}
                    </span>
                    <span className={`text-sm ${
                      plan.featured ? 'text-primary-200' : 'text-gray-500'
                    }`}>
                      /{plan.period}
                    </span>
                  </>
                )}
              </div>

              <p className={`text-sm mb-6 ${
                plan.featured ? 'text-primary-100' : 'text-gray-600 dark:text-gray-400'
              }`}>
                {plan.description}
              </p>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${
                      plan.featured ? 'text-primary-200' : 'text-primary-600'
                    }`} />
                    <span className={`text-sm ${
                      plan.featured ? 'text-primary-50' : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                variant={plan.ctaVariant}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>

        {/* Nota de escalamiento */}
        <div className="mt-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            Todos los planes incluyen 1 usuario.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Usuarios adicionales: Básico USD 12/mes • Standard USD 15/mes • Premium USD 20/mes • Platinum IA USD 25/mes
          </p>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ¿Empezaste con Excel? Podés migrar al sistema cuando quieras.
            <a href="#excel" className="text-primary-600 hover:underline ml-1">
              Ver productos Excel
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * Sección de preguntas frecuentes actualizada.
 */
function FAQSection() {
  const faqs: FAQItem[] = [
    {
      question: '¿Empiezo con Excel o directamente con el sistema?',
      answer: 'Depende de tu situación actual. Si arrancás de cero o querés algo simple, las plantillas Excel son perfectas. Si ya manejás muchos clientes y necesitás facturación electrónica, arrancá con el sistema.',
    },
    {
      question: '¿Puedo migrar de Excel al sistema después?',
      answer: 'Sí, totalmente. Todos los Excel están pensados para migrar al sistema completo sin arrancar de cero. Importamos estructura y datos para que no pierdas trabajo.',
    },
    {
      question: '¿Necesito saber Excel avanzado para usar las plantillas?',
      answer: 'No. Nuestras plantillas están diseñadas para que cualquier persona pueda usarlas. Solo necesitás saber lo básico: abrir un archivo, escribir y guardar.',
    },
    {
      question: '¿Qué incluye la facturación electrónica?',
      answer: 'El plan Premium incluye la integración completa con ARCA/AFIP para emitir Facturas A, B y C con CAE, código QR y código de barras. También incluye Notas de Crédito y Débito.',
    },
    {
      question: '¿El precio de los planes es en dólares?',
      answer: 'Sí, tanto los planes del sistema como las plantillas Excel de esta landing se expresan en USD. Aceptamos pago con tarjeta internacional, transferencia bancaria y Mercado Pago (con recargo).',
    },
    {
      question: '¿Puedo cancelar mi suscripción cuando quiera?',
      answer: 'Sí, sin permanencia ni penalizaciones. Cancelás desde el panel y seguís usando el servicio hasta fin de período. Tus datos se pueden exportar en cualquier momento.',
    },
  ]

  const [isOpen, setIsOpen] = useState<number | null>(null)

  return (
    <section className="py-20 bg-gray-50 dark:bg-gray-950" id="faq">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Preguntas frecuentes
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800"
            >
              <button
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setIsOpen(isOpen === index ? null : index)}
                aria-expanded={isOpen === index}
              >
                <span className="font-medium text-gray-900 dark:text-white pr-4">
                  {faq.question}
                </span>
                {isOpen === index ? (
                  <ChevronUp className="w-5 h-5 text-primary-600 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
              </button>
              {isOpen === index && (
                <div className="px-6 pb-4 text-gray-600 dark:text-gray-400">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * CTA final para conversión dual.
 */
function CTASection() {
  return (
    <section className="py-20 bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          ¿Listo para empezar?
        </h2>
        <p className="text-lg text-primary-100 mb-8 max-w-2xl mx-auto">
          Arrancá con Excel hoy o agendá una demo del sistema.
          Sin compromiso, sin contrato.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#excel">
            <Button
              size="lg"
              variant="secondary"
              className="border-0 shadow-sm"
            >
              <FileSpreadsheet className="w-5 h-5 mr-2" />
              Comprar Excel
            </Button>
          </a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            <Button
              size="lg"
              variant="outline"
              className="text-white border-white hover:bg-primary-800"
            >
              <Rocket className="w-5 h-5 mr-2" />
              Agendar demo del sistema
            </Button>
          </a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            <Button
              size="lg"
              variant="outline"
              className="text-white border-white hover:bg-primary-800"
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              Escribir por WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </section>
  )
}

/**
 * Footer con logo.
 */
function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="py-12 bg-gray-900 dark:bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo e info */}
          <div className="flex flex-col items-center md:items-start gap-4">
            <img
              src="/logo-tentaculo1.png"
              alt="OctopusTrack - Logo"
              className="h-12 w-auto object-contain"
            />
            <p className="text-sm text-gray-400 text-center md:text-left">
              Herramientas profesionales para sanitarios, ferreterías y corralones.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <a href="#excel" className="text-gray-400 hover:text-primary-400 transition-colors">
              Productos Excel
            </a>
            <a href="#planes-sistema" className="text-gray-400 hover:text-primary-400 transition-colors">
              Planes del sistema
            </a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary-400 transition-colors">
              Contacto
            </a>
          </div>

          {/* Copyright */}
          <p className="text-sm text-gray-500">
            © {currentYear} OctopusTrack. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}

// ============================================================
// Componente principal
// ============================================================

/**
 * Landing pública con estrategia híbrida: productos Excel + sistema SaaS.
 */
export default function Landing() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Header />
      <main>
        <HeroSection />
        <ExcelProductsSection />
        <SystemBenefitsSection />
        <SaaSPlansSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
