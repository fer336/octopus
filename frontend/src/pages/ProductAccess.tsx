import Button from '../components/ui/Button'
import { ArrowLeft } from 'lucide-react'
import AnimatedTentacleLogo from '../components/ui/AnimatedTentacleLogo'

const OCTOPUS_TRACK_LOGIN_URL = import.meta.env.VITE_OCTOPUS_TRACK_LOGIN_URL
const OCTOPUS_FLOW_LOGIN_URL = import.meta.env.VITE_OCTOPUS_FLOW_LOGIN_URL

const DEFAULT_OCTOPUS_TRACK_LOGIN_URL = 'https://app.octopustrack.shop'
const DEFAULT_OCTOPUS_FLOW_LOGIN_URL = 'https://login-flow.octopustrack.shop'

function resolveLoginUrl(
  envName: string,
  value: string | undefined,
  fallback: string,
): { href: string; enabled: boolean } {
  if (value && value.trim().length > 0) {
    return { href: value.trim(), enabled: true }
  }

  console.warn(`[ProductAccess] Missing env var ${envName}. Using fallback: ${fallback}`)
  return { href: fallback, enabled: true }
}

const products = [
  {
    name: 'OctopusTrack',
    image: '/OC-ERP.png',
    ...resolveLoginUrl(
      'VITE_OCTOPUS_TRACK_LOGIN_URL',
      OCTOPUS_TRACK_LOGIN_URL,
      DEFAULT_OCTOPUS_TRACK_LOGIN_URL,
    ),
    buttonClassName: '',
  },
  {
    name: 'OctopusFlow',
    image: '/OF-Cotizador.png',
    ...resolveLoginUrl(
      'VITE_OCTOPUS_FLOW_LOGIN_URL',
      OCTOPUS_FLOW_LOGIN_URL,
      DEFAULT_OCTOPUS_FLOW_LOGIN_URL,
    ),
    buttonClassName: 'bg-sky-500 hover:bg-sky-600 focus:ring-sky-400',
  },
]

/**
 * Pantalla de selección de producto previa al login.
 * Mantiene el lenguaje visual de la landing y deriva a cada sistema.
 */
export default function ProductAccess() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080810] px-4 pb-10 pt-24 text-white sm:px-6 sm:pt-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-180px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary-600/15 blur-3xl" />
        <div className="absolute bottom-[-160px] right-[12%] h-[280px] w-[280px] rounded-full bg-violet-500/10 blur-[100px]" />
      </div>

      <header className="animate-fade-in-up fixed left-0 right-0 top-0 z-30 border-b border-white/10 bg-[#0d0d1a]/80 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="/landing" className="flex items-center gap-2 text-sm font-medium text-white/90 transition hover:text-white">
            <AnimatedTentacleLogo className="h-[36px] w-[36px]" alt="OctopusTrack" />
            <span>OctopusTrack</span>
          </a>

          <a
            href="/landing"
            aria-label="Volver a la web principal"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/85 transition hover:border-white/35 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-5xl items-center">
        <div className="w-full">
        <header className="mb-8 text-center sm:mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-300/90">Seleccioná tu producto</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">¿A qué plataforma querés ingresar?</h1>
        </header>

        <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
          {products.map((product) => (
            <article
              key={product.name}
              style={{ animationDelay: product.name === 'OctopusTrack' ? '120ms' : '240ms' }}
              className="group animate-fade-in-up rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_12px_32px_rgba(8,8,16,0.35)] transition-all duration-300 hover:-translate-y-1 hover:border-primary-400/40 hover:shadow-[0_20px_48px_rgba(41,57,253,0.22)] sm:p-6"
            >
              <div className="flex h-[260px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#111122]/85 p-3 sm:h-[320px]">
                <img
                  src={product.image}
                  alt={product.name}
                  className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.015]"
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white sm:text-xl">{product.name}</h2>
                <a
                  href={product.href}
                  target={product.enabled ? '_blank' : undefined}
                  rel={product.enabled ? 'noopener noreferrer' : undefined}
                  aria-disabled={!product.enabled}
                  className={`shrink-0 ${!product.enabled ? 'pointer-events-none opacity-60' : ''}`.trim()}
                  title={product.enabled ? undefined : 'Configuración pendiente: URL de acceso no definida'}
                >
                  <Button
                    className={`cta-shimmer min-w-[150px] transition-transform duration-200 hover:scale-[1.03] ${product.buttonClassName}`.trim()}
                    disabled={!product.enabled}
                  >
                    Iniciar Sesión
                  </Button>
                </a>
              </div>
            </article>
          ))}
        </div>
        </div>
      </section>
    </main>
  )
}
