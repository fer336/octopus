/**
 * Componente Pagination.
 * Muestra navegación de páginas con ellipsis para rangos grandes.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import Button from './Button'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems?: number
  itemsPerPage?: number
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage = 20,
}: PaginationProps) {
  // No mostrar si hay una sola página o menos
  if (totalPages <= 1) return null

  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems || 0)

  // Generar números de página visibles
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    // Siempre mostrar primera página
    pages.push(1)

    // Ellipsis si hay gap
    if (currentPage > 3) {
      pages.push('...')
    }

    // Páginas alrededor de la actual
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) {
        pages.push(i)
      }
    }

    // Ellipsis si hay gap
    if (currentPage < totalPages - 2) {
      pages.push('...')
    }

    // Siempre mostrar última página
    if (totalPages > 1 && !pages.includes(totalPages)) {
      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      {/* Info de items */}
      {totalItems !== undefined && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Mostrando {startItem} - {endItem} de {totalItems} resultados
        </div>
      )}

      {/* Controles de navegación */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Página anterior"
        >
          <ChevronLeft size={18} />
        </Button>

        {getPageNumbers().map((page, index) =>
          typeof page === 'number' ? (
            <Button
              key={page}
              variant={page === currentPage ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onPageChange(page)}
              className={clsx(
                'min-w-[36px]',
                page === currentPage && 'pointer-events-none'
              )}
            >
              {page}
            </Button>
          ) : (
            <span
              key={`ellipsis-${index}`}
              className="px-2 text-gray-400 dark:text-gray-500"
            >
              {page}
            </span>
          )
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Página siguiente"
        >
          <ChevronRight size={18} />
        </Button>
      </div>
    </div>
  )
}
