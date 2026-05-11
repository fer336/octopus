'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { gsap } from 'gsap'

interface CarouselSlide {
  desktop: string   // 16:9-ish image for desktop
  mobile: string    // 9:16 image for mobile
  alt: string
  label?: string
}

const SLIDES: CarouselSlide[] = [
  {
    desktop: '/images/octopustrack-hero.png',
    mobile: '/images/octopustrack-9:16.png',
    alt: 'Dashboard OctopusTrack',
  },
  {
    desktop: '/images/octopustrack-hero-mobile.png',
    mobile: '/images/octopustrack-sistema-mobile-9:16.png',
    alt: 'Sistema OctopusTrack vista general',
  },
  {
    desktop: '/images/octopustrack-sistema-ventajas.png',
    mobile: '/images/todo-misma-pantalla.png',
    alt: 'Ventajas del sistema OctopusTrack',
  },
]

export default function HeroCarousel() {
  const [current, setCurrent] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const imageRefs = useRef<(HTMLImageElement | null)[]>([])
  const bgRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const transitionRef = useRef<gsap.core.Timeline | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isTransitioning = useRef(false)

  const slides = isMobile ? SLIDES.slice(0, 2) : SLIDES
  const len = slides.length

  /* ── Detect mobile viewport ── */
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  /* ── Ken Burns animation on active slide ── */
  const playKenBurns = useCallback((index: number, reverse = false) => {
    const img = imageRefs.current[index]
    if (!img) return

    /* Kill any previous Ken Burns on this slide */
    gsap.killTweensOf(img)

    if (reverse) {
      /* Reset scale when leaving */
      gsap.set(img, { scale: 1, x: '0%', y: '0%' })
      return
    }

    /* Enter: start slightly zoomed, then slowly zoom in more */
    gsap.set(img, { scale: 1.05, x: '0%', y: '0%' })
    gsap.to(img, {
      scale: 1.12,
      duration: 8,
      ease: 'none',
      /* Slight directional shift for organic feel */
      x: `${(index % 2 === 0 ? 2 : -2)}%`,
      y: `${(index % 2 === 0 ? -1 : 1)}%`,
    })
  }, [])

  /* ── Transition between slides ── */
  const goTo = useCallback((index: number) => {
    if (isTransitioning.current) return
    const target = (index % len + len) % len
    if (target === current) return

    isTransitioning.current = true

    const currentSlide = slideRefs.current[current]
    const nextSlide = slideRefs.current[target]
    if (!currentSlide || !nextSlide) return

    /* Kill Ken Burns on outgoing */
    playKenBurns(current, true)

    /* Kill any previous transition */
    if (transitionRef.current) {
      transitionRef.current.kill()
    }

    const tl = gsap.timeline({
      onComplete: () => {
        setCurrent(target)
        isTransitioning.current = false
      },
    })

    /* Outgoing: slight scale up + fade */
    tl.to(currentSlide, {
      opacity: 0,
      scale: 1.08,
      duration: 0.5,
      ease: 'power2.inOut',
    }, 0)

    /* Incoming: start scaled, fade in */
    tl.set(nextSlide, {
      opacity: 0,
      scale: 1.05,
    }, 0)

    tl.to(nextSlide, {
      opacity: 1,
      scale: 1,
      duration: 0.7,
      ease: 'power3.out',
    }, 0.25) /* stagger start halfway through fade-out */

    /* Start Ken Burns on new slide */
    tl.call(() => playKenBurns(target, false), [], 0.8)

    transitionRef.current = tl
  }, [current, len, playKenBurns])

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  /* ── Auto-play ── */
  useEffect(() => {
    if (isPaused || len <= 1) return
    intervalRef.current = setInterval(next, 6000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPaused, next, len])

  /* ── Init first slide ── */
  useEffect(() => {
    playKenBurns(0, false)
    /* Active glow at start */
    if (bgRef.current) {
      gsap.fromTo(bgRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 1.5, ease: 'power2.out' }
      )
    }
    return () => {
      if (transitionRef.current) transitionRef.current.kill()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Reset Ken Burns when current changes ── */
  useEffect(() => {
    /* Ensure all other slides are hidden */
    slideRefs.current.forEach((el, i) => {
      if (!el) return
      gsap.set(el, {
        opacity: i === current ? 1 : 0,
        scale: i === current ? 1 : 1.05,
      })
    })
  }, [current])

  /* ── Touch / mouse drag ── */
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const dragDelta = useRef(0)

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY }
    dragDelta.current = 0
    setIsPaused(true)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return
    dragDelta.current = e.clientX - dragStart.current.x
  }

  const handlePointerUp = () => {
    if (!dragStart.current) return
    if (Math.abs(dragDelta.current) > 50) {
      dragDelta.current > 0 ? prev() : next()
    }
    dragStart.current = null
    dragDelta.current = 0
    setTimeout(() => setIsPaused(false), 3000)
  }

  const handlePointerLeave = () => {
    if (dragStart.current) {
      dragStart.current = null
      dragDelta.current = 0
      setTimeout(() => setIsPaused(false), 3000)
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl bg-[#08080f] select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setTimeout(() => setIsPaused(false), 2000)}
      style={{ touchAction: 'pan-y' }}
    >
      {/* ── Blurred background mirror ── */}
      <div
        ref={bgRef}
        className="absolute inset-0 z-0 opacity-50"
        style={{ filter: 'blur(60px) saturate(1.5)', transform: 'scale(1.2)' }}
      >
        {slides.map((slide, i) => (
          <img
            key={i}
            src={isMobile ? slide.mobile : slide.desktop}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
              i === current ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
      </div>

      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-transparent via-transparent to-black/30 pointer-events-none" />

      {/* ── Slides container ── */}
      <div
        className="relative z-[2] mx-auto"
        style={{
          aspectRatio: isMobile ? '9 / 16' : '16 / 9',
          maxHeight: isMobile ? '85vh' : '75vh',
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            ref={(el) => { slideRefs.current[i] = el }}
            className="absolute inset-0 flex items-center justify-center p-[1px]"
            style={{
              opacity: i === 0 ? 1 : 0,
              scale: i === 0 ? 1 : 1.05,
            }}
          >
            <img
              ref={(el) => { imageRefs.current[i] = el }}
              src={isMobile ? slide.mobile : slide.desktop}
              alt={slide.alt}
              draggable={false}
              className="w-full h-full object-cover"
              style={{ willChange: 'transform' }}
            />
          </div>
        ))}
      </div>

      {/* ── Top fade gradient ── */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#08080f] to-transparent z-[3] pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#08080f] to-transparent z-[3] pointer-events-none" />

      {/* ── Navigation arrows ── */}
      {len > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 border border-white/15 text-white backdrop-blur-md transition-all hover:bg-primary hover:scale-110 active:scale-95 hover:shadow-[0_0_20px_-5px_rgba(124,58,237,0.5)]"
            aria-label="Anterior"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 border border-white/15 text-white backdrop-blur-md transition-all hover:bg-primary hover:scale-110 active:scale-95 hover:shadow-[0_0_20px_-5px_rgba(124,58,237,0.5)]"
            aria-label="Siguiente"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* ── Dots with progress bar ── */}
      {len > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="group relative"
              aria-label={`Ir a slide ${i + 1}`}
            >
              <div className="h-2 rounded-full transition-all duration-500 overflow-hidden bg-white/20"
                style={{ width: i === current ? '40px' : '8px' }}
              >
                {i === current && (
                  <div
                    className="h-full bg-primary rounded-full animate-progress"
                    style={{
                      animation: 'progressBar 6s linear',
                      animationPlayState: isPaused ? 'paused' : 'running',
                    }}
                  />
                )}
              </div>
            </button>
          ))}

          {/* Counter */}
          <span className="ml-2 text-xs font-medium text-white/50 font-mono">
            {String(current + 1).padStart(2, '0')}/{String(len).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  )
}
