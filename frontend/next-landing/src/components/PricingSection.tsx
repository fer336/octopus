'use client'

import { useState, useCallback } from 'react'

/* ── Inline SVG Icons ── */

function ShieldIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function HeadphonesIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}

function StarIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

/* ── Planes de referencia (sin detalle) ── */

const PLANS = [
  { name: 'BÁSICO', price: '$21' },
  { name: 'NEGOCIO', price: '$42' },
  { name: 'COMPLETO', price: '$72', featured: true },
  { name: 'PREMIUM', price: '$111' },
]

/* ── Opciones del formulario ── */

type FacturasOption = 'menos-50' | '50-200' | 'mas-200' | null
type SistemaOption = 'nada' | 'excel' | 'otro' | null

export default function PricingSection() {
  const [email, setEmail] = useState('')
  const [facturas, setFacturas] = useState<FacturasOption>(null)
  const [sistema, setSistema] = useState<SistemaOption>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const isValid = email && /\S+@\S+\.\S+/.test(email) && facturas && sistema

  const handleSubmit = useCallback(async () => {
    if (!isValid || isSubmitting) return
    setIsSubmitting(true)
    setError('')

    try {
      const payload = {
        email,
        entry_point: 'pricing-section',
        product: 'octopustrack-saas',
        facturas_mes: facturas,
        sistema_actual: sistema,
      }

      /* Fire & forget al webhook — no bloqueamos la UX */
      fetch('https://n8n.octopustrack.shop/webhook/octopus-formulario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => { /* Silently ignore webhook errors */ })

      setSubmitted(true)

      /* Abrir WhatsApp para agendar la demo */
      const msg = encodeURIComponent(
        `Hola%20${email.split('@')[0]}%21%20Quiero%20agendar%20una%20demo%20de%20OctopusTrack.%0A%0A📊%20Facturas%3A%20${facturas === 'menos-50' ? 'Menos+de+50' : facturas === '50-200' ? '50+-+200' : 'Más+de+200'}%2Fmes%0A💻%20Sistema%20actual%3A%20${sistema === 'nada' ? 'Ninguno' : sistema === 'excel' ? 'Excel' : 'Otro+sistema'}`
      )
      setTimeout(() => {
        window.open(`https://wa.me/5492254596618?text=${msg}`, '_blank')
      }, 500)
    } catch {
      setError('Algo salió mal. Probá de nuevo o escribinos directo a WhatsApp.')
    } finally {
      setIsSubmitting(false)
    }
  }, [email, facturas, sistema, isValid, isSubmitting])

  const handleReset = () => {
    setEmail('')
    setFacturas(null)
    setSistema(null)
    setSubmitted(false)
    setError('')
  }

  return (
    <section className="relative overflow-hidden bg-[#0a0a14] px-4 py-20 sm:px-6 sm:py-24 lg:py-28" id="precios">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/[0.03] blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/[0.02] blur-[120px] rounded-full pointer-events-none" />

      <div className="relative mx-auto max-w-6xl">
        {/* ── Section header ── */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 mb-4">
            <ShieldIcon className="w-3 h-3 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-primary/90">
              Sin permanencia
            </span>
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
            Planes desde{' '}
            <span className="text-gradient">$21/mes</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-white/60 max-w-xl mx-auto">
            Facturación electrónica ARCA, control de stock, cuentas corrientes y más.
            Sin sorpresas. Cancelá cuando quieras.
          </p>
        </div>

        {/* ── Lead form card ── */}
        {!submitted ? (
          <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-gradient-to-br from-[#17172a]/90 via-[#1b1b33]/80 to-[#141428]/90 p-6 sm:p-8 shadow-[0_20px_60px_rgba(93,63,211,0.12)] backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/20">
                <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <div>
                <h3 className="text-lg font-bold text-white">Contanos de tu negocio</h3>
                <p className="text-sm text-white/50">Te mostramos el sistema en vivo, sin compromiso</p>
              </div>
            </div>

            {/* Email */}
            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                Email*
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                autoComplete="email"
              />
            </div>

            {/* Facturas por mes */}
            <div className="mb-5">
              <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                ¿Cuántas facturas emitís por mes?
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {([
                  { value: 'menos-50', label: 'Menos de 50' },
                  { value: '50-200', label: '50 - 200' },
                  { value: 'mas-200', label: 'Más de 200' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFacturas(opt.value)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                      facturas === opt.value
                        ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_15px_-3px_rgba(124,58,237,0.2)]'
                        : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sistema actual */}
            <div className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-3">
                ¿Usás algún sistema actualmente?
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {([
                  { value: 'nada', label: 'No, todo a mano' },
                  { value: 'excel', label: 'Sí, Excel' },
                  { value: 'otro', label: 'Sí, otro' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSistema(opt.value)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
                      sistema === opt.value
                        ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_15px_-3px_rgba(124,58,237,0.2)]'
                        : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
            )}

            {/* CTA */}
            <button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              className="w-full py-3.5 rounded-xl font-bold text-white text-base shadow-[0_10px_20px_-5px_rgba(124,58,237,0.4)] hover:brightness-110 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100 flex items-center justify-center gap-2.5"
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
              }}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Enviando...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Agendá una demo de 20 minutos
                </>
              )}
            </button>

            <p className="mt-3 text-center text-xs text-white/30 flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
              Sin compromiso • Te mostramos el sistema en vivo
            </p>
          </div>
        ) : (
          /* ── Success state ── */
          <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-gradient-to-br from-[#17172a]/90 via-[#1b1b33]/80 to-[#141428]/90 p-8 sm:p-10 text-center shadow-[0_20px_60px_rgba(93,63,211,0.12)] backdrop-blur-sm">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-5">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">¡Gracias, {email.split('@')[0]}!</h3>
            <p className="text-white/60 mb-6">
              Te redirigimos a WhatsApp para coordinar tu demo de 20 minutos.
              <br />
              Respondemos al toque.
            </p>
            <div className="flex items-center justify-center gap-3">
              <a
                href="https://wa.me/5492254596618?text=Hola%2C%20quiero%20agendar%20una%20demo"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 font-bold text-white text-sm transition-all"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Ir a WhatsApp
              </a>
              <button
                onClick={handleReset}
                className="rounded-xl border border-white/20 px-5 py-2.5 text-white/60 hover:text-white hover:bg-white/5 text-sm font-medium transition-all"
              >
                Cargar otro
              </button>
            </div>
          </div>
        )}

        {/* ── Planes de referencia (solo precio, sin detalle) ── */}
        <div className="mt-12 lg:mt-16">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-white/30 mb-5">
            Planes disponibles
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border px-4 py-4 text-center transition-all ${
                  plan.featured
                    ? 'border-primary/40 bg-primary/10 shadow-[0_0_20px_-5px_rgba(124,58,237,0.15)]'
                    : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                {plan.featured && (
                  <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">
                    <StarIcon className="w-3 h-3" />
                    Más elegido
                  </div>
                )}
                <p className={`font-bold text-sm ${plan.featured ? 'text-white' : 'text-white/60'}`}>
                  {plan.name}
                </p>
                <p className={`text-lg font-extrabold mt-0.5 ${plan.featured ? 'text-primary' : 'text-white/80'}`}>
                  {plan.price}
                  <span className="text-xs font-normal text-white/40">/mes</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Trust bar ── */}
        <div className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-10 text-white/50 text-sm font-medium border-t border-white/5 pt-8">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">✅</span>
            7 días de garantía
          </div>
          <div className="flex items-center gap-2">
            <ShieldIcon className="w-4 h-4 text-blue-400" />
            Datos seguros
          </div>
          <div className="flex items-center gap-2">
            <HeadphonesIcon className="w-4 h-4 text-primary-dim" />
            Soporte dedicado
          </div>
        </div>
      </div>
    </section>
  )
}
