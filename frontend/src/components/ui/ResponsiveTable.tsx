import type { ReactNode } from 'react'

interface ResponsiveTableProps<T> {
  data: T[]
  isLoading?: boolean
  loadingRows?: number
  mobileBreakpointClassName?: string
  emptyState: ReactNode
  renderDesktop: () => ReactNode
  renderCard: (item: T, index: number) => ReactNode
}

/**
 * Wrapper responsive para mantener tabla en desktop y cards en mobile.
 */
export default function ResponsiveTable<T>({
  data,
  isLoading = false,
  loadingRows = 4,
  mobileBreakpointClassName = 'lg',
  emptyState,
  renderDesktop,
  renderCard,
}: ResponsiveTableProps<T>) {
  const mobileHidden = `hidden ${mobileBreakpointClassName}:block`
  const desktopHidden = `${mobileBreakpointClassName}:hidden`

  return (
    <>
      <div className={desktopHidden}>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: loadingRows }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>
        ) : data.length === 0 ? (
          emptyState
        ) : (
          <div className="space-y-3">{data.map((item, index) => renderCard(item, index))}</div>
        )}
      </div>

      <div className={mobileHidden}>{renderDesktop()}</div>
    </>
  )
}
