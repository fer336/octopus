import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

type AnimatedTentacleLogoProps = {
  className?: string
  alt?: string
}

/**
 * Logo animado con GSAP sobre el SVG real del tentáculo.
 * Fase 1: enrolla/desenrolla lentamente.
 * Fase 2: deriva suave (movimiento flotante) en loop.
 */
export default function AnimatedTentacleLogo({ className = 'h-12 w-auto', alt = 'OctopusTrack' }: AnimatedTentacleLogoProps) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const [svgMarkup, setSvgMarkup] = useState<string>('')

  useEffect(() => {
    let mounted = true

    fetch('/images/logos/logo-header.svg')
      .then((response) => response.text())
      .then((text) => {
        if (mounted) setSvgMarkup(text)
      })
      .catch(() => {
        if (mounted) setSvgMarkup('')
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!svgMarkup || !wrapperRef.current) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const svg = wrapperRef.current.querySelector('svg')
    if (!svg) return

    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.style.display = 'block'

    const ctx = gsap.context(() => {
      gsap.set(svg, {
        transformOrigin: '50% 50%',
      })

      gsap.to(svg, {
        y: -7,
        duration: 3.8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      })
    }, wrapperRef)

    return () => ctx.revert()
  }, [svgMarkup])

  if (!svgMarkup) {
    return <img src="/images/logos/logo-header@2x.png" alt={alt} className={className} />
  }

  return (
    <span
      ref={wrapperRef}
      aria-label={alt}
      role="img"
      className={`inline-flex overflow-visible ${className}`}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  )
}
