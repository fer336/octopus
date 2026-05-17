/**
 * Componente Modal reutilizable.
 * Soporta diferentes tamaños, cierre con ESC y click fuera.
 */
import { ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { isMobile } from '../../utils/device'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton?: boolean
  containerClassName?: string
  headerClassName?: string
  contentClassName?: string
  titleClassName?: string
  closeButtonClassName?: string
  frameClassName?: string
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  containerClassName,
  headerClassName,
  contentClassName,
  titleClassName,
  closeButtonClassName,
  frameClassName,
}: ModalProps) {
  // Cerrar con ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Prevent keyboard from opening on mobile when a modal mounts with an autoFocus input
  useEffect(() => {
    if (!isOpen || !isMobile()) return
    const t = setTimeout(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    }, 0)
    return () => clearTimeout(t)
  }, [isOpen])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-md w-full',
    md: 'max-w-lg w-full',
    lg: 'max-w-3xl w-full',
    xl: 'max-w-6xl w-full',
    full: 'max-w-[90vw] w-full',
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 bottom-[54px] md:bottom-0 z-[80] overflow-y-auto animate-fadeIn">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className={clsx('flex min-h-full items-center justify-center p-4', frameClassName)}>
        <div
          className={clsx(
            'relative w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl',
            'transform transition-all animate-slideIn',
            sizes[size],
            containerClassName,
          )}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className={clsx('flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700', headerClassName)}>
              {title && (
                <h3 className={clsx('text-lg font-semibold text-gray-900 dark:text-white', titleClassName)}>
                  {title}
                </h3>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className={clsx('text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700', closeButtonClassName)}
                  aria-label="Cerrar"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className={clsx('px-6 py-4', contentClassName)}>{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
