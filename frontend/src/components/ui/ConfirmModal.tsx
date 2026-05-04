/**
 * Modal de confirmación genérico.
 */
import { AlertTriangle, Trash2, HelpCircle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  isLoading?: boolean
  children?: React.ReactNode  // Contenido adicional opcional
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  isLoading = false,
  children,
}: ConfirmModalProps) {
  const icons = {
    danger: <Trash2 className="w-10 h-10 text-red-600 dark:text-red-400" />,
    warning: <AlertTriangle className="w-10 h-10 text-amber-600 dark:text-amber-400" />,
    info: <HelpCircle className="w-10 h-10 text-primary-600 dark:text-primary-400" />,
  }

  const confirmButtonClasses = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    info: 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500',
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false} size="sm">
      <div className="flex flex-col items-center text-center py-2">
        <div className="mb-4 p-3 rounded-full bg-gray-50 dark:bg-gray-700/50">
          {icons[variant]}
        </div>
        
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {title}
        </h3>
        
        <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-xs">
          {description}
        </p>
        
        {/* Contenido adicional opcional */}
        {children}

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full order-2 sm:order-1"
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            className={`w-full order-1 sm:order-2 ${confirmButtonClasses[variant]}`}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
