'use client'

import { useState, useEffect } from 'react'
import AnimatedTentacleLogo from './AnimatedTentacleLogo'

const NAV_LINKS = [
  { label: 'Cotizador Excel', href: '#excel' },
  { label: 'Características', href: '#caracteristicas' },
  { label: 'Precios', href: '#precios' },
  { label: 'FAQ', href: '#faq' },
]

function MenuIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  /* Cerrar menú al hacer click fuera */
  useEffect(() => {
    if (!mobileOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-navbar]')) setMobileOpen(false)
    }
    setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => document.removeEventListener('click', handleClick)
  }, [mobileOpen])

  const scrollTo = (href: string) => {
    setMobileOpen(false)
    const id = href.replace('#', '')
    const el = document.getElementById(id)
    if (el) {
      const offset = 90
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
    }
  }

  return (
    <header data-navbar className="fixed top-0 left-0 w-full z-50 border-b border-white/10 backdrop-blur-md bg-[#0a0a14]/80 shadow-xl">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-3">
        {/* Logo animado del tentáculo */}
        <a href="/" className="flex items-center gap-2">
          <AnimatedTentacleLogo className="h-10 w-auto" />
        </a>

        {/* Desktop nav links (sm+) */}
        <nav className="hidden sm:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              onClick={() => scrollTo(link.href)}
              className="font-body text-base font-medium text-white/60 hover:text-white transition-colors"
            >
              {link.label}
            </button>
          ))}
          <a
            href="/acceder"
            className="font-body text-base font-medium text-white/60 hover:text-white transition-colors px-4 py-2"
          >
            Iniciar sesión
          </a>
          <a
            href="https://wa.me/5492254596618?text=Quiero%20probar%20OctopusTrack"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary-gradient px-5 py-2 rounded-lg font-semibold text-white text-sm hover:opacity-90 active:scale-95 transition-all duration-300"
          >
            Probar sistema
          </a>
        </nav>

        {/* Hamburger (solo mobile) */}
        <button
          className="sm:hidden flex items-center justify-center w-10 h-10 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {mobileOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Menú desplegable (mobile + desktop) */}
      {mobileOpen && (
        <>
          {/* Overlay */}
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-full w-72 mr-4 mt-2 z-50 bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold px-3 pb-2">Navegación</p>
            {NAV_LINKS.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href)}
                className="block w-full text-left font-body text-base font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors px-3 py-2.5 rounded-xl"
              >
                {link.label}
              </button>
            ))}
            <hr className="border-white/10 my-3" />
            <a
              href="/acceder"
              className="block w-full text-center font-body text-base font-medium text-white/60 hover:text-white transition-colors py-2.5 rounded-xl hover:bg-white/5"
              onClick={() => setMobileOpen(false)}
            >
              Iniciar sesión
            </a>
          </div>
        </>
      )}
    </header>
  )
}
