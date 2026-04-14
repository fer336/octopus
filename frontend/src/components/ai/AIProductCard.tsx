/**
 * Card de producto para el chat del Asistente IA.
 * Se muestra cuando el agente responde a consultas de precio o stock.
 * Muestra solo los campos que el usuario pidió (precio, stock, o ambos).
 */
import { Package, ShoppingCart } from 'lucide-react'
import { AIMatchedProduct } from '../../types'

interface AIProductCardProps {
  product: AIMatchedProduct & { stock?: number | null }
  showPrice?: boolean
  showStock?: boolean
  /** Callback cuando el usuario quiere crear una cotización con este producto */
  onQuote?: (product: AIMatchedProduct) => void
}

export default function AIProductCard({
  product,
  showPrice = true,
  showStock = false,
  onQuote,
}: AIProductCardProps) {
  if (!product) return null

  const hasStock = product.stock !== undefined && product.stock !== null
  const salePrice = Number(product.sale_price)
  const hasPrice = Number.isFinite(salePrice)
  const ivaRate = Number(product.iva_rate ?? 0)

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
      {/* Encabezado */}
      <div className="flex items-start gap-2 mb-2">
        <div className="p-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex-shrink-0">
          <Package size={14} className="text-primary-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate">
            {product.description}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Cód: {product.code}
          </p>
        </div>
      </div>

      {/* Datos solicitados */}
      <div className="flex items-center gap-3 mt-2">
        {showPrice && (
          <div className="flex-1">
            <p className="text-xs text-gray-400">Precio venta</p>
            {hasPrice ? (
              <>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  ${salePrice.toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  <span className="text-xs font-normal text-gray-400 ml-1">/ {product.unit}</span>
                </p>
                {ivaRate > 0 && (
                  <p className="text-xs text-gray-400">+ IVA {ivaRate}%</p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 italic">No disponible</p>
            )}
          </div>
        )}

        {showStock && (
          <div className="flex-1">
            <p className="text-xs text-gray-400">Stock</p>
            {hasStock ? (
              <p className={`text-base font-bold ${
                (product.stock ?? 0) > 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-500 dark:text-red-400'
              }`}>
                {product.stock} <span className="text-xs font-normal text-gray-400">{product.unit}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin datos</p>
            )}
          </div>
        )}
      </div>

      {/* Botón cotizar */}
      {onQuote && (
        <button
          onClick={() => onQuote(product)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-200 dark:border-primary-800 transition-colors"
        >
          <ShoppingCart size={12} />
          Cotizar este producto
        </button>
      )}
    </div>
  )
}
